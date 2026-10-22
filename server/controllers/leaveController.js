import mongoose from 'mongoose'
import LeaveRequest from '../models/leaveRequest.js'
import User from '../models/user.js'
import { notifyUsers } from '../services/notifications.js'

const validDateKey = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
const populateLeave = (query) => query
  .populate('requester', 'name email role department isVerified')
  .populate('department', 'name')
  .populate('history.actor', 'name role')

async function firstStageFor(user) {
  if (user.role === 'admin') return 'hr'
  if (user.role === 'hr' || user.role === 'manager') return user.role === 'manager' ? 'hr' : 'admin'
  if (!user.department) return 'hr'
  const managerExists = await User.exists({ role: 'manager', department: user.department?._id || user.department, isVerified: { $ne: false } })
  return managerExists ? 'manager' : 'hr'
}

export async function listLeaveRequests(req, res, next) {
  try {
    const ownFilter = { requester: req.user._id }
    const queueFilter = { status: 'pending', currentStage: req.user.role, requester: { $ne: req.user._id } }
    if (req.user.role === 'manager') {
      queueFilter.department = req.user.department?._id || req.user.department || null
    } else if (!['hr', 'admin'].includes(req.user.role)) {
      return res.json({ requests: await populateLeave(LeaveRequest.find(ownFilter).sort({ createdAt: -1 })) })
    }
    const [mine, queue] = await Promise.all([
      populateLeave(LeaveRequest.find(ownFilter).sort({ createdAt: -1 })),
      populateLeave(LeaveRequest.find(queueFilter).sort({ createdAt: 1 })),
    ])
    return res.json({ requests: mine, queue })
  } catch (error) { return next(error) }
}

