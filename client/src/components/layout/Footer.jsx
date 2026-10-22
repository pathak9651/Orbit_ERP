export default function Footer() {
  return (
    <footer className="app-footer">
      <span className="footer-brand"><span className="footer-status" aria-hidden="true" />Orbit ERP</span>
      <span>© {new Date().getFullYear()} Orbit ERP. All rights reserved.</span>
      <a href="mailto:support@orbit.example">Help & support</a>
    </footer>
  )
}
