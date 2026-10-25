/** Resolves sent, delivered, and seen state from the recipient acknowledgements. */
export function getChatMessageStatus(message, conversation, currentUserId) {
  const senderId = String(message.sender?._id || message.sender || '')
  if (senderId !== String(currentUserId)) return ''

  const recipientIds = (conversation.participants || [])
    .map((participant) => String(participant.id || participant._id || participant))
    .filter((participantId) => participantId !== senderId)
  if (!recipientIds.length) return 'sent'

  const deliveredTo = new Set((message.deliveredTo || []).map(String))
  const readBy = new Set((message.readBy || []).map(String))
  if (recipientIds.every((recipientId) => readBy.has(recipientId))) return 'seen'
  if (recipientIds.every((recipientId) => deliveredTo.has(recipientId))) return 'delivered'
  return 'sent'
}

/** Shows the floating alert only for another person's message outside the chat workspace. */
export function shouldShowOffPageChatNotification(currentPage, senderId, currentUserId) {
  return currentPage !== 'chat' && String(senderId) !== String(currentUserId)
}
