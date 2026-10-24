import { useCallback, useEffect, useMemo, useState } from 'react'
import Footer from '../layout/Footer.jsx'
import { createInvoice, downloadInvoicePdf, emailInvoice as sendInvoiceEmail, getInvoices, updateInvoiceStatus } from '../../services/api.js'
import './BillingPage.css'

// These status transitions mirror the server's invoice lifecycle rules.
const transitions = {
  draft: ['sent', 'cancelled'],
  sent: ['paid', 'overdue', 'cancelled'],
  overdue: ['paid', 'cancelled'],
  paid: [],
  cancelled: [],
}
// Keep internal invoice status keys separate from labels shown to users.
const statusLabels = { draft: 'Draft', sent: 'Sent', paid: 'Paid', overdue: 'Overdue', cancelled: 'Cancelled' }
// Use one locale-aware formatter for invoice totals and line item amounts.
const currency = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })

/** Supplies a practical default due date for a new invoice. */
function dueDateDefault() {
  const due = new Date()
  due.setDate(due.getDate() + 14)
  return due.toISOString().slice(0, 10)
}

/** Formats a due date at midday to avoid shifting its calendar day across timezones. */
function formatDate(value) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(`${String(value).slice(0, 10)}T12:00:00`)) : '—'
}

/** Creates a fresh invoice draft without sharing mutable form state. */
function emptyForm() {
  return { customerName: '', customerEmail: '', dueDate: dueDateDefault(), status: 'sent', notes: '', items: [{ description: '', quantity: '1', unitPrice: '' }] }
}

