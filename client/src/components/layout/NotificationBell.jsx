import { useState } from 'react'
import './NotificationBell.css'

/** Turns a notification timestamp into a short, readable relative time. */
function timeAgo(value) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime())
  const minutes = Math.floor(elapsed / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(value).toLocaleDateString()
}

/** Displays the notification menu and highlights unread activity. */
export default function NotificationBell({ notifications, unreadCount, onOpen, onMarkAll }) {
  const [isOpen, setIsOpen] = useState(false)

  function openNotification(notification) {
    setIsOpen(false)
    onOpen(notification)
  }

  return <div className="notification-center">
    <button className={`notification-bell ${unreadCount ? 'has-unread' : ''}`} type="button" aria-label={unreadCount ? `${unreadCount} unread notifications` : 'Notifications'} aria-expanded={isOpen} aria-controls="notification-panel" onClick={() => setIsOpen((open) => !open)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
      {unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? '99+' : unreadCount}</span>}
    </button>
    {isOpen && <section className="notification-panel" id="notification-panel" aria-label="Notifications">
      <header className="notification-panel-heading"><div><strong>Notifications</strong><span>{unreadCount ? `${unreadCount} unread` : 'All caught up'}</span></div><button type="button" onClick={onMarkAll} disabled={!unreadCount}>Mark all read</button></header>
      <div className="notification-list">
        {notifications.length ? notifications.map((notification) => <button className={`notification-item ${notification.readAt ? '' : 'is-unread'}`} key={notification.id} type="button" onClick={() => openNotification(notification)}>
          <span className={`notification-type-icon type-${notification.type}`} aria-hidden="true">{({ task: 'T', email: '@', attendance: 'A', account: 'U', leave: 'L', system: '•' })[notification.type] || '•'}</span>
          <span className="notification-item-copy"><strong>{notification.title}</strong><span>{notification.message}</span><time dateTime={notification.createdAt}>{timeAgo(notification.createdAt)}</time></span>
          {!notification.readAt && <span className="notification-unread-dot" aria-label="Unread" />}
        </button>) : <p className="notification-empty">No notifications yet. Updates about your work will appear here.</p>}
      </div>
    </section>}
  </div>
}
