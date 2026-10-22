import Footer from '../layout/Footer.jsx'

const metrics = [
  { label: 'Total revenue', value: '$0.00', note: 'No activity yet', icon: '↗', tone: 'violet' },
  { label: 'Open orders', value: '0', note: 'Ready when you are', icon: '▧', tone: 'blue' },
  { label: 'Active customers', value: '0', note: 'Build your network', icon: '♧', tone: 'amber' },
  { label: 'Items in stock', value: '0', note: 'Add your first item', icon: '▤', tone: 'green' },
]

function MetricCard({ metric }) {
  return (
    <article className="metric-card">
      <div className="metric-heading">
        <span>{metric.label}</span>
        <span className={`metric-icon metric-${metric.tone}`} aria-hidden="true">{metric.icon}</span>
      </div>
      <strong className="metric-value">{metric.value}</strong>
      <span className="metric-note">{metric.note}</span>
    </article>
  )
}

function WelcomeBanner() {
  return (
    <section className="welcome-banner">
      <div className="banner-copy">
        <span className="banner-label">YOUR WORKSPACE IS READY</span>
        <h2>A little more room to grow.</h2>
        <p>Start by adding your first customer, order, or item to inventory.</p>
        <button className="button button-secondary" type="button" disabled>Explore your workspace <span aria-hidden="true">→</span></button>
      </div>
      <div className="banner-orbit" aria-hidden="true"><i /><i /><i /><b>✳</b><span>o</span></div>
    </section>
  )
}

function ActivityPanel() {
  return (
    <section className="activity-panel">
      <div className="panel-heading">
        <div><h2>Recent activity</h2><p>Keep up with the latest in your workspace.</p></div>
        <button className="text-button" type="button" disabled>View all <span aria-hidden="true">→</span></button>
      </div>
      <div className="empty-activity">
        <span className="empty-activity-icon" aria-hidden="true">◷</span>
        <strong>It’s quiet for now</strong>
        <p>When things happen in your workspace, you’ll see them here.</p>
      </div>
    </section>
  )
}

export default function HomePage({ user, message }) {
  const dateLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date()).toUpperCase()

  return (
    <section className="main-panel" id="overview">
      <main className="dashboard-content">
        {message && <p className="form-message error" role="alert">{message}</p>}
        <div className="page-heading">
          <div>
            <span className="eyebrow">{dateLabel}</span>
            <h1>Good to have you here, {user.name?.split(' ')[0]} <span aria-hidden="true">✳</span></h1>
            <p>Here’s what’s happening across your workspace today.</p>
          </div>
          <button className="date-filter" type="button" disabled><span aria-hidden="true">◷</span> Last 30 days <span aria-hidden="true">⌄</span></button>
        </div>

        <WelcomeBanner />

        <div className="section-heading">
          <div><h2>Workspace overview</h2><p>A shared overview of your workspace activity.</p></div>
          <button className="icon-button more-button" type="button" aria-label="More overview options" disabled>···</button>
        </div>
        <div className="metric-grid">{metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</div>
        <ActivityPanel />
      </main>
      <Footer />
    </section>
  )
}



