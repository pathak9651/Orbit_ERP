import { useEffect, useState } from 'react'
import Footer from '../layout/Footer.jsx'
import Pagination from '../common/Pagination.jsx'
import { createInventoryItem, deleteInventoryItem, getInventory, updateInventoryItem } from '../../services/api.js'

const EMPTY_FORM = { name: '', category: '', sku: '', quantity: 0, reorderLevel: 5, unit: 'units', location: '', supplier: '', description: '' }

/** Presents office inventory, current availability, and items that need reordering. */
export default function InventoryManagementPage() {
  const [items, setItems] = useState([])
  const [summary, setSummary] = useState({ totalItems: 0, lowStockItems: 0, outOfStockItems: 0 })
  const [categories, setCategories] = useState([])
  const [pagination, setPagination] = useState(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('all')
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState('')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(async () => {
      setIsLoading(true)
      try {
        const result = await getInventory({ page, search, category, status })
        if (!active) return
        setItems(result.items || [])
        setSummary(result.summary || { totalItems: 0, lowStockItems: 0, outOfStockItems: 0 })
        setCategories(result.categories || [])
        setPagination(result.pagination || null)
        setError('')
      } catch (loadError) {
        if (active) setError(loadError.message || 'Could not load office inventory.')
      } finally { if (active) setIsLoading(false) }
    }, search ? 250 : 0)
    return () => { active = false; window.clearTimeout(timer) }
  }, [page, search, category, status, refreshKey])

  function startCreate() {
    setEditingId('')
    setForm(EMPTY_FORM)
    setError('')
    setNotice('')
    setIsFormOpen(true)
  }

  function startEdit(item) {
    setEditingId(item.id)
    setForm({ name: item.name, category: item.category, sku: item.sku || '', quantity: item.quantity, reorderLevel: item.reorderLevel, unit: item.unit || 'units', location: item.location || '', supplier: item.supplier || '', description: item.description || '' })
    setError('')
    setNotice('')
    setIsFormOpen(true)
  }

  async function saveItem(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    const details = { ...form, quantity: Number(form.quantity), reorderLevel: Number(form.reorderLevel) }
    try {
      if (editingId) await updateInventoryItem(editingId, details)
      else await createInventoryItem(details)
      setIsFormOpen(false)
      setForm(EMPTY_FORM)
      setEditingId('')
      setNotice(editingId ? 'Inventory item updated.' : 'Inventory item added.')
      if (page !== 1) setPage(1)
      else setRefreshKey((current) => current + 1)
    } catch (saveError) { setError(saveError.message || 'Could not save the inventory item.') }
    finally { setBusy(false) }
  }

  async function removeItem(item) {
    if (!window.confirm(`Delete ${item.name} from office inventory?`)) return
    setError('')
    setNotice('')
    try {
      await deleteInventoryItem(item.id)
      setNotice(`${item.name} was deleted.`)
      setRefreshKey((current) => current + 1)
    } catch (deleteError) { setError(deleteError.message || 'Could not delete the inventory item.') }
  }

  function updateField(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  return <section className="main-panel inventory-page">
    <main className="dashboard-content">
      <div className="page-heading inventory-heading">
        <div><span className="eyebrow">ADMINISTRATION</span><h1>Inventory management</h1><p>Track office supplies, availability, storage locations, and items that need reordering.</p></div>
        <button className="button button-primary" type="button" onClick={startCreate}>Add inventory item</button>
      </div>

      <div className="inventory-summary" aria-label="Inventory summary">
        <article className="panel-card"><span>Total items</span><strong>{summary.totalItems}</strong><small>Tracked office supplies</small></article>
        <article className="panel-card inventory-summary-warning"><span>Running low</span><strong>{summary.lowStockItems}</strong><small>At or below reorder level</small></article>
        <article className="panel-card inventory-summary-critical"><span>Out of stock</span><strong>{summary.outOfStockItems}</strong><small>Needs replenishment</small></article>
      </div>

      {notice && <p className="form-success inventory-message" role="status">{notice}</p>}
      {error && <p className="form-error inventory-message" role="alert">{error}</p>}

      {isFormOpen && <section className="panel-card inventory-form-card">
        <div className="section-heading"><div><h2>{editingId ? 'Edit inventory item' : 'Add inventory item'}</h2><p>Keep quantities and reorder levels current to receive useful alerts.</p></div><button className="text-button" type="button" onClick={() => setIsFormOpen(false)}>Cancel</button></div>
        <form className="inventory-form" onSubmit={saveItem}>
          <label>Item name<input name="name" value={form.name} onChange={updateField} required minLength="2" maxLength="120" /></label>
          <label>Category<input name="category" value={form.category} onChange={updateField} required minLength="2" maxLength="80" placeholder="Stationery, IT, Pantry…" /></label>
          <label>SKU<input name="sku" value={form.sku} onChange={updateField} maxLength="40" /></label>
          <label>Available quantity<input name="quantity" type="number" min="0" max="1000000" step="1" value={form.quantity} onChange={updateField} required /></label>
          <label>Reorder level<input name="reorderLevel" type="number" min="0" max="1000000" step="1" value={form.reorderLevel} onChange={updateField} required /></label>
          <label>Unit<input name="unit" value={form.unit} onChange={updateField} required maxLength="30" placeholder="boxes, pieces…" /></label>
          <label>Office location<input name="location" value={form.location} onChange={updateField} maxLength="120" placeholder="Floor, room, cabinet…" /></label>
          <label>Supplier<input name="supplier" value={form.supplier} onChange={updateField} maxLength="120" /></label>
          <label className="inventory-description-field">Description<textarea name="description" value={form.description} onChange={updateField} maxLength="1000" rows="3" /></label>
          <div className="inventory-form-actions"><button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : editingId ? 'Save item' : 'Add item'}</button></div>
        </form>
      </section>}

      <section className="panel-card inventory-list-card">
        <div className="section-heading"><div><h2>Office stock</h2><p>{pagination?.totalItems ?? items.length} inventory records</p></div><button className="text-button" type="button" onClick={() => setRefreshKey((current) => current + 1)}>Refresh</button></div>
        <div className="inventory-filters">
          <label className="inventory-search">Search inventory<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Item, SKU, supplier, location…" /></label>
          <label>Category<select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1) }}><option value="">All categories</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>Availability<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option value="all">All stock</option><option value="in-stock">In stock</option><option value="low-stock">Running low</option><option value="out-of-stock">Out of stock</option></select></label>
        </div>
        {isLoading ? <p className="user-table-state">Loading inventory…</p> : items.length === 0 ? <p className="user-table-state">No inventory items match these filters. Add an item to start tracking office stock.</p> : <div className="inventory-table-wrap"><table className="inventory-table"><thead><tr><th>Item</th><th>Category / SKU</th><th>Available</th><th>Reorder at</th><th>Location</th><th>Supplier</th><th>Status</th><th>Actions</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}>
          <td data-label="Item"><strong>{item.name}</strong>{item.description && <small>{item.description}</small>}</td>
          <td data-label="Category / SKU">{item.category}<small>{item.sku || 'No SKU'}</small></td>
          <td data-label="Available"><strong>{item.quantity}</strong> {item.unit}</td>
          <td data-label="Reorder at">{item.reorderLevel} {item.unit}</td>
          <td data-label="Location">{item.location || '—'}</td>
          <td data-label="Supplier">{item.supplier || '—'}</td>
          <td data-label="Status"><span className={`inventory-stock-badge status-${item.stockStatus}`}>{item.stockStatus === 'out-of-stock' ? 'Out of stock' : item.stockStatus === 'low-stock' ? 'Running low' : 'Available'}</span></td>
          <td data-label="Actions"><div className="inventory-actions"><button className="text-button" type="button" onClick={() => startEdit(item)}>Edit</button><button className="text-button inventory-delete" type="button" onClick={() => removeItem(item)}>Delete</button></div></td>
        </tr>)}</tbody></table></div>}
        <Pagination pagination={pagination} onPageChange={setPage} disabled={isLoading} />
      </section>
    </main>
    <Footer />
  </section>
}
