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
import { validate, validateBody } from '../utils/validation.js';
import { exportChatConversationCsv, listChatContacts, listChatConversations, listChatDepartments, listChatMessages, markChatConversationRead, openDepartmentConversation, openDirectConversation, sendChatMessage } from '../controllers/chatController.js';
import { authenticatedApiRateLimiter, chatMessageRateLimiter, emailRateLimiter, exportRateLimiter, importRateLimiter, invoiceEmailRateLimiter, loginAccountRateLimiter, loginRateLimiter, organizationEmailRateLimiter, passwordChangeRateLimiter, passwordResetRequestRateLimiter, passwordResetSubmitRateLimiter, signupRateLimiter } from '../services/rateLimiter.js';

// Keep endpoint declarations in one place; middleware order defines the access policy.
const router = express.Router();

// Query specs stay endpoint-specific so a filter accepted by one list cannot
// accidentally become part of another endpoint's contract.
const pageQuery = { page: 'integer', pageSize: 'integer' };
const validatePageQuery = validate(pageQuery, { source: 'query' });
const validateConversationParams = validate({ id: 'objectId' }, { source: 'params' });

// Public routes establish or clear sessions; protected routes authenticate before authorization.
router.post('/signup', signupRateLimiter, validateBody('signup'), signUp);
router.post('/login', loginRateLimiter, loginAccountRateLimiter, validateBody('login'), signIn);
router.post('/forgot-password', passwordResetRequestRateLimiter, validateBody('forgotPassword'), requestPasswordReset);
router.post('/reset-password', passwordResetSubmitRateLimiter, validateBody('resetPassword'), resetPassword);
router.get('/me', authenticateToken, authenticatedApiRateLimiter, getCurrentUser);
router.get('/notifications', authenticateToken, validatePageQuery, authenticatedApiRateLimiter, listNotifications);
router.get('/chat/conversations', authenticateToken, validatePageQuery, authenticatedApiRateLimiter, listChatConversations);
router.get('/chat/contacts', authenticateToken, validate({ ...pageQuery, search: 'string' }, { source: 'query' }), authenticatedApiRateLimiter, listChatContacts);
router.get('/chat/departments', authenticateToken, authenticatedApiRateLimiter, listChatDepartments);
router.post('/chat/direct', authenticateToken, authenticatedApiRateLimiter, validateBody('chatDirect'), openDirectConversation);
router.post('/chat/department', authenticateToken, authenticatedApiRateLimiter, validateBody('chatDepartment'), openDepartmentConversation);
router.get('/chat/conversations/:id/messages', authenticateToken, validateConversationParams, validatePageQuery, authenticatedApiRateLimiter, listChatMessages);
router.get('/chat/conversations/:id/export.csv', authenticateToken, validateConversationParams, authenticatedApiRateLimiter, exportRateLimiter, exportChatConversationCsv);
router.patch('/chat/conversations/:id/read', authenticateToken, validateConversationParams, authenticatedApiRateLimiter, markChatConversationRead);
router.post('/chat/conversations/:id/messages', authenticateToken, validateConversationParams, authenticatedApiRateLimiter, chatMessageRateLimiter, validateBody('chatMessage'), sendChatMessage);
router.patch('/notifications/read-all', authenticateToken, authenticatedApiRateLimiter, markAllNotificationsRead);
router.patch('/notifications/:id/read', authenticateToken, validate({ id: 'objectId' }, { source: 'params' }), authenticatedApiRateLimiter, markNotificationRead);
router.get('/mail/directory', authenticateToken, validate({ ...pageQuery, search: 'string', role: 'string', department: 'string' }, { source: 'query' }), authenticatedApiRateLimiter, listEmailDirectory);
router.get('/mail/sent', authenticateToken, validatePageQuery, authenticatedApiRateLimiter, listSentEmails);
router.post('/mail/send', authenticateToken, authenticatedApiRateLimiter, emailRateLimiter, organizationEmailRateLimiter, validateBody('email'), sendEmail);
router.get('/billing/invoices', authenticateToken, validate({ ...pageQuery, search: 'string', status: 'string' }, { source: 'query' }), authenticatedApiRateLimiter, authorizeBillingAccess, listInvoices);
router.post('/billing/invoices', authenticateToken, authenticatedApiRateLimiter, authorizeBillingAccess, invoiceEmailRateLimiter, validateBody('invoice'), createInvoice);
router.get('/billing/invoices/:id/pdf', authenticateToken, validateConversationParams, authenticatedApiRateLimiter, authorizeBillingAccess, downloadInvoice);
router.post('/billing/invoices/:id/email', authenticateToken, validateConversationParams, authenticatedApiRateLimiter, authorizeBillingAccess, invoiceEmailRateLimiter, organizationEmailRateLimiter, emailInvoice);
router.patch('/billing/invoices/:id/status', authenticateToken, validateConversationParams, authenticatedApiRateLimiter, authorizeBillingAccess, validateBody('invoiceStatus'), updateInvoiceStatus);
router.patch('/profile', authenticateToken, authenticatedApiRateLimiter, validateBody('profile'), updateProfile);
router.put('/profile/image', authenticateToken, authenticatedApiRateLimiter, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '1536kb' }), updateProfileImage);
router.patch('/profile/password', authenticateToken, authenticatedApiRateLimiter, passwordChangeRateLimiter, validateBody('password'), changePassword);
router.post('/logout', signOut);
router.get('/admin', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin'), getAdminDashboard);
router.get('/admin/overview', authenticateToken, validate({ startDate: 'string', endDate: 'string', departmentId: 'string', location: 'string' }, { source: 'query' }), authenticatedApiRateLimiter, authorizeRoles('admin'), getAdminOverview);
router.get('/admin/export.csv', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin'), exportRateLimiter, exportAllDataCsv);
router.get('/admin/audit-events', authenticateToken, validatePageQuery, authenticatedApiRateLimiter, authorizeRoles('admin'), listAuditEvents);
router.get('/tasks/assignees', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin', 'hr', 'manager'), getTaskAssignees);
router.get('/tasks', authenticateToken, validatePageQuery, authenticatedApiRateLimiter, listTasks);
router.post('/tasks', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin', 'hr', 'manager'), validateBody('task'), createTask);
router.patch('/tasks/:id/status', authenticateToken, validate({ id: 'objectId' }, { source: 'params' }), authenticatedApiRateLimiter, validateBody('taskStatus'), updateTaskStatus);
router.get('/attendance', authenticateToken, validate({ ...pageQuery, month: 'string' }, { source: 'query' }), authenticatedApiRateLimiter, getAttendance);
router.get('/attendance/location-reviews', authenticateToken, validatePageQuery, authenticatedApiRateLimiter, authorizeRoles('admin', 'hr', 'manager'), getLocationReviewQueue);
router.get('/leaves', authenticateToken, validate({ ...pageQuery, requestsPage: 'integer', queuePage: 'integer' }, { source: 'query' }), authenticatedApiRateLimiter, listLeaveRequests);
router.get('/admin/leaves/approved', authenticateToken, validate({ ...pageQuery, month: 'string' }, { source: 'query' }), authenticatedApiRateLimiter, authorizeRoles('admin'), listAdminApprovedLeaves);
router.post('/leaves', authenticateToken, authenticatedApiRateLimiter, validateBody('leave'), createLeaveRequest);
router.patch('/leaves/:id/action', authenticateToken, validate({ id: 'objectId' }, { source: 'params' }), authenticatedApiRateLimiter, validateBody('leaveAction'), actOnLeaveRequest);
router.get('/admin/attendance/month', authenticateToken, validate({ ...pageQuery, month: 'string' }, { source: 'query' }), authenticatedApiRateLimiter, authorizeRoles('admin'), getAdminMonthlyAttendance);
router.post('/attendance/check-in', authenticateToken, authenticatedApiRateLimiter, validateBody('checkIn'), checkIn);
router.patch('/attendance/location', authenticateToken, authenticatedApiRateLimiter, validateBody('location'), updateAttendanceLocation);
router.post('/attendance/check-out', authenticateToken, authenticatedApiRateLimiter, checkOut);
router.post('/attendance/:id/location-correction', authenticateToken, validate({ id: 'objectId' }, { source: 'params' }), authenticatedApiRateLimiter, validateBody('locationCorrection'), requestAttendanceLocationCorrection);
router.patch('/attendance/:id/location-review', authenticateToken, validate({ id: 'objectId' }, { source: 'params' }), authenticatedApiRateLimiter, authorizeRoles('admin', 'hr', 'manager'), validateBody('locationReview'), reviewAttendanceLocation);
router.get('/admin/users', authenticateToken, validate({ ...pageQuery, search: 'string' }, { source: 'query' }), authenticatedApiRateLimiter, authorizeRoles('admin'), listUsers);
router.post('/admin/users', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin'), validateBody('adminUser'), createManagedUser);
router.post('/admin/users/import', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin'), importRateLimiter, validateBody('userImport'), importManagedUsers);
router.post('/admin/users/import/google-sheet', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin'), importRateLimiter, validateBody('googleSheet'), importUsersFromGoogleSheet);
router.patch('/admin/users/:id', authenticateToken, validate({ id: 'objectId' }, { source: 'params' }), authenticatedApiRateLimiter, authorizeRoles('admin'), validateBody('adminUserUpdate'), updateManagedUser);
router.get('/admin/organization', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin'), listOrganizationSettings);
router.post('/admin/roles', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin'), validateBody('roleName'), createRole);
router.delete('/admin/roles/:id', authenticateToken, validate({ id: 'objectId' }, { source: 'params' }), authenticatedApiRateLimiter, authorizeRoles('admin'), deleteRole);
router.post('/admin/departments', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin'), validateBody('departmentName'), createDepartment);
router.delete('/admin/departments/:id', authenticateToken, validate({ id: 'objectId' }, { source: 'params' }), authenticatedApiRateLimiter, authorizeRoles('admin'), deleteDepartment);

export default router;







