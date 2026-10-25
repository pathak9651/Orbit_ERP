import express from 'express';
import { exportAllDataCsv } from '../controllers/adminExportController.js';
import { getAdminOverview } from '../controllers/adminOverviewController.js';
import { createManagedUser, importManagedUsers, importUsersFromGoogleSheet, listUsers, updateManagedUser } from '../controllers/adminUserController.js';
import { createDepartment, createRole, deleteDepartment, deleteRole, listOrganizationSettings } from '../controllers/organizationController.js';
import { authenticateToken, authorizeRoles } from '../middlewares/auth.js';
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
import { authenticatedApiRateLimiter, chatMessageRateLimiter, emailRateLimiter, exportRateLimiter, importRateLimiter, invoiceEmailRateLimiter, loginAccountRateLimiter, loginRateLimiter, organizationEmailRateLimiter, passwordChangeRateLimiter, passwordResetRequestRateLimiter, passwordResetSubmitRateLimiter, signupRateLimiter } from '../services/rateLimiter.js';

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
  adminUserUpdate: { role: { type: 'string', immutableForRoles: ['admin'] }, departmentId: { type: 'string', nullable: true, immutableForRoles: ['admin'] }, isVerified: { type: 'boolean', immutableForRoles: ['admin'] } },
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
}
const validateRouteBody = (schemaName) => validate(bodySpecifications[schemaName], { bodySchema: schemaName });

