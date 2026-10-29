import express from 'express';
import { exportAllDataCsv } from '../controllers/adminExportController.js';
import { getAdminOverview } from '../controllers/adminOverviewController.js';
import { getAdminReports } from '../controllers/adminReportsController.js';
import { getHomeSummary } from '../controllers/homeController.js';
import { createManagedUser, deleteManagedUser, importManagedUsers, importUsersFromGoogleSheet, listUsers, startUserImpersonation, stopUserImpersonation, updateManagedUser } from '../controllers/adminUserController.js';
import { createDepartment, createRole, deleteDepartment, deleteRole, listOrganizationSettings } from '../controllers/organizationController.js';
import { authenticateToken, authorizePermission, rejectImpersonatedSecurityChanges } from '../middlewares/auth.js';
import { checkIn, checkOut, getAdminMonthlyAttendance, getAttendance, getLocationReviewQueue, requestAttendanceLocationCorrection, reviewAttendanceLocation, updateAttendanceLocation } from '../controllers/attendanceController.js';
import { createTask, getTaskAssignees, listTasks, updateTaskStatus } from '../controllers/taskController.js';
import { actOnLeaveRequest, createLeaveRequest, listAdminApprovedLeaves, listLeaveRequests } from '../controllers/leaveController.js';
import {
  getAdminDashboard,
  getCurrentUser,
  updateProfile,
  updateProfileImage,
  changePassword,
  signIn,
  signOut,
  signUp,
} from '../controllers/authController.js';
import { listEmailDirectory, listSentEmails, sendEmail } from '../controllers/emailController.js';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '../controllers/notificationController.js';
import { createInvoice, downloadInvoice, emailInvoice, listInvoices, updateInvoiceStatus } from '../controllers/billingController.js';
import { authorizeBillingAccess } from '../middlewares/billingAccess.js';
import { listAuditEvents, requestPasswordReset, resetPassword } from '../controllers/securityController.js';
import { validate } from '../utils/validation.js';
import { exportChatConversationCsv, listChatContacts, listChatConversations, listChatDepartments, listChatMessages, markChatConversationRead, openDepartmentConversation, openDirectConversation, sendChatMessage } from '../controllers/chatController.js';
import { downloadDocument, listDocuments, uploadDocument, viewDocument } from '../controllers/documentController.js';
import { createCalendarEvent, deleteCalendarEvent, listCalendarEvents, updateCalendarEvent } from '../controllers/calendarController.js';
import { authenticatedApiRateLimiter, chatMessageRateLimiter, documentUploadRateLimiter, emailRateLimiter, exportRateLimiter, importRateLimiter, impersonationRateLimiter, invoiceEmailRateLimiter, loginAccountRateLimiter, loginRateLimiter, organizationEmailRateLimiter, passwordChangeRateLimiter, passwordResetRequestRateLimiter, passwordResetSubmitRateLimiter, signupRateLimiter } from '../services/rateLimiter.js';
import { createCustomer, deleteCustomer, exportCustomers, importCustomers, listCustomers, updateCustomer } from '../controllers/customerController.js';
import { createInventoryItem, deleteInventoryItem, listInventory, updateInventoryItem } from '../controllers/inventoryController.js';
import { createRevenueTransaction, deleteRevenueTransaction, exportRevenueCsv, listRevenue, updateRevenueTransaction } from '../controllers/revenueController.js';

// Keep endpoint declarations in one place; middleware order defines the access policy.
const router = express.Router();

