import { useCallback, useEffect, useState } from 'react'
import { readSheet } from 'read-excel-file/browser'
import Footer from '../layout/Footer.jsx'
import LoadingState from '../common/LoadingState.jsx'
import Pagination from '../common/Pagination.jsx'
import { createAdminCustomer, deleteAdminCustomer, downloadAdminCustomersCsv, getAdminCustomers, importAdminCustomers, updateAdminCustomer } from '../../services/api.js'
import { validateClientForm, validateSpreadsheetFile } from '../../services/validation.js'

const emptyCustomer = { name: '', company: '', email: '', phone: '', address: '', status: 'lead', source: '', notes: '' }
const statusLabel = { lead: 'Lead', prospect: 'Prospect', customer: 'Customer', inactive: 'Inactive' }

/** Gives administrators paginated customer management, Excel import, and CSV export tools. */
export default function CustomerManagementPage() {
  const [customers, setCustomers] = useState([])
  const [pagination, setPagination] = useState(null)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [form, setForm] = useState(emptyCustomer)
  const [editingId, setEditingId] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [rowErrors, setRowErrors] = useState([])

  const loadCustomers = useCallback(async () => {
    setError('')
    try {
      const result = await getAdminCustomers({ page, search, status })
      setCustomers(result.customers || [])
      setPagination(result.pagination)
    } catch (requestError) { setError(requestError.message) }
    finally { setLoading(false) }
  }, [page, search, status])

  useEffect(() => { loadCustomers() }, [loadCustomers])

  async function submitCustomer(event) {
    event.preventDefault()
    const validationMessage = validateClientForm('crmCustomer', form)
    if (validationMessage) { setError(validationMessage); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const result = editingId ? await updateAdminCustomer(editingId, form) : await createAdminCustomer(form)
      setForm(emptyCustomer)
      setEditingId('')
      setShowForm(false)
      setNotice(editingId ? `${result.customer.name} was updated.` : `${result.customer.name} was added to CRM.`)
      setPage(1)
      if (page === 1) await loadCustomers()
    } catch (requestError) { setError(requestError.message) }
    finally { setBusy(false) }
  }

  function startEditing(customer) {
    setForm({ name: customer.name || '', company: customer.company || '', email: customer.email || '', phone: customer.phone || '', address: customer.address || '', status: customer.status || 'lead', source: customer.source || '', notes: customer.notes || '' })
    setEditingId(customer.id)
    setShowForm(true)
    setError('')
    setNotice('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function removeCustomer(customer) {
    if (!window.confirm(`Delete ${customer.name} from CRM? This cannot be undone.`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      await deleteAdminCustomer(customer.id)
      setNotice(`${customer.name} was deleted.`)
      if (customers.length === 1 && page > 1) setPage((current) => current - 1)
      else await loadCustomers()
    } catch (requestError) { setError(requestError.message) }
    finally { setBusy(false) }
  }

  async function importSpreadsheet(event) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    setBusy(true); setError(''); setNotice(''); setRowErrors([])
    try {
      const fileError = await validateSpreadsheetFile(file)
      if (fileError) throw new Error(fileError)
      const [headers, ...rows] = await readSheet(file)
      if (!headers?.length) throw new Error('The worksheet needs a header row.')
      const normalizedHeaders = headers.map((header) => String(header ?? '').trim())
      const customerRows = rows.filter((row) => row.some((value) => String(value ?? '').trim()))
        .map((row) => Object.fromEntries(normalizedHeaders.map((header, index) => [header, row[index] == null ? '' : String(row[index])])) )
      if (!customerRows.length) throw new Error('The first worksheet has no customer rows.')
      if (customerRows.length > 100) throw new Error('Import up to 100 customers at a time.')
      const result = await importAdminCustomers(customerRows)
      setRowErrors(result.rowErrors || [])
      setNotice(`Imported ${result.createdCount} customer${result.createdCount === 1 ? '' : 's'}${result.failedCount ? `; ${result.failedCount} row${result.failedCount === 1 ? '' : 's'} need review` : '.'}`)
      setPage(1)
      await loadCustomers()
    } catch (requestError) { setError(requestError.message || 'Could not read this spreadsheet.') }
    finally { input.value = ''; setBusy(false) }
  }

  async function exportCustomers() {
    setExporting(true); setError(''); setNotice('')
    try { await downloadAdminCustomersCsv(); setNotice('CRM customer CSV downloaded.') }
    catch (requestError) { setError(requestError.message) }
    finally { setExporting(false) }
  }

  function toggleCustomerForm() {
    if (showForm || editingId) {
      setShowForm(false)
      setEditingId('')
      setForm(emptyCustomer)
      return
    }
    setShowForm(true)
  }

  return <section className="main-panel"><main className="dashboard-content work-page-content crm-page">
    <div className="page-heading"><div><span className="eyebrow">ADMINISTRATION</span><h1>CRM customers</h1><p>Keep customer contacts and relationship details organized in one place.</p></div>
      <div className="crm-actions"><span className="user-count">{pagination?.totalItems ?? customers.length} customers</span>
        <button className="button button-primary" type="button" onClick={toggleCustomerForm}>{showForm ? 'Cancel' : 'Add customer'}</button>
        <button className="button button-secondary" type="button" onClick={() => setShowImport((visible) => !visible)}>{showImport ? 'Hide import' : 'Import Excel'}</button>
        <button className="button button-secondary" type="button" onClick={exportCustomers} disabled={exporting}>{exporting ? 'Preparing CSV…' : 'Export CSV'}</button>
      </div>
    </div>
    {error && <p className="form-message error" role="alert">{error}</p>}{notice && <p className="form-message success" role="status">{notice}</p>}
    {rowErrors.length > 0 && <section className="panel-card admin-import-errors" aria-label="Customer spreadsheet import errors"><h2>Rows to review</h2><ul>{rowErrors.map((item, index) => <li key={`${item.row}-${index}`}><strong>Row {item.row}:</strong> {item.message}</li>)}</ul></section>}
    {showForm && <form className="panel-card crm-form" onSubmit={submitCustomer}><div className="section-heading"><div><h2>{editingId ? 'Edit customer' : 'Add customer'}</h2><p>Email or phone is required. Other contact and relationship details are optional.</p></div><button className="text-button" type="button" onClick={() => { setShowForm(false); setEditingId(''); setForm(emptyCustomer) }}>Cancel</button></div>
      <div className="crm-form-grid">
        <label className="field-label">Customer name<input required minLength="2" maxLength="100" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label className="field-label">Company<input maxLength="120" value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} /></label>
        <label className="field-label">Email<input type="email" maxLength="254" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        <label className="field-label">Phone<input type="tel" maxLength="30" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
        <label className="field-label">Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="lead">Lead</option><option value="prospect">Prospect</option><option value="customer">Customer</option><option value="inactive">Inactive</option></select></label>
        <label className="field-label">Source<input maxLength="80" placeholder="Referral, website…" value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} /></label>
        <label className="field-label crm-wide">Address<input maxLength="500" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>
        <label className="field-label crm-wide">Notes<textarea rows="3" maxLength="2000" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
      </div><button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : editingId ? 'Save changes' : 'Save customer'}</button>
    </form>}
    {showImport && <section className="panel-card crm-import"><div className="section-heading"><div><h2>Import customers from Excel</h2><p>Upload an .xlsx workbook with up to 100 customers in its first sheet.</p></div></div>
      <label className="field-label">Excel workbook (.xlsx)<input type="file" accept=".xlsx" disabled={busy} onChange={importSpreadsheet} /></label>
      <p className="admin-import-help">Use headers: <code>name</code>, <code>company</code>, <code>email</code>, <code>phone</code>, <code>address</code>, <code>status</code>, <code>source</code>, and <code>notes</code>. Each row needs a name and at least an email or phone.</p>
      {busy && <p className="admin-import-progress" role="status">Reading and importing customers…</p>}
    </section>}
    <section className="panel-card crm-list"><div className="section-heading"><div><h2>Customer records</h2><p>{pagination?.totalItems ?? customers.length} records</p></div><button className="text-button" type="button" onClick={loadCustomers}>Refresh</button></div>
      <form className="crm-filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchInput.trim()) }}>
        <label className="field-label">Search customers<input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Name, company, email, or phone" /></label>
        <label className="field-label">Status<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option value="">All statuses</option>{Object.entries(statusLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <button className="button button-secondary" type="submit">Search</button>
      </form>
      {loading ? <LoadingState label="Loading customer records" /> : customers.length === 0 ? <p className="user-table-state">No CRM customers found.</p> : <div className="user-table-scroll crm-table-scroll"><table className="user-table crm-table"><thead><tr><th>Customer</th><th>Contact</th><th>Status</th><th>Source</th><th>Added</th><th>Actions</th></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id}>
        <td data-label="Customer"><strong>{customer.name}</strong><small>{customer.company || 'Individual'}</small></td>
        <td data-label="Contact"><strong>{customer.email || '—'}</strong><small>{customer.phone || '—'}</small></td>
        <td data-label="Status"><span className={`crm-status crm-status-${customer.status}`}>{statusLabel[customer.status] || customer.status}</span></td>
        <td data-label="Source">{customer.source || '—'}</td>
        <td data-label="Added">{customer.createdAt ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(customer.createdAt)) : '—'}</td>
        <td data-label="Actions"><div className="crm-row-actions"><button className="text-button" type="button" onClick={() => startEditing(customer)} disabled={busy}>Edit</button><button className="text-button crm-delete-button" type="button" onClick={() => removeCustomer(customer)} disabled={busy}>Delete</button></div></td>
      </tr>)}</tbody></table></div>}
      <Pagination pagination={pagination} onPageChange={setPage} disabled={loading} />
    </section>
  </main><Footer /></section>
}
