import mongoose from 'mongoose'
import Invoice from '../models/invoice.js'
import Department from '../models/department.js'
import User from '../models/user.js'
import { notifyUsers } from '../services/notifications.js'
import { createInvoicePdf } from '../services/invoicePdf.js'
import { sendInvoiceEmail } from '../services/mailer.js'

const validStatuses = ['draft', 'sent', 'paid', 'overdue', 'cancelled']
const allowedTransitions = {
  draft: ['sent', 'cancelled'],
  sent: ['paid', 'overdue', 'cancelled'],
  overdue: ['paid', 'cancelled'],
  paid: [],
  cancelled: [],
}

function publicInvoice(invoice) {
  return {
    id: String(invoice._id), invoiceNumber: invoice.invoiceNumber, customerName: invoice.customerName,
    customerEmail: invoice.customerEmail, items: invoice.items, total: invoice.total,
    currency: invoice.currency, dueDate: invoice.dueDate, status: invoice.status, notes: invoice.notes,
    emailStatus: invoice.emailStatus, emailSentAt: invoice.emailSentAt, emailError: invoice.emailError,
    createdAt: invoice.createdAt, updatedAt: invoice.updatedAt,
    createdBy: invoice.createdBy ? { id: String(invoice.createdBy._id || invoice.createdBy), name: invoice.createdBy.name || '' } : null,
    statusHistory: invoice.statusHistory?.map((entry) => ({ status: entry.status, actorName: entry.actor?.name || '', changedAt: entry.changedAt })) || [],
  }
}

async function deliverInvoice(invoice) {
  invoice.emailStatus = 'pending'
  invoice.emailError = ''
  await invoice.save()
  try {
    const pdf = await createInvoicePdf(invoice)
    await sendInvoiceEmail({ recipient: invoice.customerEmail, invoiceNumber: invoice.invoiceNumber, pdfBuffer: pdf })
    invoice.emailStatus = 'sent'
    invoice.emailSentAt = new Date()
    await invoice.save()
    return true
  } catch (error) {
    invoice.emailStatus = 'failed'
    invoice.emailError = 'Email delivery failed. Check SMTP configuration and retry.'
    await invoice.save()
    console.error('Invoice email delivery failed:', { code: error.code, responseCode: error.responseCode, message: error.message })
    return false
  }
}

export async function listInvoices(req, res, next) {
  try {
    const invoices = await Invoice.find().populate('createdBy', 'name').populate('statusHistory.actor', 'name').sort({ createdAt: -1 }).limit(500).lean()
    return res.json({ invoices: invoices.map(publicInvoice) })
  } catch (error) { return next(error) }
}

