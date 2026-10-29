import InventoryItem from '../models/inventoryItem.js'
import Notification from '../models/notification.js'
import User from '../models/user.js'
import { recordAuditEvent } from '../services/audit.js'
import { getPaginationOptions, paginateQuery } from '../utils/pagination.js'

const INVENTORY_STATUSES = new Set(['all', 'in-stock', 'low-stock', 'out-of-stock'])

/** Trims and validates inventory fields shared by item creation and edits. */
export function validateInventoryItem(source = {}) {
  const item = {
    name: typeof source.name === 'string' ? source.name.trim() : '',
    category: typeof source.category === 'string' ? source.category.trim() : '',
    sku: typeof source.sku === 'string' ? source.sku.trim().toUpperCase() : '',
    quantity: source.quantity,
    reorderLevel: source.reorderLevel,
    unit: typeof source.unit === 'string' ? source.unit.trim() : '',
    location: typeof source.location === 'string' ? source.location.trim() : '',
    supplier: typeof source.supplier === 'string' ? source.supplier.trim() : '',
    description: typeof source.description === 'string' ? source.description.trim() : '',
  }
  const issues = []
  if (item.name.length < 2 || item.name.length > 120) issues.push('Item name must be between 2 and 120 characters.')
  if (item.category.length < 2 || item.category.length > 80) issues.push('Category must be between 2 and 80 characters.')
  if (item.sku.length > 40) issues.push('SKU must be 40 characters or fewer.')
  for (const [label, value] of [['Quantity', item.quantity], ['Reorder level', item.reorderLevel]]) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 1000000) issues.push(`${label} must be a whole number from 0 to 1,000,000.`)
  }
  if (item.unit.length < 1 || item.unit.length > 30) issues.push('Unit must be between 1 and 30 characters.')
  if (item.location.length > 120 || item.supplier.length > 120 || item.description.length > 1000) issues.push('Location, supplier, or description exceeds the allowed length.')
  return { item, issues }
}

/** Notifies administrators when an item first reaches or drops below its reorder level. */
async function notifyIfStockIsLow(req, item, wasLow) {
  const isLow = item.quantity <= item.reorderLevel
  if (!isLow || wasLow) return
  const admins = await User.find({ role: 'admin', isVerified: true }).select('_id').lean()
  if (!admins.length) return
  try {
    await Notification.insertMany(admins.map(({ _id }) => ({
      recipient: _id,
      actor: req.user._id,
      actorName: req.user.name,
      type: 'inventory',
      title: item.quantity === 0 ? 'Inventory item out of stock' : 'Inventory stock running low',
      message: `${item.name} has ${item.quantity} ${item.unit} remaining; reorder level is ${item.reorderLevel}.`,
      page: 'inventory',
      entityId: String(item._id),
    })), { ordered: false })
  } catch (error) { console.error('Could not create inventory stock notification:', error.message) }
}

/** Lists searchable inventory records with stock status and server-side pagination. */
export async function listInventory(req, res, next) {
  try {
    const filter = {}
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : ''
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : 'all'
    if (!INVENTORY_STATUSES.has(status)) return res.status(400).json({ message: 'Choose a valid inventory status filter.' })
    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      filter.$or = ['name', 'category', 'sku', 'location', 'supplier'].map((field) => ({ [field]: new RegExp(safeSearch, 'i') }))
    }
    if (category) filter.category = category
    if (status === 'out-of-stock') filter.quantity = 0
    if (status === 'low-stock') filter.$expr = { $and: [{ $gt: ['$quantity', 0] }, { $lte: ['$quantity', '$reorderLevel'] }] }
    if (status === 'in-stock') filter.$expr = { $gt: ['$quantity', '$reorderLevel'] }

    const paginationOptions = getPaginationOptions(req.query)
    const results = await paginateQuery(InventoryItem.find(filter).sort({ category: 1, name: 1 }).lean(), InventoryItem.countDocuments(filter), paginationOptions)
    const [totalItems, lowStockItems, outOfStockItems, categories] = await Promise.all([
      InventoryItem.countDocuments(),
      InventoryItem.countDocuments({ $expr: { $and: [{ $gt: ['$quantity', 0] }, { $lte: ['$quantity', '$reorderLevel'] }] } }),
      InventoryItem.countDocuments({ quantity: 0 }),
      InventoryItem.distinct('category'),
    ])
    return res.json({ items: results.items.map((item) => ({ ...item, id: String(item._id), stockStatus: item.quantity === 0 ? 'out-of-stock' : item.quantity <= item.reorderLevel ? 'low-stock' : 'in-stock' })), pagination: results.pagination, summary: { totalItems, lowStockItems, outOfStockItems }, categories: categories.sort((a, b) => a.localeCompare(b)) })
  } catch (error) { return next(error) }
}

/** Creates an office stock item, checks its initial reorder status, and records the admin action. */
export async function createInventoryItem(req, res, next) {
  const { item, issues } = validateInventoryItem(req.body)
  if (issues.length) return res.status(400).json({ message: issues.join(' ') })
  try {
    const record = await InventoryItem.create({ ...item, createdBy: req.user._id, updatedBy: req.user._id })
    await notifyIfStockIsLow(req, record, false)
    await recordAuditEvent(req, { eventType: 'inventory_item_created', details: { inventoryItemId: String(record._id), quantity: record.quantity, reorderLevel: record.reorderLevel } })
    return res.status(201).json({ item: { ...record.toObject(), id: String(record._id), stockStatus: record.quantity === 0 ? 'out-of-stock' : record.quantity <= record.reorderLevel ? 'low-stock' : 'in-stock' } })
  } catch (error) { return next(error) }
}

/** Updates stock details and notifies administrators only when stock newly crosses its threshold. */
export async function updateInventoryItem(req, res, next) {
  const { item, issues } = validateInventoryItem(req.body)
  if (issues.length) return res.status(400).json({ message: issues.join(' ') })
  try {
    const record = await InventoryItem.findById(req.params.id)
    if (!record) return res.status(404).json({ message: 'Inventory item not found.' })
    const wasLow = record.quantity <= record.reorderLevel
    record.set({ ...item, updatedBy: req.user._id })
    await record.save()
    await notifyIfStockIsLow(req, record, wasLow)
    await recordAuditEvent(req, { eventType: 'inventory_item_updated', details: { inventoryItemId: String(record._id), quantity: record.quantity, reorderLevel: record.reorderLevel } })
    return res.json({ item: { ...record.toObject(), id: String(record._id), stockStatus: record.quantity === 0 ? 'out-of-stock' : record.quantity <= record.reorderLevel ? 'low-stock' : 'in-stock' } })
  } catch (error) { return next(error) }
}

/** Removes an inventory record and records the affected item identifier. */
export async function deleteInventoryItem(req, res, next) {
  try {
    const record = await InventoryItem.findByIdAndDelete(req.params.id)
    if (!record) return res.status(404).json({ message: 'Inventory item not found.' })
    await recordAuditEvent(req, { eventType: 'inventory_item_deleted', details: { inventoryItemId: String(record._id) } })
    return res.json({ message: 'Inventory item deleted.' })
  } catch (error) { return next(error) }
}
