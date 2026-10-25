import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Pagination from '../common/Pagination.jsx'
import LoadingState from '../common/LoadingState.jsx'
import { getChatMessageStatus } from '../../services/chat.js'
import {
  getChatContacts, getChatConversations, getChatDepartments, getChatMessages,
  downloadChatConversationCsv, markChatConversationRead, openDepartmentChat, openDirectChat, sendChatMessage,
} from '../../services/api.js'
import './ChatPage.css'

/** Formats chat timestamps in the current browser locale. */
function formatMessageTime(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

/** Builds a readable title for a direct or department conversation. */
function conversationTitle(conversation, user) {
  if (conversation.type === 'department') return `${conversation.department?.name || 'Department'} team`
  return conversation.participants?.find((person) => person.id !== user.id)?.name || 'Direct chat'
}

/** Provides one role-aware workspace for direct messages and department team rooms. */
export default function ChatPage({ user }) {
  const [conversations, setConversations] = useState([])
  const [conversationPagination, setConversationPagination] = useState(null)
  const [conversationPage, setConversationPage] = useState(1)
  const [contacts, setContacts] = useState([])
  const [contactPagination, setContactPagination] = useState(null)
  const [contactPage, setContactPage] = useState(1)
  const [contactSearch, setContactSearch] = useState('')
  const [departments, setDepartments] = useState([])
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [messagePagination, setMessagePagination] = useState(null)
  const [messagePage, setMessagePage] = useState(1)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [activeDirectory, setActiveDirectory] = useState('people')
  const socketRef = useRef(null)
  const messageListRef = useRef(null)
  const receiptRefreshTimer = useRef(null)

  const refreshConversations = useCallback(async () => {
    const result = await getChatConversations({ page: conversationPage, pageSize: 20 })
    setConversations(result.conversations || [])
    setConversationPagination(result.pagination || null)
    return result.conversations || []
  }, [conversationPage])

  function refreshMessageReceipts(conversationId) {
    if (conversationId !== selectedConversation?.id) return
    window.clearTimeout(receiptRefreshTimer.current)
    receiptRefreshTimer.current = window.setTimeout(() => {
      getChatMessages(conversationId, { page: messagePage, pageSize: 40 })
        .then((result) => {
          setMessages(result.messages || [])
          setMessagePagination(result.pagination || null)
        })
        .catch(() => {})
    }, 80)
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([
      getChatConversations({ page: conversationPage, pageSize: 20 }),
      getChatContacts({ page: contactPage, pageSize: 25, search: contactSearch.trim() }),
      getChatDepartments(),
    ]).then(([chatResult, contactResult, departmentResult]) => {
      if (!active) return
      setConversations(chatResult.conversations || [])
      setConversationPagination(chatResult.pagination || null)
      setContacts(contactResult.contacts || [])
      setContactPagination(contactResult.pagination || null)
      setDepartments(departmentResult.departments || [])
      setSelectedConversation((current) => current || chatResult.conversations?.[0] || null)
      setError('')
    }).catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [conversationPage, contactPage, contactSearch])

  useEffect(() => {
    if (!selectedConversation) { setMessages([]); setMessagePagination(null); return undefined }
    let active = true
    getChatMessages(selectedConversation.id, { page: messagePage, pageSize: 40 })
      .then((result) => {
        if (!active) return
        setMessages(result.messages || [])
        setMessagePagination(result.pagination || null)
        markChatConversationRead(selectedConversation.id).then(() => {
          if (!active) return
          setConversations((items) => items.map((item) => item.id === selectedConversation.id ? { ...item, unreadCount: 0 } : item))
          refreshConversations().catch(() => {})
        }).catch(() => {})
      })
      .catch((requestError) => { if (active) setError(requestError.message) })
    return () => { active = false }
  }, [selectedConversation?.id, messagePage, refreshConversations])

  useEffect(() => {
    let reconnectTimer
    let disposed = false
    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const socket = new WebSocket(`${protocol}//${window.location.host}/api/chat/ws`)
      socketRef.current = socket
      socket.onopen = () => {
        refreshConversations().catch(() => {})
        if (selectedConversation) socket.send(JSON.stringify({ type: 'presence', conversationId: selectedConversation.id }))
        if (selectedConversation) {
          getChatMessages(selectedConversation.id, { page: messagePage, pageSize: 40 }).then((result) => {
            if (disposed) return
            setMessages(result.messages || [])
            setMessagePagination(result.pagination || null)
            markChatConversationRead(selectedConversation.id).then(() => refreshConversations().catch(() => {})).catch(() => {})
          }).catch(() => {})
        }
      }
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          if (payload.type === 'chat:read') {
            refreshConversations().catch(() => {})
            refreshMessageReceipts(payload.conversationId)
            return
          }
          if (payload.type === 'chat:receipt') {
            refreshMessageReceipts(payload.conversationId)
            return
          }
          if (payload.type !== 'chat:message') return
          refreshConversations().catch(() => {})
          if (String(payload.message.sender?._id) !== String(user.id) && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'chat:delivered', conversationId: payload.conversationId, messageId: payload.message._id }))
          }
          if (payload.conversationId !== selectedConversation?.id) return
          setMessages((current) => current.some((message) => message._id === payload.message._id) ? current : [...current, payload.message])
          markChatConversationRead(payload.conversationId).then(() => refreshConversations().catch(() => {})).catch(() => {})
        } catch { /* Ignore malformed server events; the next history load remains authoritative. */ }
      }
      socket.onclose = () => {
        if (!disposed) reconnectTimer = window.setTimeout(connect, 2500)
      }
    }
    connect()
    return () => {
      disposed = true
      window.clearTimeout(reconnectTimer)
      window.clearTimeout(receiptRefreshTimer.current)
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [selectedConversation?.id, messagePage, refreshConversations])

  useEffect(() => {
    messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, selectedConversation?.id])

  const selectedTitle = useMemo(() => selectedConversation ? conversationTitle(selectedConversation, user) : '', [selectedConversation, user])

  async function handleOpenDirect(person) {
    setError('')
    try {
      const result = await openDirectChat(person.id)
      const conversation = result.conversation
      setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)])
      setSelectedConversation(conversation)
      setMessagePage(1)
    } catch (requestError) { setError(requestError.message) }
  }

  async function handleOpenDepartment(department) {
    setError('')
    try {
      const result = await openDepartmentChat(department.id)
      const conversation = result.conversation
      setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)])
      setSelectedConversation(conversation)
      setMessagePage(1)
    } catch (requestError) { setError(requestError.message) }
  }

  async function handleSendMessage(event) {
    event.preventDefault()
    const body = draft.trim()
    if (!body || !selectedConversation || sending) return
    setSending(true)
    setError('')
    try {
      const result = await sendChatMessage(selectedConversation.id, body)
      setMessages((current) => current.some((message) => message._id === result.message._id) ? current : [...current, result.message])
      setDraft('')
      refreshConversations().catch(() => {})
    } catch (requestError) { setError(requestError.message) }
    finally { setSending(false) }
  }

  async function handleExportConversation() {
    if (!selectedConversation || exporting) return
    setExporting(true)
    setError('')
    try {
      await downloadChatConversationCsv(selectedConversation.id, selectedTitle)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setExporting(false)
    }
  }

  const totalUnread = conversations.reduce((count, conversation) => count + (conversation.unreadCount || 0), 0)

  return <main className="workspace-main chat-page">
    <header className="page-heading chat-page-heading">
      <div><span className="eyebrow">WORKSPACE MESSAGES</span><h1>Team chat</h1><p>Direct messages and department conversations in one place.</p></div>
      {totalUnread > 0 && <span className="chat-unread-summary">{totalUnread} unread</span>}
    </header>
    {error && <p className="form-message error" role="alert">{error}</p>}
    <section className="chat-workspace panel-card" aria-label="Team chat workspace">
      <aside className="chat-sidebar">
        <div className="chat-sidebar-heading"><h2>Conversations</h2><span>{conversationPagination?.totalItems || conversations.length}</span></div>
        {loading && <LoadingState label="Loading conversations" />}
        <div className="chat-conversation-list">
          {conversations.map((conversation) => <button className={`chat-conversation-item ${selectedConversation?.id === conversation.id ? 'is-selected' : ''}`} key={conversation.id} type="button" onClick={() => { setSelectedConversation(conversation); setMessagePage(1) }}>
            <span className="chat-conversation-avatar">{conversation.type === 'department' ? 'T' : conversationTitle(conversation, user).slice(0, 1).toUpperCase()}</span>
            <span className="chat-conversation-copy"><strong>{conversationTitle(conversation, user)}</strong><small>{conversation.lastMessage?.body || (conversation.type === 'department' ? 'Department room' : 'Start a conversation')}</small></span>
            {conversation.unreadCount > 0 && <span className="chat-unread-count">{conversation.unreadCount}</span>}
          </button>)}
          {!loading && conversations.length === 0 && <p className="chat-empty-note">No conversations yet. Choose a colleague or department to begin.</p>}
        </div>
        <Pagination pagination={conversationPagination} onPageChange={setConversationPage} />
        <section className="chat-directory">
          <div className="chat-directory-tabs" role="tablist" aria-label="Start a conversation">
            <button type="button" role="tab" aria-selected={activeDirectory === 'people'} className={activeDirectory === 'people' ? 'is-active' : ''} onClick={() => setActiveDirectory('people')}>People</button>
            <button type="button" role="tab" aria-selected={activeDirectory === 'teams'} className={activeDirectory === 'teams' ? 'is-active' : ''} onClick={() => setActiveDirectory('teams')}>Teams</button>
          </div>
          {activeDirectory === 'people' ? <>
            <label className="sr-only" htmlFor="chat-contact-search">Search colleagues</label>
            <input id="chat-contact-search" className="chat-search" value={contactSearch} onChange={(event) => { setContactSearch(event.target.value); setContactPage(1) }} placeholder="Search people" />
            <div className="chat-contact-list">{contacts.map((person) => <button type="button" className="chat-contact-item" key={person.id} onClick={() => handleOpenDirect(person)}><span className="chat-contact-avatar">{person.name?.[0]?.toUpperCase() || '?'}</span><span><strong>{person.name}</strong><small>{person.role.replaceAll('-', ' ')}{person.department?.name ? ` · ${person.department.name}` : ''}</small></span><span aria-hidden="true">+</span></button>)}{!loading && contacts.length === 0 && <p className="chat-empty-note">No matching colleagues.</p>}</div>
            <Pagination pagination={contactPagination} onPageChange={setContactPage} />
          </> : <div className="chat-contact-list">{departments.map((department) => <button type="button" className="chat-contact-item" key={department.id} onClick={() => handleOpenDepartment(department)}><span className="chat-contact-avatar">T</span><span><strong>{department.name}</strong><small>Department team room</small></span><span aria-hidden="true">+</span></button>)}{departments.length === 0 && <p className="chat-empty-note">No departments are available for your account.</p>}</div>}
        </section>
      </aside>

      <section className="chat-main" aria-label={selectedTitle || 'Chat messages'}>
        {selectedConversation ? <>
          <header className="chat-main-header"><span className="chat-conversation-avatar">{selectedConversation.type === 'department' ? 'T' : selectedTitle.slice(0, 1).toUpperCase()}</span><div><h2>{selectedTitle}</h2><p>{selectedConversation.type === 'department' ? `${selectedConversation.participants?.length || 0} team members` : selectedConversation.participants?.find((person) => person.id !== user.id)?.role || 'Direct message'}</p></div><button className="chat-export-button" type="button" onClick={handleExportConversation} disabled={exporting} title="Export conversation as CSV" aria-label={exporting ? 'Exporting conversation CSV' : 'Export conversation as CSV'}>{!exporting && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v3h14v-3" /></svg>}{exporting ? 'Exporting…' : 'Export CSV'}</button><span className="chat-live-indicator"><i /> Live</span></header>
          <Pagination pagination={messagePagination} onPageChange={setMessagePage} />
          <div className="chat-message-list" ref={messageListRef} aria-live="polite">
            {messages.map((message) => {
              const ownMessage = String(message.sender?._id) === String(user.id)
              const deliveryStatus = ownMessage ? getChatMessageStatus(message, selectedConversation, user.id) : ''
              const deliveryLabel = deliveryStatus === 'seen' ? 'Seen' : deliveryStatus === 'delivered' ? 'Delivered' : 'Sent'
              return <article className={`chat-message ${ownMessage ? 'is-own' : ''}`} key={message._id}><div className="chat-message-meta"><strong>{ownMessage ? 'You' : message.sender?.name || 'Colleague'}</strong><time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>{ownMessage && <span className={`chat-message-receipt receipt-${deliveryStatus}`} title={deliveryLabel} aria-label={deliveryLabel}>{deliveryStatus === 'sent' ? '✓' : '✓✓'}</span>}</div><p>{message.body}</p></article>
            })}
            {messages.length === 0 && <div className="chat-empty-state"><span>✦</span><h3>Start the conversation</h3><p>Messages are visible only to members of this chat.</p></div>}
          </div>
          <form className="chat-composer" onSubmit={handleSendMessage}><label className="sr-only" htmlFor="chat-message-draft">Write a message</label><textarea id="chat-message-draft" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={`Message ${selectedTitle}`} rows="1" maxLength="4000" required onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form.requestSubmit() } }} /><span className="chat-character-count">{draft.length}/4000</span><button className="button button-primary" type="submit" disabled={sending || !draft.trim()}>{sending ? 'Sending…' : 'Send'}</button></form>
        </> : <div className="chat-empty-state chat-welcome-state"><span>✦</span><h2>Your team conversations</h2><p>Choose a colleague for a direct message or open a department room.</p></div>}
      </section>
    </section>
  </main>
}
