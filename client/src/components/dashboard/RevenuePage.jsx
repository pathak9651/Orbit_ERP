import { useEffect, useState } from 'react'
import Footer from '../layout/Footer.jsx'
import Pagination from '../common/Pagination.jsx'
import { createRevenueTransaction, deleteRevenueTransaction, downloadRevenueCsv, getRevenue, updateRevenueTransaction } from '../../services/api.js'

const today = () => new Date().toISOString().slice(0, 10)
const EMPTY_FORM = { transactionType: 'income', category: '', amount: '', transactionDate: today(), status: 'cleared', paymentMethod: 'bank-transfer', counterparty: '', reference: '', description: '' }
const TYPES = [
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
  { value: 'refund', label: 'Refund' },
  { value: 'transfer', label: 'Transfer' },
]
const PERIODS = [
  { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' }, { value: 'yearly', label: 'Yearly' },
]
const CURRENCY = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
const NUMBER = new Intl.NumberFormat()

function transactionTypeLabel(type) {
  return TYPES.find((option) => option.value === type)?.label || type
}

/** Compares cleared income, expenses, and refunds by day or month using an SVG bar chart. */
function RevenueTrendChart({ data }) {
  const width = 850
  const height = 250
  const left = 54
  const right = 14
  const top = 20
  const bottom = 38
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const maximum = Math.max(1, ...data.flatMap((point) => [point.income, point.expense, point.refund]))
  const slotWidth = plotWidth / Math.max(data.length, 1)
  const barWidth = Math.max(2, Math.min(12, slotWidth * 0.19))
  const skipLabel = data.length > 20 ? 4 : data.length > 12 ? 2 : 1
  const series = [{ key: 'income', label: 'Income', color: 'income' }, { key: 'expense', label: 'Expenses', color: 'expense' }, { key: 'refund', label: 'Refunds', color: 'refund' }]

  return <section className="panel-card revenue-chart-card">
    <div className="section-heading"><div><h2>Income and expenditure trend</h2><p>Cleared ledger transactions in the selected period</p></div></div>
    <div className="revenue-chart-legend">{series.map((item) => <span key={item.key}><i className={`revenue-legend-dot ${item.color}`} />{item.label}</span>)}</div>
    <div className="revenue-chart-scroll"><svg viewBox={`0 0 ${width} ${height}`} className="revenue-chart" role="img" aria-label="Income, expense, and refund amounts over the selected period">
      {[0, 0.5, 1].map((ratio) => {
        const y = top + plotHeight * (1 - ratio)
        return <g key={ratio}><line x1={left} x2={width - right} y1={y} y2={y} className="revenue-chart-grid" /><text x={left - 8} y={y + 4} textAnchor="end" className="revenue-chart-label">{CURRENCY.format(maximum * ratio)}</text></g>
      })}
      {data.map((point, index) => {
        const xSlot = left + index * slotWidth
        return <g key={point.dateKey}>
          {series.map((item, seriesIndex) => {
            const amount = point[item.key]
            const barHeight = amount / maximum * plotHeight
            const x = xSlot + slotWidth / 2 + (seriesIndex - 1) * (barWidth + 2) - barWidth / 2
            const y = top + plotHeight - barHeight
            return <rect key={item.key} x={x} y={y} width={barWidth} height={Math.max(amount ? 2 : 0, barHeight)} rx="2" className={`revenue-chart-bar ${item.color}`}><title>{point.label} · {item.label}: {CURRENCY.format(amount)}</title></rect>
          })}
          {(index % skipLabel === 0 || index === data.length - 1) && <text x={xSlot + slotWidth / 2} y={height - 12} textAnchor="middle" className="revenue-chart-label">{point.label}</text>}
        </g>
      })}
    </svg></div>
  </section>
}

/** Displays the admin finance ledger, calculated earnings, expenditure, and transaction trends. */
export default function RevenuePage() {
  const [period, setPeriod] = useState('monthly')
  const [asOfDate, setAsOfDate] = useState('')
  const [page, setPage] = useState(1)
  const [transactionType, setTransactionType] = useState('all')
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [report, setReport] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState('')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      getRevenue({ page, period, ...(asOfDate ? { asOfDate } : {}), transactionType, status, search })
        .then((result) => { if (active) { setReport(result); setError('') } })
        .catch((loadError) => { if (active) setError(loadError.message || 'Could not load the revenue ledger.') })
        .finally(() => { if (active) setLoading(false) })
    }, search ? 250 : 0)
    return () => { active = false; window.clearTimeout(timer) }
  }, [page, period, asOfDate, transactionType, status, search, refreshKey])

  function openCreateForm() {
    setEditingId('')
    setForm(EMPTY_FORM)
    setError('')
    setNotice('')
    setIsFormOpen(true)
  }

  function openEditForm(transaction) {
    setEditingId(transaction.id)
    setForm({ transactionType: transaction.transactionType, category: transaction.category, amount: String(transaction.amount), transactionDate: transaction.transactionDate, status: transaction.status, paymentMethod: transaction.paymentMethod, counterparty: transaction.counterparty || '', reference: transaction.reference || '', description: transaction.description || '' })
    setError('')
    setNotice('')
    setIsFormOpen(true)
  }

  async function saveTransaction(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    const details = { ...form, amount: Number(form.amount) }
    try {
      if (editingId) await updateRevenueTransaction(editingId, details)
      else await createRevenueTransaction(details)
      setIsFormOpen(false)
      setEditingId('')
      setForm(EMPTY_FORM)
      setNotice(editingId ? 'Transaction updated.' : 'Transaction recorded.')
      setPage(1)
      setRefreshKey((value) => value + 1)
    } catch (saveError) { setError(saveError.message || 'Could not save this transaction.') }
    finally { setBusy(false) }
  }

  async function removeTransaction(transaction) {
    if (!window.confirm(`Delete this ${transactionTypeLabel(transaction.transactionType).toLowerCase()} of ${CURRENCY.format(transaction.amount)}?`)) return
    setError('')
    setNotice('')
    try {
      await deleteRevenueTransaction(transaction.id)
      setNotice('Transaction deleted.')
      setPage(1)
      setRefreshKey((value) => value + 1)
    } catch (deleteError) { setError(deleteError.message || 'Could not delete the transaction.') }
  }

  async function exportLedger() {
    setExporting(true)
    setError('')
    try { await downloadRevenueCsv({ period, ...(asOfDate ? { asOfDate } : {}) }) }
    catch (exportError) { setError(exportError.message || 'Could not export this ledger.') }
    finally { setExporting(false) }
  }

  function updateForm(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const summary = report?.summary || {}
  const invoiceStatus = report?.invoiceStatus || {}

  return <section className="main-panel revenue-page">
    <main className="dashboard-content">
      <div className="page-heading revenue-heading">
        <div><span className="eyebrow">ADMINISTRATION</span><h1>Revenue and expenditure</h1><p>Record company income, expenses, refunds, and transfers to calculate net earnings.</p></div>
        <div className="revenue-heading-actions"><button className="button button-secondary" type="button" onClick={exportLedger} disabled={exporting}>{exporting ? 'Preparing CSV…' : 'Download CSV'}</button><button className="button button-primary" type="button" onClick={openCreateForm}>Record transaction</button></div>
      </div>

      <div className="revenue-controls">
        <label>Reporting period<select value={period} onChange={(event) => { setPeriod(event.target.value); setPage(1) }}>{PERIODS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label>Period date<input type="date" max={today()} value={asOfDate} onChange={(event) => { setAsOfDate(event.target.value); setPage(1) }} /></label>
        {asOfDate && <button className="text-button" type="button" onClick={() => { setAsOfDate(''); setPage(1) }}>Current period</button>}
        {report?.period && <span className="revenue-date-range">{report.period.startDate} – {report.period.endDate} · UTC</span>}
      </div>

      {notice && <p className="form-success revenue-message" role="status">{notice}</p>}
      {error && <p className="form-error revenue-message" role="alert">{error}</p>}

      <section className="revenue-kpis">
        <article className="panel-card revenue-income-card"><span>Income received</span><strong>{CURRENCY.format(summary.income || 0)}</strong><small>Cleared income transactions</small></article>
        <article className="panel-card revenue-expense-card"><span>Expenditure</span><strong>{CURRENCY.format(summary.expenditure || 0)}</strong><small>{CURRENCY.format(summary.expense || 0)} expenses + {CURRENCY.format(summary.refund || 0)} refunds</small></article>
        <article className="panel-card revenue-earnings-card"><span>Net earnings</span><strong>{CURRENCY.format(summary.netEarnings || 0)}</strong><small>Income less expenses and refunds</small></article>
        <article className="panel-card"><span>Pending transactions</span><strong>{NUMBER.format(summary.pendingCount || 0)}</strong><small>{CURRENCY.format(summary.pending || 0)} not included in cleared totals</small></article>
      </section>

      <div className="revenue-invoice-note"><strong>Invoice status is separate from recorded income.</strong><span>Marking an invoice paid does not create a ledger transaction. Record the payment here once it is actually received to avoid counting it twice.</span></div>
      <section className="revenue-invoice-summary" aria-label="Invoice status context">
        <article className="panel-card"><span>Paid invoice status</span><strong>{CURRENCY.format(invoiceStatus.paid?.total || 0)}</strong><small>{NUMBER.format(invoiceStatus.paid?.count || 0)} invoices marked paid</small></article>
        <article className="panel-card"><span>Outstanding invoice status</span><strong>{CURRENCY.format((invoiceStatus.sent?.total || 0) + (invoiceStatus.overdue?.total || 0))}</strong><small>{NUMBER.format((invoiceStatus.sent?.count || 0) + (invoiceStatus.overdue?.count || 0))} sent or overdue</small></article>
      </section>

      <RevenueTrendChart data={report?.trends || []} />

      {isFormOpen && <section className="panel-card revenue-form-card">
        <div className="section-heading"><div><h2>{editingId ? 'Edit transaction' : 'Record a transaction'}</h2><p>Amounts in INR. Only cleared income, expenses, and refunds affect earnings.</p></div><button className="text-button" type="button" onClick={() => setIsFormOpen(false)}>Cancel</button></div>
        <form className="revenue-form" onSubmit={saveTransaction}>
          <label>Transaction type<select name="transactionType" value={form.transactionType} onChange={updateForm}>{TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label>Category<input name="category" value={form.category} onChange={updateForm} required minLength="2" maxLength="60" placeholder="Sales, payroll, rent, refund…" list="revenue-category-options" /><datalist id="revenue-category-options">{(report?.categories || []).filter((row) => row.transactionType === form.transactionType).map((row) => <option key={row.category} value={row.category} />)}</datalist></label>
          <label>Amount (INR)<input name="amount" type="number" value={form.amount} onChange={updateForm} required min="0.01" max="1000000000000" step="0.01" /></label>
          <label>Transaction date<input name="transactionDate" type="date" value={form.transactionDate} max={today()} onChange={updateForm} required /></label>
          <label>Ledger status<select name="status" value={form.status} onChange={updateForm}><option value="cleared">Cleared</option><option value="pending">Pending</option><option value="voided">Voided</option></select></label>
          <label>Payment method<select name="paymentMethod" value={form.paymentMethod} onChange={updateForm}><option value="bank-transfer">Bank transfer</option><option value="upi">UPI</option><option value="card">Card</option><option value="cash">Cash</option><option value="cheque">Cheque</option><option value="other">Other</option></select></label>
          <label>Customer or vendor<input name="counterparty" value={form.counterparty} onChange={updateForm} maxLength="120" /></label>
          <label>Invoice or transaction reference<input name="reference" value={form.reference} onChange={updateForm} maxLength="100" /></label>
          <label className="revenue-description-field">Description<textarea name="description" value={form.description} onChange={updateForm} rows="3" maxLength="1000" /></label>
          <div className="revenue-form-actions"><button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : editingId ? 'Save transaction' : 'Record transaction'}</button></div>
        </form>
      </section>}

      <section className="panel-card revenue-ledger-card">
        <div className="section-heading"><div><h2>Transaction ledger</h2><p>{report?.pagination?.totalItems ?? 0} records in this period · current view is server-paginated</p></div><button className="text-button" type="button" onClick={() => setRefreshKey((value) => value + 1)}>Refresh</button></div>
        <div className="revenue-ledger-filters">
          <label>Search<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Category, party, reference…" /></label>
          <label>Transaction type<select value={transactionType} onChange={(event) => { setTransactionType(event.target.value); setPage(1) }}><option value="all">All types</option>{TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label>Status<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option value="all">All statuses</option><option value="cleared">Cleared</option><option value="pending">Pending</option><option value="voided">Voided</option></select></label>
        </div>
        {loading && !report ? <p className="user-table-state">Loading transactions…</p> : !report?.transactions?.length ? <p className="user-table-state">No transactions are recorded for this period. Record income and expenses to start calculating net earnings.</p> : <div className="revenue-table-wrap"><table className="revenue-table"><thead><tr><th>Date</th><th>Type / Category</th><th>Party / Reference</th><th>Amount</th><th>Method</th><th>Status</th><th>Actions</th></tr></thead><tbody>{report.transactions.map((transaction) => <tr key={transaction.id}>
          <td data-label="Date">{transaction.transactionDate}</td>
          <td data-label="Type / Category"><span className={`revenue-type-pill type-${transaction.transactionType}`}>{transactionTypeLabel(transaction.transactionType)}</span><small>{transaction.category}</small></td>
          <td data-label="Party / Reference">{transaction.counterparty || '—'}<small>{transaction.reference || transaction.description || 'No reference'}</small></td>
          <td data-label="Amount"><strong>{CURRENCY.format(transaction.amount)}</strong></td>
          <td data-label="Method">{transaction.paymentMethod.replaceAll('-', ' ')}</td>
          <td data-label="Status"><span className={`revenue-status-pill status-${transaction.status}`}>{transaction.status}</span></td>
          <td data-label="Actions"><div className="revenue-row-actions"><button className="text-button" type="button" onClick={() => openEditForm(transaction)}>Edit</button><button className="text-button revenue-delete-action" type="button" onClick={() => removeTransaction(transaction)}>Delete</button></div></td>
        </tr>)}</tbody></table></div>}
        <Pagination pagination={report?.pagination} onPageChange={setPage} disabled={loading} />
      </section>

      <section className="panel-card revenue-category-card"><div className="section-heading"><div><h2>Cleared totals by category</h2><p>Actual cleared ledger amounts for this period</p></div></div>{!report?.categories?.length ? <p>No cleared category totals yet.</p> : <div className="revenue-category-list">{report.categories.map((category) => <div className="revenue-category-row" key={`${category.transactionType}:${category.category}`}><span><i className={`revenue-legend-dot ${category.transactionType}`} />{category.category}<small>{transactionTypeLabel(category.transactionType)} · {category.count} records</small></span><strong>{CURRENCY.format(category.amount)}</strong></div>)}</div>}</section>
    </main>
    <Footer />
  </section>
}