/** Lists invoices and supports creation, status changes, PDF download, and email. */
export default function BillingPage({ user }) {
  const [invoices, setInvoices] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [busyInvoice, setBusyInvoice] = useState('')
  const [busyEmail, setBusyEmail] = useState('')
  const [busyDownload, setBusyDownload] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const result = await getInvoices()
      setInvoices(result.invoices || [])
    } catch (requestError) { setError(requestError.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return invoices.filter((invoice) => (statusFilter === 'all' || invoice.status === statusFilter)
      && (!query || `${invoice.invoiceNumber} ${invoice.customerName} ${invoice.customerEmail}`.toLowerCase().includes(query)))
  }, [invoices, search, statusFilter])
  const totals = useMemo(() => invoices.reduce((summary, invoice) => {
    if (invoice.status === 'paid') summary.paid += invoice.total
    if (['sent', 'overdue'].includes(invoice.status)) summary.outstanding += invoice.total
    if (invoice.status === 'overdue') summary.overdue += 1
    return summary
  }, { paid: 0, outstanding: 0, overdue: 0 }), [invoices])
  const estimate = useMemo(() => Math.round(form.items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0) * 100) / 100, [form.items])

  function updateItem(index, field, value) {
    setForm((current) => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) }))
  }

  function addItem() {
    setForm((current) => current.items.length >= 10 ? current : { ...current, items: [...current.items, { description: '', quantity: '1', unitPrice: '' }] })
  }

  async function submit(event) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      const details = { ...form, items: form.items.map((item) => ({ ...item, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice) })) }
      const result = await createInvoice(details)
      setForm(emptyForm())
      await load()
      setNotice(`${result.message} Invoice ${result.invoice.invoiceNumber}.`)
      try { await downloadInvoicePdf(result.invoice.id, result.invoice.invoiceNumber) }
      catch (downloadError) { setError(`Invoice created. ${downloadError.message}`) }
    } catch (requestError) { setError(requestError.message) }
    finally { setBusy(false) }
  }

  async function changeStatus(invoice, status) {
    setBusyInvoice(invoice.id); setError(''); setNotice('')
    try {
      const result = await updateInvoiceStatus(invoice.id, status)
      setNotice(result.message)
      await load()
    } catch (requestError) { setError(requestError.message) }
    finally { setBusyInvoice('') }
  }

  async function sendAgain(invoice) {
    setBusyEmail(invoice.id); setError(''); setNotice('')
    try {
      const result = await sendInvoiceEmail(invoice.id)
      setNotice(result.message)
      await load()
    } catch (requestError) { setError(requestError.message) }
    finally { setBusyEmail('') }
  }

  async function download(invoice) {
    setBusyDownload(invoice.id); setError('')
    try { await downloadInvoicePdf(invoice.id, invoice.invoiceNumber) }
    catch (requestError) { setError(requestError.message) }
    finally { setBusyDownload('') }
  }

  return <section className="main-panel"><main className="dashboard-content billing-page">
    <div className="page-heading"><div><span className="eyebrow">FINANCE</span><h1>Bills and invoices</h1><p>Create invoices and follow payment status across the organization.</p></div></div>
    {error && <p className="form-message error" role="alert">{error}</p>}{notice && <p className="form-message success" role="status">{notice}</p>}

    <section className="billing-summary" aria-label="Invoice totals">
      <article className="panel-card billing-summary-card"><span>Outstanding</span><strong>{currency.format(totals.outstanding)}</strong><small>Sent and overdue invoices</small></article>
      <article className="panel-card billing-summary-card"><span>Paid</span><strong>{currency.format(totals.paid)}</strong><small>Recorded paid invoices</small></article>
      <article className="panel-card billing-summary-card"><span>Overdue invoices</span><strong>{totals.overdue}</strong><small>Awaiting payment past due</small></article>
    </section>

    <section className="panel-card billing-form-card"><div className="section-heading"><div><h2>Create invoice</h2><p>Add a customer, at least one line item, and a due date.</p></div></div>
      <form className="billing-form" onSubmit={submit}>
        <label className="field-label">Customer or company<input required minLength="2" maxLength="120" value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} placeholder="Customer name" /></label>
        <label className="field-label">Customer email {form.status === 'sent' ? <span className="billing-optional">required to send</span> : <span className="billing-optional">optional for draft</span>}<input type="email" required={form.status === 'sent'} maxLength="254" value={form.customerEmail} onChange={(event) => setForm({ ...form, customerEmail: event.target.value })} placeholder="billing@example.com" /></label>
        <label className="field-label">Due date<input type="date" required value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></label>
        <label className="field-label">Initial status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="sent">Send invoice</option><option value="draft">Save as draft</option></select></label>
        <div className="billing-items-field"><div className="billing-items-heading"><strong>Line items</strong><button className="text-button" type="button" onClick={addItem} disabled={form.items.length >= 10}>Add item</button></div>
          {form.items.map((item, index) => <div className="billing-item-row" key={index}>
            <label className="field-label">Description<input required minLength="2" maxLength="160" value={item.description} onChange={(event) => updateItem(index, 'description', event.target.value)} placeholder="Service or product" /></label>
            <label className="field-label">Qty<input type="number" required min="0.01" max="100000" step="0.01" value={item.quantity} onChange={(event) => updateItem(index, 'quantity', event.target.value)} /></label>
            <label className="field-label">Unit price (₹)<input type="number" required min="0" max="100000000" step="0.01" value={item.unitPrice} onChange={(event) => updateItem(index, 'unitPrice', event.target.value)} placeholder="0.00" /></label>
            {form.items.length > 1 && <button className="billing-remove-item" type="button" onClick={() => setForm((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))} aria-label={`Remove item ${index + 1}`}>Remove</button>}
          </div>)}
        </div>
        <label className="field-label billing-notes-field">Notes on invoice <span className="billing-optional">optional</span><textarea rows="2" maxLength="1000" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Payment terms or a message for the customer" /></label>
        <div className="billing-form-footer"><span>Invoice total <strong>{currency.format(estimate)}</strong></span><button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : form.status === 'draft' ? 'Save draft' : 'Create invoice'}</button></div>
      </form>
    </section>

    <section className="panel-card billing-list-card"><div className="section-heading"><div><h2>Invoice register</h2><p>{filtered.length} of {invoices.length} invoices</p></div><button className="text-button" type="button" onClick={load}>Refresh</button></div>
      <div className="billing-filters"><label className="field-label">Search<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Invoice number or customer" /></label><label className="field-label">Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
      {loading ? <p className="user-table-state">Loading invoices…</p> : filtered.length ? <div className="attendance-table-wrap"><table className="work-table billing-table"><thead><tr><th>Invoice</th><th>Customer</th><th>Due date</th><th>Total</th><th>Status</th><th>Created by</th><th>Update</th></tr></thead><tbody>{filtered.map((invoice) => <tr key={invoice.id}>
        <td><details className="billing-invoice-details"><summary><strong>{invoice.invoiceNumber}</strong></summary><div className="billing-invoice-popover"><strong>{invoice.customerName}</strong>{invoice.items.map((item, index) => <span key={`${item.description}-${index}`}>{item.description} · {item.quantity} × {currency.format(item.unitPrice)} = {currency.format(item.lineTotal)}</span>)}{invoice.notes && <p>{invoice.notes}</p>}<small>Status history</small>{invoice.statusHistory.map((entry, index) => <span key={`${entry.status}-${index}`}>{statusLabels[entry.status]} · {entry.actorName || 'User'} · {formatDate(entry.changedAt)}</span>)}</div></details><small>{formatDate(invoice.createdAt)}</small><button className="billing-download-button" type="button" onClick={() => download(invoice)} disabled={busyDownload === invoice.id}>{busyDownload === invoice.id ? 'Preparing PDF…' : 'Download PDF'}</button></td><td><strong>{invoice.customerName}</strong><small>{invoice.customerEmail || 'No email provided'}</small></td><td>{formatDate(invoice.dueDate)}</td><td><strong>{currency.format(invoice.total)}</strong></td><td><span className={`billing-status status-${invoice.status}`}>{statusLabels[invoice.status]}</span><small className={`billing-email-status ${invoice.emailStatus}`}>{invoice.emailStatus === 'sent' ? 'Email sent' : invoice.emailStatus === 'failed' ? 'Email failed' : invoice.emailStatus === 'pending' ? 'Email pending' : 'Not emailed'}</small></td><td>{invoice.createdBy?.name || 'Unknown'}</td><td className="billing-actions-cell">{invoice.customerEmail && ['sent', 'overdue'].includes(invoice.status) && <button className="billing-email-button" type="button" onClick={() => sendAgain(invoice)} disabled={busyEmail === invoice.id}>{busyEmail === invoice.id ? 'Sending…' : invoice.emailStatus === 'sent' ? 'Send again' : 'Email PDF'}</button>}{transitions[invoice.status]?.length ? <select className="billing-status-select" aria-label={`Update ${invoice.invoiceNumber} status`} value="" disabled={busyInvoice === invoice.id} onChange={(event) => changeStatus(invoice, event.target.value)}><option value="">Update…</option>{transitions[invoice.status].map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}</select> : <span className="billing-terminal-status">—</span>}</td>
      </tr>)}</tbody></table></div> : <p className="user-table-state">{invoices.length ? 'No invoices match these filters.' : 'No invoices yet. Create one above to start the register.'}</p>}
    </section>
  </main><Footer /></section>
}
