import mongoose from 'mongoose'
import { once } from 'node:events'
import ChatConversation from '../models/chatConversation.js'
import ChatMessage from '../models/chatMessage.js'
import Department from '../models/department.js'
import User from '../models/user.js'
import { broadcastChatEvent } from '../services/chatRealtime.js'
import { canAccessDepartmentRoom, canUsersChat } from '../services/chatAccess.js'
import { getPaginationOptions, paginateQuery } from '../utils/pagination.js'
import { serializeCsvRow } from '../utils/csv.js'
import { recordAuditEvent } from '../services/audit.js'

const CHAT_MESSAGE_LIMIT = 4000

/** Builds a safe display object without exposing account credentials or private fields. */
function safePerson(user) {
  return { id: String(user._id), name: user.name, email: user.email, role: user.role, department: user.department || null }
}

/** Confirms that the signed-in user is a participant or an authorized department administrator. */
async function getAccessibleConversation(conversationId, user) {
  if (!mongoose.isValidObjectId(conversationId)) return null
  const conversation = await ChatConversation.findById(conversationId).populate('participants', 'name email role department').populate('department', 'name').lean()
  if (!conversation) return null
  if (conversation.type === 'department' && canAccessDepartmentRoom(user, conversation.department?._id)) return conversation
  return conversation.participants.some((participant) => String(participant._id) === String(user._id)) ? conversation : null
}

/** Lists saved conversations with database pagination and unread message counts. */
export async function listChatConversations(req, res, next) {
  try {
    const options = getPaginationOptions(req.query, { defaultPageSize: 20, maxPageSize: 50 })
    const filter = req.user.role === 'admin'
      ? { $or: [{ participants: req.user._id }, { type: 'department' }] }
      : { participants: req.user._id }
    const page = await paginateQuery(
      ChatConversation.find(filter).populate('participants', 'name email role department').populate('department', 'name').populate({ path: 'lastMessage', populate: { path: 'sender', select: 'name role' } }).sort({ lastMessageAt: -1, _id: -1 }).lean(),
      ChatConversation.countDocuments(filter), options,
    )
    const conversations = await Promise.all(page.items.map(async (conversation) => {
      const unreadCount = await ChatMessage.countDocuments({ conversation: conversation._id, sender: { $ne: req.user._id }, readBy: { $ne: req.user._id } })
      return {
        id: String(conversation._id), type: conversation.type, department: conversation.department,
        participants: conversation.participants.map(safePerson), lastMessage: conversation.lastMessage,
        lastMessageAt: conversation.lastMessageAt, unreadCount,
      }
    }))
    return res.json({ conversations, pagination: page.pagination })
  } catch (error) { return next(error) }
}

/** Lists only verified colleagues whom policy permits the signed-in user to contact. */
export async function listChatContacts(req, res, next) {
  try {
    const options = getPaginationOptions(req.query, { defaultPageSize: 25, maxPageSize: 50 })
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 80) : ''
    const filter = { isVerified: true, _id: { $ne: req.user._id } }
    if (req.user.role !== 'admin' && req.user.role !== 'hr') {
      filter.$or = [{ role: { $in: ['admin', 'hr'] } }, ...(req.user.department ? [{ department: req.user.department._id || req.user.department }] : [])]
    }
    if (search) filter.$and = [{ $or: [{ name: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }, { email: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }] }]
    const page = await paginateQuery(User.find(filter).select('name email role department').populate('department', 'name').sort({ name: 1, _id: 1 }).lean(), User.countDocuments(filter), options)
    const contacts = page.items.filter((person) => canUsersChat(req.user, person)).map(safePerson)
    return res.json({ contacts, pagination: page.pagination })
  } catch (error) { return next(error) }
}

