import Footer from '../layout/Footer.jsx'

const platformAreas = [
  { title: 'People and teams', description: 'Manage employee accounts, roles, departments, and team communication.' },
  { title: 'Daily operations', description: 'Coordinate tasks, attendance, leave requests, meetings, and office events.' },
  { title: 'Business records', description: 'Keep company documents, invoices, and workspace activity in one place.' },
]

/** Introduces Orbit ERP and summarizes the company workspace features available here. */
export default function AboutPage() {
  return (
    <section className="main-panel">
      <main className="dashboard-content about-content">
        <div className="page-heading">
          <div>
            <span className="eyebrow">ABOUT ORBIT</span>
            <h1>One workspace for your business</h1>
            <p>Orbit ERP brings your company’s people, daily work, and business records together in one organized workspace.</p>
          </div>
        </div>

        <section className="panel-card about-intro">
          <span className="about-mark" aria-hidden="true">O</span>
          <div>
            <h2>About Orbit ERP</h2>
            <p>Orbit is a role-aware company management platform. It gives each team access to the tools and information they need, while administrators manage shared settings and company operations.</p>
          </div>
        </section>

        <section className="about-areas" aria-label="Orbit ERP platform areas">
          {platformAreas.map((area) => (
            <article className="panel-card about-area-card" key={area.title}>
              <h2>{area.title}</h2>
              <p>{area.description}</p>
            </article>
          ))}
        </section>
      </main>
      <Footer />
    </section>
  )
}