// Query specs stay endpoint-specific so a filter accepted by one list cannot
// accidentally become part of another endpoint's contract.
const pageQuery = { page: 'integer', pageSize: 'integer' };
const validatePageQuery = validate(pageQuery, { source: 'query' });
const validateIdParam = validate({ id: 'objectId' }, { source: 'params' });
const bodySpecifications = {
  signup: { name: { type: 'string', required: true }, phone: { type: 'string', required: true }, email: { type: 'email', required: true }, dateOfBirth: { type: 'string', required: true }, password: { type: 'string', required: true } },
  login: { email: { type: 'email', required: true }, password: { type: 'string', required: true } },
  forgotPassword: { email: { type: 'email', required: true } },
  resetPassword: { token: { type: 'string', required: true }, newPassword: { type: 'string', required: true } },
  profile: { name: { type: 'string', required: true }, email: { type: 'email', required: true }, phone: 'string', dateOfBirth: 'string', currentPassword: 'string' },
  password: { currentPassword: { type: 'string', required: true }, newPassword: { type: 'string', required: true } },
  adminUser: { name: { type: 'string', required: true }, email: { type: 'email', required: true }, password: { type: 'string', required: true }, role: { type: 'string', required: true, immutableForRoles: ['admin'] }, departmentId: { type: 'string', nullable: true, immutableForRoles: ['admin'] }, isVerified: { type: 'boolean', immutableForRoles: ['admin'] } },
  adminUserUpdate: { name: 'string', email: 'string', phone: 'string', dateOfBirth: 'string', role: { type: 'string', immutableForRoles: ['admin'] }, departmentId: { type: 'string', nullable: true, immutableForRoles: ['admin'] }, isVerified: { type: 'boolean', immutableForRoles: ['admin'] } },
  impersonation: { reason: { type: 'string', required: true } },
  crmCustomer: { name: { type: 'string', required: true }, company: 'string', email: 'string', phone: 'string', address: 'string', status: 'string', source: 'string', notes: 'string' },
  crmCustomerImport: { customers: { type: 'array', required: true } },
  inventoryItem: { name: { type: 'string', required: true }, category: { type: 'string', required: true }, sku: 'string', quantity: { type: 'number', required: true }, reorderLevel: { type: 'number', required: true }, unit: { type: 'string', required: true }, location: 'string', supplier: 'string', description: 'string' },
  revenueTransaction: { transactionType: { type: 'string', required: true }, category: { type: 'string', required: true }, amount: { type: 'number', required: true }, transactionDate: { type: 'string', required: true }, status: { type: 'string', required: true }, paymentMethod: { type: 'string', required: true }, counterparty: 'string', reference: 'string', description: 'string' },
  userImport: { users: { type: 'array', required: true } },
  googleSheet: { sheetUrl: { type: 'string', required: true } },
  task: { title: { type: 'string', required: true }, description: 'string', assignedTo: { type: 'objectId', required: true }, dueDate: 'string' },
  taskStatus: { status: { type: 'string', required: true, enum: ['pending', 'in-progress', 'completed'] } },
  leave: { leaveType: { type: 'string', required: true }, startDate: { type: 'string', required: true }, endDate: { type: 'string', required: true }, reason: { type: 'string', required: true } },
  leaveAction: { action: { type: 'string', required: true, enum: ['forward', 'approve', 'reject'] }, message: 'string' },
  email: { recipientIds: { type: 'array', required: true }, subject: { type: 'string', required: true }, message: { type: 'string', required: true } },
  invoice: { customerName: { type: 'string', required: true }, customerEmail: 'string', dueDate: { type: 'string', required: true }, notes: 'string', status: { type: 'string', enum: ['draft', 'sent'] }, items: { type: 'array', required: true } },
  invoiceStatus: { status: { type: 'string', required: true, enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'] } },
  roleName: { name: { type: 'string', required: true } },
  departmentName: { name: { type: 'string', required: true } },
  chatDirect: { userId: { type: 'objectId', required: true } },
  chatDepartment: { departmentId: { type: 'objectId', required: true } },
  chatMessage: { body: { type: 'string', required: true } },
  location: { location: { type: 'object', required: true } },
  checkIn: { location: { type: 'object', nullable: true }, exceptionReason: 'string' },
  locationCorrection: { location: { type: 'object', required: true }, reason: { type: 'string', required: true } },
  locationReview: { decision: { type: 'string', required: true, enum: ['reviewed', 'approve-correction', 'reject-correction'] }, message: { type: 'string', required: true } },
  calendarEvent: { title: { type: 'string', required: true }, description: 'string', type: { type: 'string', required: true, enum: ['holiday', 'event', 'meeting'] }, startAt: { type: 'string', required: true }, endAt: { type: 'string', required: true }, allDay: { type: 'boolean', required: true }, location: 'string', reminderMinutes: { type: 'integer', required: true } },
}
const validateRouteBody = (schemaName) => validate(bodySpecifications[schemaName], { bodySchema: schemaName });

// Public routes establish or clear sessions; protected routes authenticate before authorization.
router.post('/signup', signupRateLimiter, validateRouteBody('signup'), signUp);
router.post('/login', loginRateLimiter, loginAccountRateLimiter, validateRouteBody('login'), signIn);
router.post('/forgot-password', passwordResetRequestRateLimiter, validateRouteBody('forgotPassword'), requestPasswordReset);
router.post('/reset-password', passwordResetSubmitRateLimiter, validateRouteBody('resetPassword'), resetPassword);
router.get('/me', authenticateToken, authenticatedApiRateLimiter, getCurrentUser);
router.get('/home', authenticateToken, authenticatedApiRateLimiter, getHomeSummary);
router.get('/notifications', authenticateToken, validatePageQuery, authenticatedApiRateLimiter, listNotifications);
router.get('/documents', authenticateToken, validatePageQuery, authenticatedApiRateLimiter, listDocuments);
router.post('/documents', authenticateToken, authorizePermission('documents.upload'), validate({ filename: { type: 'string', required: true }, description: 'string' }, { source: 'query' }), authenticatedApiRateLimiter, documentUploadRateLimiter, express.raw({ type: () => true, limit: '15mb' }), uploadDocument);
router.get('/documents/:id/view', authenticateToken, validateIdParam, authenticatedApiRateLimiter, viewDocument);
router.get('/documents/:id/download', authenticateToken, validateIdParam, authenticatedApiRateLimiter, authorizePermission('documents.download'), downloadDocument);
router.get('/calendar/events', authenticateToken, validate({ ...pageQuery, start: { type: 'string', required: true }, end: { type: 'string', required: true } }, { source: 'query' }), authenticatedApiRateLimiter, listCalendarEvents);
router.post('/calendar/events', authenticateToken, validateRouteBody('calendarEvent'), authenticatedApiRateLimiter, authorizePermission('calendar.schedule'), createCalendarEvent);
router.patch('/calendar/events/:id', authenticateToken, validateIdParam, validateRouteBody('calendarEvent'), authenticatedApiRateLimiter, authorizePermission('calendar.manage'), updateCalendarEvent);
router.delete('/calendar/events/:id', authenticateToken, validateIdParam, authenticatedApiRateLimiter, authorizePermission('calendar.manage'), deleteCalendarEvent);
router.get('/chat/conversations', authenticateToken, validatePageQuery, authenticatedApiRateLimiter, listChatConversations);
router.get('/chat/contacts', authenticateToken, validate({ ...pageQuery, search: 'string' }, { source: 'query' }), authenticatedApiRateLimiter, listChatContacts);
router.get('/chat/departments', authenticateToken, authenticatedApiRateLimiter, listChatDepartments);
router.post('/chat/direct', authenticateToken, validateRouteBody('chatDirect'), authenticatedApiRateLimiter, openDirectConversation);
router.post('/chat/department', authenticateToken, validateRouteBody('chatDepartment'), authenticatedApiRateLimiter, openDepartmentConversation);
router.get('/chat/conversations/:id/messages', authenticateToken, validateIdParam, validatePageQuery, authenticatedApiRateLimiter, listChatMessages);
router.get('/chat/conversations/:id/export.csv', authenticateToken, validateIdParam, authenticatedApiRateLimiter, exportRateLimiter, exportChatConversationCsv);
router.patch('/chat/conversations/:id/read', authenticateToken, validateIdParam, authenticatedApiRateLimiter, markChatConversationRead);
router.post('/chat/conversations/:id/messages', authenticateToken, validateIdParam, validateRouteBody('chatMessage'), authenticatedApiRateLimiter, chatMessageRateLimiter, sendChatMessage);
router.patch('/notifications/read-all', authenticateToken, authenticatedApiRateLimiter, markAllNotificationsRead);
router.patch('/notifications/:id/read', authenticateToken, validate({ id: 'objectId' }, { source: 'params' }), authenticatedApiRateLimiter, markNotificationRead);
router.get('/mail/directory', authenticateToken, validate({ ...pageQuery, search: 'string', role: 'string', department: 'string' }, { source: 'query' }), authenticatedApiRateLimiter, authorizePermission('email.directory'), listEmailDirectory);
router.get('/mail/sent', authenticateToken, validatePageQuery, authenticatedApiRateLimiter, authorizePermission('email.viewOwnHistory'), listSentEmails);
router.post('/mail/send', authenticateToken, validateRouteBody('email'), authenticatedApiRateLimiter, authorizePermission('email.send'), emailRateLimiter, organizationEmailRateLimiter, sendEmail);
router.get('/billing/invoices', authenticateToken, validate({ ...pageQuery, search: 'string', status: 'string' }, { source: 'query' }), authenticatedApiRateLimiter, authorizeBillingAccess, listInvoices);
router.post('/billing/invoices', authenticateToken, validateRouteBody('invoice'), authenticatedApiRateLimiter, authorizeBillingAccess, invoiceEmailRateLimiter, createInvoice);
router.get('/billing/invoices/:id/pdf', authenticateToken, validateIdParam, authenticatedApiRateLimiter, authorizeBillingAccess, downloadInvoice);
router.post('/billing/invoices/:id/email', authenticateToken, validateIdParam, authenticatedApiRateLimiter, authorizeBillingAccess, invoiceEmailRateLimiter, organizationEmailRateLimiter, emailInvoice);
router.patch('/billing/invoices/:id/status', authenticateToken, validateIdParam, validateRouteBody('invoiceStatus'), authenticatedApiRateLimiter, authorizeBillingAccess, updateInvoiceStatus);
router.patch('/profile', authenticateToken, rejectImpersonatedSecurityChanges, validateRouteBody('profile'), authenticatedApiRateLimiter, updateProfile);
router.put('/profile/image', authenticateToken, rejectImpersonatedSecurityChanges, authenticatedApiRateLimiter, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '1536kb' }), updateProfileImage);
router.patch('/profile/password', authenticateToken, rejectImpersonatedSecurityChanges, validateRouteBody('password'), authenticatedApiRateLimiter, passwordChangeRateLimiter, changePassword);
router.post('/logout', signOut);
router.post('/impersonation/stop', authenticateToken, authenticatedApiRateLimiter, stopUserImpersonation);
router.get('/admin', authenticateToken, authenticatedApiRateLimiter, authorizePermission('admin.manage'), getAdminDashboard);
router.get('/admin/overview', authenticateToken, validate({ startDate: 'string', endDate: 'string', departmentId: 'string', location: 'string' }, { source: 'query' }), authenticatedApiRateLimiter, authorizePermission('admin.manage'), getAdminOverview);
router.get('/admin/reports', authenticateToken, validate({ period: 'string', asOfDate: 'string' }, { source: 'query' }), authenticatedApiRateLimiter, authorizePermission('admin.manage'), getAdminReports);
router.get('/admin/export.csv', authenticateToken, authenticatedApiRateLimiter, authorizePermission('admin.manage'), exportRateLimiter, exportAllDataCsv);
router.get('/admin/audit-events', authenticateToken, validatePageQuery, authenticatedApiRateLimiter, authorizePermission('admin.manage'), listAuditEvents);
router.get('/admin/customers', authenticateToken, validate({ ...pageQuery, search: 'string', status: 'string' }, { source: 'query' }), authenticatedApiRateLimiter, authorizePermission('admin.manage'), listCustomers);
router.post('/admin/customers', authenticateToken, validateRouteBody('crmCustomer'), authenticatedApiRateLimiter, authorizePermission('admin.manage'), createCustomer);
router.patch('/admin/customers/:id', authenticateToken, validate({ id: 'objectId' }, { source: 'params' }), validateRouteBody('crmCustomer'), authenticatedApiRateLimiter, authorizePermission('admin.manage'), updateCustomer);
router.delete('/admin/customers/:id', authenticateToken, validate({ id: 'objectId' }, { source: 'params' }), authenticatedApiRateLimiter, authorizePermission('admin.manage'), deleteCustomer);
router.post('/admin/customers/import', authenticateToken, validateRouteBody('crmCustomerImport'), authenticatedApiRateLimiter, authorizePermission('admin.manage'), importRateLimiter, importCustomers);
router.get('/admin/customers/export.csv', authenticateToken, authenticatedApiRateLimiter, authorizePermission('admin.manage'), exportRateLimiter, exportCustomers);
router.get('/admin/inventory', authenticateToken, validate({ ...pageQuery, search: 'string', category: 'string', status: 'string' }, { source: 'query' }), authenticatedApiRateLimiter, authorizePermission('admin.manage'), listInventory);
router.post('/admin/inventory', authenticateToken, validateRouteBody('inventoryItem'), authenticatedApiRateLimiter, authorizePermission('admin.manage'), createInventoryItem);
router.patch('/admin/inventory/:id', authenticateToken, validateIdParam, validateRouteBody('inventoryItem'), authenticatedApiRateLimiter, authorizePermission('admin.manage'), updateInventoryItem);
router.delete('/admin/inventory/:id', authenticateToken, validateIdParam, authenticatedApiRateLimiter, authorizePermission('admin.manage'), deleteInventoryItem);
router.get('/admin/revenue', authenticateToken, validate({ ...pageQuery, period: 'string', asOfDate: 'string', transactionType: 'string', status: 'string', search: 'string' }, { source: 'query' }), authenticatedApiRateLimiter, authorizePermission('admin.manage'), listRevenue);
router.get('/admin/revenue/export.csv', authenticateToken, validate({ period: 'string', asOfDate: 'string' }, { source: 'query' }), authenticatedApiRateLimiter, authorizePermission('admin.manage'), exportRateLimiter, exportRevenueCsv);
router.post('/admin/revenue/transactions', authenticateToken, validateRouteBody('revenueTransaction'), authenticatedApiRateLimiter, authorizePermission('admin.manage'), createRevenueTransaction);
router.patch('/admin/revenue/transactions/:id', authenticateToken, validateIdParam, validateRouteBody('revenueTransaction'), authenticatedApiRateLimiter, authorizePermission('admin.manage'), updateRevenueTransaction);
router.delete('/admin/revenue/transactions/:id', authenticateToken, validateIdParam, authenticatedApiRateLimiter, authorizePermission('admin.manage'), deleteRevenueTransaction);
router.get('/tasks/assignees', authenticateToken, authenticatedApiRateLimiter, authorizePermission('tasks.assign'), getTaskAssignees);
router.get('/tasks', authenticateToken, validatePageQuery, authenticatedApiRateLimiter, listTasks);
router.post('/tasks', authenticateToken, validateRouteBody('task'), authenticatedApiRateLimiter, authorizePermission('tasks.assign'), createTask);
router.patch('/tasks/:id/status', authenticateToken, validate({ id: 'objectId' }, { source: 'params' }), validateRouteBody('taskStatus'), authenticatedApiRateLimiter, updateTaskStatus);
router.get('/attendance', authenticateToken, validatePageQuery, authenticatedApiRateLimiter, getAttendance);
router.get('/attendance/location-reviews', authenticateToken, validatePageQuery, authenticatedApiRateLimiter, authorizePermission('attendance.reviewLocation'), getLocationReviewQueue);
router.get('/leaves', authenticateToken, validate({ ...pageQuery, requestsPage: 'integer', queuePage: 'integer' }, { source: 'query' }), authenticatedApiRateLimiter, listLeaveRequests);
router.get('/admin/leaves/approved', authenticateToken, validate({ ...pageQuery, month: 'string' }, { source: 'query' }), authenticatedApiRateLimiter, authorizePermission('admin.manage'), listAdminApprovedLeaves);
router.post('/leaves', authenticateToken, validateRouteBody('leave'), authenticatedApiRateLimiter, createLeaveRequest);
router.patch('/leaves/:id/action', authenticateToken, validate({ id: 'objectId' }, { source: 'params' }), validateRouteBody('leaveAction'), authenticatedApiRateLimiter, actOnLeaveRequest);
router.get('/admin/attendance/month', authenticateToken, validate({ ...pageQuery, month: 'string' }, { source: 'query' }), authenticatedApiRateLimiter, authorizePermission('admin.manage'), getAdminMonthlyAttendance);
router.post('/attendance/check-in', authenticateToken, validateRouteBody('checkIn'), authenticatedApiRateLimiter, checkIn);
router.patch('/attendance/location', authenticateToken, validateRouteBody('location'), authenticatedApiRateLimiter, updateAttendanceLocation);
router.post('/attendance/check-out', authenticateToken, authenticatedApiRateLimiter, checkOut);
router.post('/attendance/:id/location-correction', authenticateToken, validate({ id: 'objectId' }, { source: 'params' }), validateRouteBody('locationCorrection'), authenticatedApiRateLimiter, requestAttendanceLocationCorrection);
router.patch('/attendance/:id/location-review', authenticateToken, validate({ id: 'objectId' }, { source: 'params' }), validateRouteBody('locationReview'), authenticatedApiRateLimiter, authorizePermission('attendance.reviewLocation'), reviewAttendanceLocation);
router.get('/admin/users', authenticateToken, validate({ ...pageQuery, search: 'string' }, { source: 'query' }), authenticatedApiRateLimiter, authorizePermission('admin.manage'), listUsers);
router.post('/admin/users', authenticateToken, validateRouteBody('adminUser'), authenticatedApiRateLimiter, authorizePermission('admin.manage'), createManagedUser);
router.post('/admin/users/import', authenticateToken, validateRouteBody('userImport'), authenticatedApiRateLimiter, authorizePermission('admin.manage'), importRateLimiter, importManagedUsers);
router.post('/admin/users/import/google-sheet', authenticateToken, validateRouteBody('googleSheet'), authenticatedApiRateLimiter, authorizePermission('admin.manage'), importRateLimiter, importUsersFromGoogleSheet);
router.patch('/admin/users/:id', authenticateToken, validate({ id: 'objectId' }, { source: 'params' }), validateRouteBody('adminUserUpdate'), authenticatedApiRateLimiter, authorizePermission('admin.manage'), updateManagedUser);
router.delete('/admin/users/:id', authenticateToken, validate({ id: 'objectId' }, { source: 'params' }), authenticatedApiRateLimiter, authorizePermission('admin.manage'), deleteManagedUser);
router.post('/admin/users/:id/impersonate', authenticateToken, validate({ id: 'objectId' }, { source: 'params' }), validateRouteBody('impersonation'), authenticatedApiRateLimiter, authorizePermission('admin.manage'), impersonationRateLimiter, startUserImpersonation);
router.get('/admin/organization', authenticateToken, authenticatedApiRateLimiter, authorizePermission('admin.manage'), listOrganizationSettings);
router.post('/admin/roles', authenticateToken, validateRouteBody('roleName'), authenticatedApiRateLimiter, authorizePermission('admin.manage'), createRole);
router.delete('/admin/roles/:id', authenticateToken, validate({ id: 'objectId' }, { source: 'params' }), authenticatedApiRateLimiter, authorizePermission('admin.manage'), deleteRole);
router.post('/admin/departments', authenticateToken, validateRouteBody('departmentName'), authenticatedApiRateLimiter, authorizePermission('admin.manage'), createDepartment);
router.delete('/admin/departments/:id', authenticateToken, validate({ id: 'objectId' }, { source: 'params' }), authenticatedApiRateLimiter, authorizePermission('admin.manage'), deleteDepartment);

export default router;







