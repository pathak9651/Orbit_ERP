import Notification from '../models/notification.js'

/** Creates in-app notifications for unique recipients while excluding the actor. */
export async function notifyUsers(userIds, { actorId = null, actorName = '', type = 'system', title, message, page = 'overview', entityId = '' }) {
  const recipients = [...new Set((userIds || []).filter(Boolean).map(String))]
    .filter((id) => !actorId || id !== String(actorId))
  if (!recipients.length) return
  try {
    await Notification.insertMany(recipients.map((recipient) => ({
      recipient, actor: actorId, actorName: String(actorName).slice(0, 80), type,
      title: String(title).slice(0, 120), message: String(message).slice(0, 500),
      page: String(page).slice(0, 40), entityId: String(entityId).slice(0, 100),
    })), { ordered: false })
  } catch (error) {
    console.error('Could not persist ERP notifications:', error.message)
  }
}