export async function createLeaveRequest(req, res, next) {
  const { leaveType, startDate, endDate } = req.body || {}
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : ''
  if (!['annual', 'sick', 'personal', 'unpaid'].includes(leaveType)) return res.status(400).json({ message: 'Select a valid leave type.' })
  if (!validDateKey(startDate) || !validDateKey(endDate) || endDate < startDate) return res.status(400).json({ message: 'Enter a valid date range.' })
  if (reason.length < 3 || reason.length > 1000) return res.status(400).json({ message: 'Reason must be between 3 and 1,000 characters.' })
  const todayParts = new Intl.DateTimeFormat('en', { timeZone: process.env.APP_TIME_ZONE || 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const todayValues = Object.fromEntries(todayParts.map(({ type, value }) => [type, value]))
  const today = `${todayValues.year}-${todayValues.month}-${todayValues.day}`
  if (startDate < today) return res.status(400).json({ message: 'Leave requests must start today or later.' })

  try {
    const overlap = await LeaveRequest.exists({ requester: req.user._id, status: { $in: ['pending', 'approved'] }, startDate: { $lte: endDate }, endDate: { $gte: startDate } })
    if (overlap) return res.status(409).json({ message: 'You already have a pending or approved request for dates that overlap this range.' })
    const stage = await firstStageFor(req.user)
    const request = await LeaveRequest.create({
      requester: req.user._id,
      department: req.user.department?._id || req.user.department || null,
      leaveType,
      startDate,
      endDate,
      reason,
      currentStage: stage,
      history: [{ actor: req.user._id, actorRole: req.user.role, action: 'submitted', message: `Submitted for ${stage} review.` }],
    })
    await notifyUsers([req.user._id], {
      type: 'leave', title: 'Leave request submitted', message: `Your ${leaveType} leave request for ${startDate} to ${endDate} is awaiting ${stage} review.`,
      page: 'leaves', entityId: String(request._id),
    })
    const reviewerFilter = { role: stage, isVerified: { $ne: false } }
    if (stage === 'manager') reviewerFilter.department = req.user.department?._id || req.user.department
    const reviewers = await User.find(reviewerFilter).distinct('_id')
    await notifyUsers(reviewers, {
      actorId: req.user._id, actorName: req.user.name, type: 'leave', title: 'Leave request needs review',
      message: `${req.user.name} submitted a ${leaveType} leave request for ${startDate} to ${endDate}.`, page: 'leaves', entityId: String(request._id),
    })
    return res.status(201).json({ request: await populateLeave(LeaveRequest.findById(request._id)), message: `Leave request sent for ${stage} review.` })
  } catch (error) { return next(error) }
}

export async function actOnLeaveRequest(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid leave request ID.' })
  const { action } = req.body || {}
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
  if (!['forward', 'approve', 'reject'].includes(action)) return res.status(400).json({ message: 'Choose a valid leave action.' })
  if (message.length > 1000) return res.status(400).json({ message: 'Message must be 1,000 characters or fewer.' })
  if ((action === 'forward' || action === 'reject') && message.length < 3) return res.status(400).json({ message: 'Add a suggestion or decision message before continuing.' })

  try {
    const request = await LeaveRequest.findById(req.params.id)
    if (!request) return res.status(404).json({ message: 'Leave request not found.' })
    if (request.status !== 'pending') return res.status(409).json({ message: 'This leave request has already been decided.' })
    if (request.requester.equals(req.user._id)) return res.status(403).json({ message: 'You cannot review your own leave request.' })

    if (action === 'forward') {
      if (!['manager', 'hr'].includes(req.user.role) || request.currentStage !== req.user.role) {
        return res.status(403).json({ message: 'Only the current manager or HR reviewer can forward this request.' })
      }
      if (req.user.role === 'manager' && (!req.user.department || String(request.department) !== String(req.user.department._id || req.user.department))) {
        return res.status(403).json({ message: 'Managers can review leave requests only for their department.' })
      }
      request.currentStage = req.user.role === 'manager' ? 'hr' : 'admin'
      request.history.push({ actor: req.user._id, actorRole: req.user.role, action: 'forwarded', message })
    } else {
      if (req.user.role !== 'admin' || request.currentStage !== 'admin') {
        return res.status(403).json({ message: 'Only an admin can make the final leave decision.' })
      }
      if (action === 'reject' && message.length < 3) return res.status(400).json({ message: 'Add a reason before rejecting this request.' })
      request.status = action === 'approve' ? 'approved' : 'rejected'
      request.currentStage = null
      request.history.push({ actor: req.user._id, actorRole: req.user.role, action: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : action, message })
    }
    await request.save()
    if (action === 'forward') {
      const stageName = request.currentStage === 'admin' ? 'administrator' : request.currentStage.toUpperCase()
      await notifyUsers([request.requester], {
        actorId: req.user._id, actorName: req.user.name, type: 'leave', title: 'Leave request forwarded',
        message: `${req.user.name} forwarded your leave request to ${stageName}. ${message}`,
        page: 'leaves', entityId: String(request._id),
      })
      const nextReviewerFilter = { role: request.currentStage, isVerified: { $ne: false } }
      if (request.currentStage === 'manager') nextReviewerFilter.department = request.department
      const nextReviewers = await User.find(nextReviewerFilter).distinct('_id')
      await notifyUsers(nextReviewers, {
        actorId: req.user._id, actorName: req.user.name, type: 'leave', title: 'Leave request needs review',
        message: `${req.user.name} forwarded a leave request for ${request.startDate} to ${request.endDate}. ${message}`,
        page: 'leaves', entityId: String(request._id),
      })
    } else {
      await notifyUsers([request.requester], {
        actorId: req.user._id, actorName: req.user.name, type: 'leave', title: `Leave request ${action === 'approve' ? 'approved' : 'rejected'}`,
        message: `${req.user.name} ${action === 'approve' ? 'approved' : 'rejected'} your leave request.${message ? ` ${message}` : ''}`,
        page: 'leaves', entityId: String(request._id),
      })
    }
    return res.json({ request: await populateLeave(LeaveRequest.findById(request._id)), message: action === 'forward' ? 'Leave request forwarded.' : action === 'approve' ? 'Leave request approved.' : 'Leave request rejected.' })
  } catch (error) { return next(error) }
}





export async function listAdminApprovedLeaves(req, res, next) {
  const month = typeof req.query.month === 'string' ? req.query.month : ''
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return res.status(400).json({ message: 'Choose a valid month in YYYY-MM format.' })
  }

  try {
    const monthStart = `${month}-01`
    const lastDay = new Date(`${monthStart}T00:00:00.000Z`)
    lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0)
    const monthEnd = lastDay.toISOString().slice(0, 10)
    const records = await populateLeave(LeaveRequest.find({
      status: 'approved',
      startDate: { $lte: monthEnd },
      endDate: { $gte: monthStart },
    }).sort({ startDate: 1, createdAt: 1 }))
    return res.json({ month, records })
  } catch (error) { return next(error) }
}