// Public routes establish or clear sessions; protected routes authenticate before authorization.
router.post('/signup', signupRateLimiter, validateRouteBody('signup'), signUp);
router.post('/login', loginRateLimiter, loginAccountRateLimiter, validateRouteBody('login'), signIn);
router.post('/forgot-password', passwordResetRequestRateLimiter, validateRouteBody('forgotPassword'), requestPasswordReset);
router.post('/reset-password', passwordResetSubmitRateLimiter, validateRouteBody('resetPassword'), resetPassword);
router.get('/me', authenticateToken, authenticatedApiRateLimiter, getCurrentUser);
router.get('/notifications', authenticateToken, validatePageQuery, authenticatedApiRateLimiter, listNotifications);
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
router.get('/mail/directory', authenticateToken, validate({ ...pageQuery, search: 'string', role: 'string', department: 'string' }, { source: 'query' }), authenticatedApiRateLimiter, listEmailDirectory);
router.get('/mail/sent', authenticateToken, validatePageQuery, authenticatedApiRateLimiter, listSentEmails);
router.post('/mail/send', authenticateToken, validateRouteBody('email'), authenticatedApiRateLimiter, emailRateLimiter, organizationEmailRateLimiter, sendEmail);
router.get('/billing/invoices', authenticateToken, validate({ ...pageQuery, search: 'string', status: 'string' }, { source: 'query' }), authenticatedApiRateLimiter, authorizeBillingAccess, listInvoices);
router.post('/billing/invoices', authenticateToken, validateRouteBody('invoice'), authenticatedApiRateLimiter, authorizeBillingAccess, invoiceEmailRateLimiter, createInvoice);
router.get('/billing/invoices/:id/pdf', authenticateToken, validateIdParam, authenticatedApiRateLimiter, authorizeBillingAccess, downloadInvoice);
router.post('/billing/invoices/:id/email', authenticateToken, validateIdParam, authenticatedApiRateLimiter, authorizeBillingAccess, invoiceEmailRateLimiter, organizationEmailRateLimiter, emailInvoice);
router.patch('/billing/invoices/:id/status', authenticateToken, validateIdParam, validateRouteBody('invoiceStatus'), authenticatedApiRateLimiter, authorizeBillingAccess, updateInvoiceStatus);
router.patch('/profile', authenticateToken, validateRouteBody('profile'), authenticatedApiRateLimiter, updateProfile);
router.put('/profile/image', authenticateToken, authenticatedApiRateLimiter, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '1536kb' }), updateProfileImage);
router.patch('/profile/password', authenticateToken, validateRouteBody('password'), authenticatedApiRateLimiter, passwordChangeRateLimiter, changePassword);
router.post('/logout', signOut);
router.get('/admin', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin'), getAdminDashboard);
router.get('/admin/overview', authenticateToken, validate({ startDate: 'string', endDate: 'string', departmentId: 'string', location: 'string' }, { source: 'query' }), authenticatedApiRateLimiter, authorizeRoles('admin'), getAdminOverview);
router.get('/admin/export.csv', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin'), exportRateLimiter, exportAllDataCsv);
router.get('/admin/audit-events', authenticateToken, validatePageQuery, authenticatedApiRateLimiter, authorizeRoles('admin'), listAuditEvents);
router.get('/tasks/assignees', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin', 'hr', 'manager'), getTaskAssignees);
router.get('/tasks', authenticateToken, validatePageQuery, authenticatedApiRateLimiter, listTasks);
router.post('/tasks', authenticateToken, validateRouteBody('task'), authenticatedApiRateLimiter, authorizeRoles('admin', 'hr', 'manager'), createTask);
router.patch('/tasks/:id/status', authenticateToken, validate({ id: 'objectId' }, { source: 'params' }), validateRouteBody('taskStatus'), authenticatedApiRateLimiter, updateTaskStatus);
router.get('/attendance', authenticateToken, validatePageQuery, authenticatedApiRateLimiter, getAttendance);
router.get('/attendance/location-reviews', authenticateToken, validatePageQuery, authenticatedApiRateLimiter, authorizeRoles('admin', 'hr', 'manager'), getLocationReviewQueue);
router.get('/leaves', authenticateToken, validate({ ...pageQuery, requestsPage: 'integer', queuePage: 'integer' }, { source: 'query' }), authenticatedApiRateLimiter, listLeaveRequests);
router.get('/admin/leaves/approved', authenticateToken, validate({ ...pageQuery, month: 'string' }, { source: 'query' }), authenticatedApiRateLimiter, authorizeRoles('admin'), listAdminApprovedLeaves);
router.post('/leaves', authenticateToken, validateRouteBody('leave'), authenticatedApiRateLimiter, createLeaveRequest);
router.patch('/leaves/:id/action', authenticateToken, validate({ id: 'objectId' }, { source: 'params' }), validateRouteBody('leaveAction'), authenticatedApiRateLimiter, actOnLeaveRequest);
router.get('/admin/attendance/month', authenticateToken, validate({ ...pageQuery, month: 'string' }, { source: 'query' }), authenticatedApiRateLimiter, authorizeRoles('admin'), getAdminMonthlyAttendance);
router.post('/attendance/check-in', authenticateToken, validateRouteBody('checkIn'), authenticatedApiRateLimiter, checkIn);
router.patch('/attendance/location', authenticateToken, validateRouteBody('location'), authenticatedApiRateLimiter, updateAttendanceLocation);
router.post('/attendance/check-out', authenticateToken, authenticatedApiRateLimiter, checkOut);
router.post('/attendance/:id/location-correction', authenticateToken, validate({ id: 'objectId' }, { source: 'params' }), validateRouteBody('locationCorrection'), authenticatedApiRateLimiter, requestAttendanceLocationCorrection);
router.patch('/attendance/:id/location-review', authenticateToken, validate({ id: 'objectId' }, { source: 'params' }), validateRouteBody('locationReview'), authenticatedApiRateLimiter, authorizeRoles('admin', 'hr', 'manager'), reviewAttendanceLocation);
router.get('/admin/users', authenticateToken, validate({ ...pageQuery, search: 'string' }, { source: 'query' }), authenticatedApiRateLimiter, authorizeRoles('admin'), listUsers);
router.post('/admin/users', authenticateToken, validateRouteBody('adminUser'), authenticatedApiRateLimiter, authorizeRoles('admin'), createManagedUser);
router.post('/admin/users/import', authenticateToken, validateRouteBody('userImport'), authenticatedApiRateLimiter, authorizeRoles('admin'), importRateLimiter, importManagedUsers);
router.post('/admin/users/import/google-sheet', authenticateToken, validateRouteBody('googleSheet'), authenticatedApiRateLimiter, authorizeRoles('admin'), importRateLimiter, importUsersFromGoogleSheet);
router.patch('/admin/users/:id', authenticateToken, validate({ id: 'objectId' }, { source: 'params' }), validateRouteBody('adminUserUpdate'), authenticatedApiRateLimiter, authorizeRoles('admin'), updateManagedUser);
router.get('/admin/organization', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin'), listOrganizationSettings);
router.post('/admin/roles', authenticateToken, validateRouteBody('roleName'), authenticatedApiRateLimiter, authorizeRoles('admin'), createRole);
router.delete('/admin/roles/:id', authenticateToken, validate({ id: 'objectId' }, { source: 'params' }), authenticatedApiRateLimiter, authorizeRoles('admin'), deleteRole);
router.post('/admin/departments', authenticateToken, validateRouteBody('departmentName'), authenticatedApiRateLimiter, authorizeRoles('admin'), createDepartment);
router.delete('/admin/departments/:id', authenticateToken, validate({ id: 'objectId' }, { source: 'params' }), authenticatedApiRateLimiter, authorizeRoles('admin'), deleteDepartment);

export default router;







