import mongoose from 'mongoose'
import Notification from '../models/notification.js'

export async function listNotifications(req, res, next) {
  try {
    const recipient = req.user._id
    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ recipient }).sort({ createdAt: -1 }).limit(40).lean(),
      Notification.countDocuments({ recipient, readAt: null }),
    ])
    return res.json({ unreadCount, notifications: notifications.map((item) => ({
      id: String(item._id), type: item.type, title: item.title, message: item.message,
      page: item.page, entityId: item.entityId, actorName: item.actorName,
      readAt: item.readAt, createdAt: item.createdAt,
    })) })
  } catch (error) { return next(error) }
}

export async function markNotificationRead(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid notification ID.' })
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id, readAt: null },
      { $set: { readAt: new Date() } },
      { returnDocument: 'after' },
    )
    if (!notification) {
      const exists = await Notification.exists({ _id: req.params.id, recipient: req.user._id })
      if (!exists) return res.status(404).json({ message: 'Notification not found.' })
    }
    return res.json({ message: 'Notification marked as read.' })
  } catch (error) { return next(error) }
}

export async function markAllNotificationsRead(req, res, next) {
  try {
    await Notification.updateMany({ recipient: req.user._id, readAt: null }, { $set: { readAt: new Date() } })
    return res.json({ message: 'All notifications marked as read.' })
  } catch (error) { return next(error) }
}
