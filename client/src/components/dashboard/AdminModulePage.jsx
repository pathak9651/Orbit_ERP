import Footer from '../layout/Footer.jsx'

// Human-readable labels and descriptions for administrator-only ERP modules.
const sections = {
  users: {
    title: 'User management',
    description: 'Manage employee accounts, roles, and access to the ERP workspace.',
    next: 'User records and role assignment workflows.',
  },
  tasks: {
    title: 'Task management',
    description: 'Organize work, assign tasks, and track progress across the team.',
    next: 'Task creation, assignment, and status tracking.',
  },
  attendance: {
    title: 'Attendance management',
    description: 'Review attendance records and monitor team schedules.',
    next: 'Attendance records, check-in workflows, and summaries.',
  },
  housekeeping: {
    title: 'Housekeeping management',
    description: 'Coordinate housekeeping work and monitor service requests.',
    next: 'Housekeeping assignments and completion tracking.',
  },
  billing: {
    title: 'Bills and invoices',
    description: 'Manage billing records, invoices, and payment status.',
    next: 'Invoice creation, billing records, and payment tracking.',
  },
  revenue: {
    title: 'Revenue management',
    description: 'Review revenue activity and financial performance.',
    next: 'Revenue records, summaries, and reporting.',
  },
  reports: {
    title: 'Reports',
    description: 'Review operational and financial reports for your workspace.',
    next: 'Report views and export workflows.',
  },
}

/** Shows the placeholder landing content for an administrator module. */
export default function AdminModulePage({ section }) {
  const details = sections[section]
  if (!details) return null

  return (
    <section className="main-panel">
      <main className="dashboard-content admin-module-content">
        <div className="page-heading">
          <div>
            <span className="eyebrow">ADMINISTRATION</span>
            <h1>{details.title}</h1>
            <p>{details.description}</p>
          </div>
        </div>
        <section className="panel-card module-placeholder">
          <span className="module-placeholder-icon" aria-hidden="true">{section.slice(0, 2).toUpperCase()}</span>
          <div>
            <h2>{details.title} workspace</h2>
            <p>This admin section is ready for its management tools and connected records.</p>
            <span className="module-next-step">Planned area: {details.next}</span>
          </div>
        </section>
      </main>
      <Footer />
    </section>
  )
}
