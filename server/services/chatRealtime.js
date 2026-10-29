import { createHash } from 'node:crypto'
import { WebSocketServer, WebSocket } from 'ws'
import User from '../models/user.js'
import ImpersonationSession from '../models/impersonationSession.js'
import ChatConversation from '../models/chatConversation.js'
import ChatMessage from '../models/chatMessage.js'
import { recordAuditEvent } from './audit.js'
import { canAccessDepartmentRoom, getConversationAccessFilter } from './chatAccess.js'
import { IMPERSONATION_COOKIE, TOKEN_COOKIE, getSessionRejectionReason, isTokenVersionCurrent, verifyAccessToken } from './auth.js'

const connectedClients = new Map()
const trustedDevelopmentOrigins = new Set(['http://localhost:5173', 'http://127.0.0.1:5173'])

/** Matches browser origins against the same exact frontend origin configuration as the API. */
function isTrustedOrigin(origin) {
  const configured = process.env.CLIENT_ORIGIN
    ? process.env.CLIENT_ORIGIN.split(',').map((value) => value.trim())
    : process.env.NODE_ENV === 'production' ? [] : [...trustedDevelopmentOrigins]
  return configured.includes(origin)
}

/** Reads the HTTP-only session cookie from a WebSocket upgrade request. */
function readCookie(request, name) {
  const cookieHeader = request.headers.cookie || ''
  const value = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
  return value ? decodeURIComponent(value.slice(name.length + 1)) : ''
}

/** Sends a JSON event only to currently connected members of a conversation. */
export function broadcastChatEvent(participantIds, event) {
  const payload = JSON.stringify(event)
  for (const participantId of participantIds.map(String)) {
    for (const socket of connectedClients.get(participantId) || []) {
      if (socket.readyState === WebSocket.OPEN) socket.send(payload)
    }
  }
}

/** Attaches an authenticated WebSocket endpoint to the existing HTTP server. */
export function attachChatWebSocket(server) {
  const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 8192 })

  server.on('upgrade', async (request, socket, head) => {
    const requestUrl = new URL(request.url || '/', 'http://localhost')
    if (requestUrl.pathname !== '/api/chat/ws') return
    const origin = request.headers.origin
    if (!origin || !isTrustedOrigin(origin)) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return }

    try {
      const impersonationToken = readCookie(request, IMPERSONATION_COOKIE)
      const token = impersonationToken || readCookie(request, TOKEN_COOKIE)
      if (!token) throw new Error('missing-session')
      const payload = verifyAccessToken(token)
      const user = await User.findById(payload.sub).select('name email role department isVerified tokenVersion').lean()
      if (getSessionRejectionReason(payload, user)) throw new Error('invalid-session')
      if (payload.impersonation) {
        const claims = payload.impersonation
        const sessionIdHash = createHash('sha256').update(String(claims.sessionId || '')).digest('hex')
        const [session, administrator] = await Promise.all([
          ImpersonationSession.findOne({ sessionIdHash, administrator: claims.actorId, targetUser: user._id, revokedAt: null, expiresAt: { $gt: new Date() } }).lean(),
          User.findById(claims.actorId).select('role isVerified tokenVersion').lean(),
        ])
        if (!session || !administrator || administrator.role !== 'admin' || administrator.isVerified === false || !isTokenVersionCurrent({ tokenVersion: claims.actorTokenVersion }, administrator.tokenVersion)) throw new Error('invalid-impersonation')
        request.chatImpersonation = { actorId: administrator._id, sessionIdHash, actorTokenVersion: claims.actorTokenVersion, reason: session.reason }
      }
      request.chatUser = user
      request.chatPayload = payload
      webSocketServer.handleUpgrade(request, socket, head, (client) => webSocketServer.emit('connection', client, request))
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
    }
  })

  webSocketServer.on('connection', (socket, request) => {
    const userId = String(request.chatUser._id)
    const sockets = connectedClients.get(userId) || new Set()
    sockets.add(socket)
    connectedClients.set(userId, sockets)
    const sessionCheck = setInterval(async () => {
      try {
        const currentUser = await User.findById(userId).select('isVerified tokenVersion').lean()
        if (getSessionRejectionReason(request.chatPayload, currentUser)) socket.close(1008, 'Session expired')
        if (request.chatImpersonation) {
          const [session, administrator] = await Promise.all([
            ImpersonationSession.findOne({ sessionIdHash: request.chatImpersonation.sessionIdHash, revokedAt: null, expiresAt: { $gt: new Date() } }).select('_id').lean(),
            User.findById(request.chatImpersonation.actorId).select('role isVerified tokenVersion').lean(),
          ])
          if (!session || !administrator || administrator.role !== 'admin' || administrator.isVerified === false || !isTokenVersionCurrent({ tokenVersion: request.chatImpersonation.actorTokenVersion }, administrator.tokenVersion)) socket.close(1008, 'Impersonation expired')
        }
      } catch { socket.close(1011, 'Session check failed') }
    }, 60_000)
    socket.on('close', () => {
      clearInterval(sessionCheck)
      sockets.delete(socket)
      if (!sockets.size) connectedClients.delete(userId)
    })
    socket.on('message', async (rawMessage) => {
      try {
        const event = JSON.parse(rawMessage.toString())
        if (event.type === 'chat:delivered' && event.messageId && event.conversationId) {
          if (!/^[a-f\d]{24}$/i.test(event.conversationId) || !/^[a-f\d]{24}$/i.test(event.messageId)) return
          const conversation = await ChatConversation.findOne({ _id: event.conversationId, ...getConversationAccessFilter(request.chatUser) }).select('type participants department').lean()
          if (!conversation) return
          const isMember = conversation.participants.some((participantId) => String(participantId) === userId)
          if (!(isMember || (conversation.type === 'department' && canAccessDepartmentRoom(request.chatUser, conversation.department)))) return
          const message = await ChatMessage.findOneAndUpdate(
            { _id: event.messageId, conversation: conversation._id, sender: { $ne: request.chatUser._id }, deliveredTo: { $ne: request.chatUser._id } },
            { $addToSet: { deliveredTo: request.chatUser._id } },
            { returnDocument: 'after' },
          ).select('sender deliveredTo').lean()
          if (!message) return
          if (request.chatImpersonation) {
            await recordAuditEvent({
              user: request.chatUser,
              auth: { actorId: request.chatImpersonation.actorId, isImpersonating: true },
              ip: request.socket.remoteAddress,
              get: (header) => request.headers[String(header).toLowerCase()],
            }, { eventType: 'impersonated_action', targetUser: request.chatUser._id, details: { impersonationReason: request.chatImpersonation.reason, requestMethod: 'WS', requestPath: '/api/chat/ws:chat:delivered' } })
          }
          broadcastChatEvent([message.sender], { type: 'chat:receipt', conversationId: String(conversation._id), messageId: String(event.messageId), recipientId: userId })
          return
        }
        if (event.type === 'presence') {
          const conversation = await ChatConversation.findOne({ _id: event.conversationId, participants: request.chatUser._id }).select('_id').lean()
          if (conversation) socket.send(JSON.stringify({ type: 'presence:joined', conversationId: String(conversation._id) }))
        }
      } catch { socket.send(JSON.stringify({ type: 'error', message: 'Invalid chat event.' })) }
    })
  })

  return webSocketServer
}