/** Opens or creates one durable direct conversation after checking both users' chat policy. */
export async function openDirectConversation(req, res, next) {
  try {
    const { userId } = req.body || {}
    if (!mongoose.isValidObjectId(userId) || String(userId) === String(req.user._id)) return res.status(400).json({ message: 'Choose a valid colleague to chat with.' })
    const recipient = await User.findOne({ _id: userId, isVerified: true }).select('name email role department').populate('department', 'name').lean()
    if (!recipient || !canUsersChat(req.user, recipient)) return res.status(403).json({ message: 'You cannot start a chat with this account.' })
    const participantIds = [String(req.user._id), String(recipient._id)].sort()
    const directKey = participantIds.join(':')
    const conversation = await ChatConversation.findOneAndUpdate(
      { directKey }, { $setOnInsert: { type: 'direct', participants: participantIds, directKey } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    ).populate('participants', 'name email role department').lean()
    return res.json({ conversation: { id: String(conversation._id), type: 'direct', participants: conversation.participants.map(safePerson), lastMessageAt: conversation.lastMessageAt, unreadCount: 0 } })
  } catch (error) { return next(error) }
}

/** Opens or creates the current user's department room; administrators may open any room. */
export async function openDepartmentConversation(req, res, next) {
  try {
    const departmentId = req.body?.departmentId
    if (!mongoose.isValidObjectId(departmentId)) return res.status(400).json({ message: 'Choose a valid department.' })
    if (!canAccessDepartmentRoom(req.user, departmentId)) return res.status(403).json({ message: 'You can only open your assigned department room.' })
    const department = await Department.findById(departmentId).select('name').lean()
    if (!department) return res.status(404).json({ message: 'Department was not found.' })
    const members = await User.find({ department: departmentId, isVerified: true }).select('_id').lean()
    const participantIds = members.map((member) => member._id)
    const conversation = await ChatConversation.findOneAndUpdate(
      { type: 'department', department: departmentId },
      { $addToSet: { participants: { $each: participantIds } } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    ).populate('participants', 'name email role department').populate('department', 'name').lean()
    return res.json({ conversation: { id: String(conversation._id), type: 'department', department: conversation.department, participants: conversation.participants.map(safePerson), lastMessageAt: conversation.lastMessageAt, unreadCount: 0 } })
  } catch (error) { return next(error) }
}

/** Returns a bounded, paginated message history without changing any state. */
export async function listChatMessages(req, res, next) {
  try {
    const conversation = await getAccessibleConversation(req.params.id, req.user)
    if (!conversation) return res.status(404).json({ message: 'Chat conversation was not found.' })
    const options = getPaginationOptions(req.query, { defaultPageSize: 40, maxPageSize: 100 })
    const filter = { conversation: conversation._id }
    const page = await paginateQuery(ChatMessage.find(filter).populate('sender', 'name role').sort({ createdAt: -1, _id: -1 }).lean(), ChatMessage.countDocuments(filter), options)
    const messages = page.items.reverse()
    return res.json({ messages, pagination: page.pagination })
  } catch (error) { return next(error) }
}

/** Streams an authorized conversation to CSV and records the export in the security audit log. */
export async function exportChatConversationCsv(req, res, next) {
  let cursor
  try {
    const conversation = await getAccessibleConversation(req.params.id, req.user)
    if (!conversation) return res.status(404).json({ message: 'Chat conversation was not found.' })
    await recordAuditEvent(req, {
      eventType: 'chat_exported',
      details: { conversationId: String(conversation._id), conversationType: conversation.type },
    })

    const safeFileType = conversation.type === 'department' ? 'department' : 'direct'
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="orbit-chat-${safeFileType}-${conversation._id}.csv"`)
    res.write('\uFEFF')
    res.write(serializeCsvRow(['sent_at_utc', 'sender_name', 'sender_email', 'sender_role', 'message']))

    cursor = ChatMessage.find({ conversation: conversation._id })
      .populate('sender', 'name email role')
      .sort({ createdAt: 1, _id: 1 })
      .lean()
      .cursor()

    for await (const message of cursor) {
      if (res.destroyed) break
      const row = serializeCsvRow([
        message.createdAt ? new Date(message.createdAt).toISOString() : '',
        message.sender?.name,
        message.sender?.email,
        message.sender?.role,
        message.body,
      ])
      if (!res.write(row)) await once(res, 'drain')
    }
    return res.end()
  } catch (error) {
    if (res.headersSent) return res.destroy(error)
    return next(error)
  } finally {
    if (cursor) await cursor.close().catch(() => {})
  }
}

/** Marks incoming conversation messages read and broadcasts the update to its other members. */
export async function markChatConversationRead(req, res, next) {
  try {
    const conversation = await getAccessibleConversation(req.params.id, req.user)
    if (!conversation) return res.status(404).json({ message: 'Chat conversation was not found.' })
    const unreadFilter = { conversation: conversation._id, sender: { $ne: req.user._id }, readBy: { $ne: req.user._id } }
    const messageSenders = await ChatMessage.distinct('sender', unreadFilter)
    const result = await ChatMessage.updateMany(
      unreadFilter,
      { $addToSet: { readBy: req.user._id, deliveredTo: req.user._id } },
    )
    if (result.modifiedCount > 0) {
      broadcastChatEvent(messageSenders, { type: 'chat:read', conversationId: String(conversation._id), readerId: String(req.user._id) })
    }
    return res.json({ conversationId: String(conversation._id), markedRead: result.modifiedCount })
  } catch (error) { return next(error) }
}

/** Validates, persists, and broadcasts a plain-text message to the conversation members. */
export async function sendChatMessage(req, res, next) {
  try {
    const conversation = await getAccessibleConversation(req.params.id, req.user)
    if (!conversation) return res.status(404).json({ message: 'Chat conversation was not found.' })
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : ''
    if (!body || body.length > CHAT_MESSAGE_LIMIT) return res.status(400).json({ message: `Messages must contain 1 to ${CHAT_MESSAGE_LIMIT} characters.` })
    const message = await ChatMessage.create({ conversation: conversation._id, sender: req.user._id, body, readBy: [req.user._id] })
    const populatedMessage = await ChatMessage.findById(message._id).populate('sender', 'name role').lean()
    const lastMessageAt = message.createdAt
    await ChatConversation.updateOne({ _id: conversation._id }, { $set: { lastMessage: message._id, lastMessageAt } })
    const participantIds = conversation.type === 'department'
      ? (await User.find({ department: conversation.department._id, isVerified: true }).select('_id').lean()).map((person) => person._id)
      : conversation.participants.map((person) => person._id)
    if (!participantIds.some((id) => String(id) === String(req.user._id))) participantIds.push(req.user._id)
    const event = { type: 'chat:message', conversationId: String(conversation._id), message: populatedMessage }
    broadcastChatEvent(participantIds, event)
    return res.status(201).json({ message: populatedMessage })
  } catch (error) { return next(error) }
}

/** Provides the compact list of departments used by the room selector. */
export async function listChatDepartments(req, res, next) {
  try {
    const filter = req.user.role === 'admin' ? {} : { _id: req.user.department?._id || req.user.department }
    const departments = await Department.find(filter).select('name').sort({ name: 1 }).lean()
    return res.json({ departments: departments.map((department) => ({ id: String(department._id), name: department.name })) })
  } catch (error) { return next(error) }
}
