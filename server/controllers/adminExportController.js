import Attendance from '../models/attendance.js'
import AuditEvent from '../models/auditEvent.js'
import Department from '../models/department.js'
import EmailLog from '../models/emailLog.js'
import Invoice from '../models/invoice.js'
import LeaveRequest from '../models/leaveRequest.js'
import Notification from '../models/notification.js'
import Role from '../models/role.js'
import Task from '../models/task.js'
import User from '../models/user.js'
import { recordAuditEvent } from '../services/audit.js'
import { escapeCsvCell, serializeCsvRow } from '../utils/csv.js'

/** Serializes a MongoDB record's complete non-secret fields for the CSV details column. */
function serializeRecordDetails(record) {
  return JSON.stringify(record)
}

/** Downloads all ERP collections as one admin-only CSV without exporting password hashes. */
export async function exportAllDataCsv(req, res, next) {
  try {
    const [users, tasks, attendance, leaveRequests, invoices, emailLogs, notifications, roles, departments, auditEvents] = await Promise.all([
      User.find().select('-password').lean(),
      Task.find().lean(),
      Attendance.find().lean(),
      LeaveRequest.find().lean(),
      Invoice.find().lean(),
      EmailLog.find().lean(),
      Notification.find().lean(),
      Role.find().lean(),
      Department.find().lean(),
      AuditEvent.find().lean(),
    ])

    const collections = [
      ['user', users],
      ['task', tasks],
      ['attendance', attendance],
      ['leave_request', leaveRequests],
      ['invoice', invoices],
      ['email_log', emailLogs],
      ['notification', notifications],
      ['role', roles],
      ['department', departments],
      ['audit_event', auditEvents],
    ]
    const rows = [['record_type', 'record_id', 'created_at', 'updated_at', 'details_json']]

    for (const [recordType, records] of collections) {
      for (const record of records) {
        rows.push([
          recordType,
          record._id,
          record.createdAt,
          record.updatedAt,
          serializeRecordDetails(record),
        ])
      }
    }

    await recordAuditEvent(req, { eventType: 'data_exported', details: { reason: 'complete_csv_export' } })

    const csv = rows.map(serializeCsvRow).join('')
    const dateStamp = new Date().toISOString().slice(0, 10)
    res.setHeader('Cache-Control', 'no-store')
    res.type('text/csv; charset=utf-8')
    res.attachment(`orbit-erp-export-${dateStamp}.csv`)
    return res.send(`\uFEFF${csv}`)
  } catch (error) {
    return next(error)
  }
}