export async function createInvoice(req, res, next) {
  const customerName = typeof req.body?.customerName === 'string' ? req.body.customerName.trim() : ''
  const customerEmail = typeof req.body?.customerEmail === 'string' ? req.body.customerEmail.trim().toLowerCase() : ''
  const dueDateValue = typeof req.body?.dueDate === 'string' ? req.body.dueDate : ''
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : ''
  const status = req.body?.status === 'draft' ? 'draft' : 'sent'
  const inputItems = Array.isArray(req.body?.items) ? req.body.items : []
  if (customerName.length < 2 || customerName.length > 120) return res.status(400).json({ message: 'Customer name must be between 2 and 120 characters.' })
  if (customerEmail.length > 254 || (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail))) return res.status(400).json({ message: 'Enter a valid customer email.' })
  if (status === 'sent' && !customerEmail) return res.status(400).json({ message: 'Enter a customer email to send the invoice.' })
  const dueDate = new Date(`${dueDateValue}T00:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDateValue) || Number.isNaN(dueDate.getTime()) || dueDate.toISOString().slice(0, 10) !== dueDateValue) return res.status(400).json({ message: 'Choose a valid invoice due date.' })
  if (!inputItems.length || inputItems.length > 10) return res.status(400).json({ message: 'Add between 1 and 10 invoice line items.' })
  if (notes.length > 1000) return res.status(400).json({ message: 'Notes must be 1,000 characters or fewer.' })
  const items = []
  for (const item of inputItems) {
    const description = typeof item?.description === 'string' ? item.description.trim() : ''
    const quantity = Number(item?.quantity)
    const unitPrice = Number(item?.unitPrice)
    if (description.length < 2 || description.length > 160 || !Number.isFinite(quantity) || quantity <= 0 || quantity > 100000 || !Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 100000000) {
      return res.status(400).json({ message: 'Each item needs a description, a positive quantity, and a valid unit price.' })
    }
    items.push({ description, quantity, unitPrice, lineTotal: Math.round(quantity * unitPrice * 100) / 100 })
  }
  const total = Math.round(items.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100
  if (!Number.isFinite(total) || total <= 0) return res.status(400).json({ message: 'Invoice total must be greater than zero.' })

  try {
    const invoice = new Invoice({
      invoiceNumber: 'pending', customerName, customerEmail, items, total, dueDate,
      status, notes, createdBy: req.user._id, statusHistory: [{ status, actor: req.user._id }],
    })
    const datePart = new Date().toISOString().slice(0, 10).replaceAll('-', '')
    invoice.invoiceNumber = `INV-${datePart}-${String(invoice._id).slice(-8).toUpperCase()}`
    await invoice.save()
    const emailSent = status === 'sent' ? await deliverInvoice(invoice) : false
    const accountsDepartmentIds = await Department.find({ name: /account/i }).distinct('_id')
    const accountsUsers = await User.find({ isVerified: { $ne: false }, $or: [
      { role: 'accountant' }, { department: { $in: accountsDepartmentIds } },
    ] }).distinct('_id')
    await notifyUsers(accountsUsers, {
      actorId: req.user._id, actorName: req.user.name, type: 'system', title: 'New invoice created',
      message: `${req.user.name} created invoice ${invoice.invoiceNumber} for ${customerName}.`, page: 'billing', entityId: String(invoice._id),
    })
    const saved = await Invoice.findById(invoice._id).populate('createdBy', 'name').populate('statusHistory.actor', 'name').lean()
    const message = status === 'draft' ? 'Invoice saved as a draft.' : emailSent ? `Invoice created and emailed to ${customerEmail}.` : 'Invoice created, but email delivery failed. Download the PDF or retry email from the invoice register.'
    return res.status(201).json({ invoice: publicInvoice(saved), message })
  } catch (error) { return next(error) }
}

export async function updateInvoiceStatus(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid invoice ID.' })
  const status = req.body?.status
  if (!validStatuses.includes(status)) return res.status(400).json({ message: 'Choose a valid invoice status.' })
  try {
    const invoice = await Invoice.findById(req.params.id)
    if (!invoice) return res.status(404).json({ message: 'Invoice not found.' })
    if (invoice.status === status) return res.json({ invoice: publicInvoice(invoice), message: 'Invoice status is unchanged.' })
    if (!allowedTransitions[invoice.status]?.includes(status)) return res.status(409).json({ message: `An invoice cannot move from ${invoice.status} to ${status}.` })
    if (status === 'sent' && !invoice.customerEmail) return res.status(400).json({ message: 'Add a customer email before sending this invoice.' })
    invoice.status = status
    invoice.statusHistory.push({ status, actor: req.user._id })
    await invoice.save()
    const emailSent = status === 'sent' ? await deliverInvoice(invoice) : null
    const recipients = [invoice.createdBy]
    const accountsDepartmentIds = await Department.find({ name: /account/i }).distinct('_id')
    const accountsUsers = await User.find({ isVerified: { $ne: false }, $or: [{ role: 'accountant' }, { department: { $in: accountsDepartmentIds } }] }).distinct('_id')
    recipients.push(...accountsUsers)
    await notifyUsers(recipients, {
      actorId: req.user._id, actorName: req.user.name, type: 'system', title: 'Invoice status updated',
      message: `${req.user.name} marked invoice ${invoice.invoiceNumber} as ${status}.`, page: 'billing', entityId: String(invoice._id),
    })
    const saved = await Invoice.findById(invoice._id).populate('createdBy', 'name').populate('statusHistory.actor', 'name').lean()
    const message = status === 'sent' && !emailSent ? 'Invoice marked sent, but email delivery failed. Download the PDF or retry email.' : `Invoice marked ${status}${status === 'sent' ? ` and emailed to ${invoice.customerEmail}` : ''}.`
    return res.json({ invoice: publicInvoice(saved), message })
  } catch (error) { return next(error) }
}

export async function downloadInvoice(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid invoice ID.' })
  try {
    const invoice = await Invoice.findById(req.params.id)
    if (!invoice) return res.status(404).json({ message: 'Invoice not found.' })
    const pdf = await createInvoicePdf(invoice)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`)
    res.setHeader('Content-Length', pdf.length)
    return res.send(pdf)
  } catch (error) { return next(error) }
}

export async function emailInvoice(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid invoice ID.' })
  try {
    const invoice = await Invoice.findById(req.params.id)
    if (!invoice) return res.status(404).json({ message: 'Invoice not found.' })
    if (!invoice.customerEmail) return res.status(400).json({ message: 'This invoice has no customer email address.' })
    if (['draft', 'cancelled'].includes(invoice.status)) return res.status(409).json({ message: 'Only sent or overdue invoices can be emailed.' })
    const sent = await deliverInvoice(invoice)
    const saved = await Invoice.findById(invoice._id).populate('createdBy', 'name').populate('statusHistory.actor', 'name').lean()
    return res.status(sent ? 200 : 502).json({ invoice: publicInvoice(saved), message: sent ? `Invoice emailed to ${invoice.customerEmail}.` : 'Invoice email delivery failed. Check SMTP configuration and retry.' })
  } catch (error) { return next(error) }
}
