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
import { validateBody } from '../utils/validation.js';
import { authenticatedApiRateLimiter, emailRateLimiter, exportRateLimiter, importRateLimiter, invoiceEmailRateLimiter, loginAccountRateLimiter, loginRateLimiter, organizationEmailRateLimiter, passwordChangeRateLimiter, passwordResetRequestRateLimiter, passwordResetSubmitRateLimiter, signupRateLimiter } from '../services/rateLimiter.js';

// Keep endpoint declarations in one place; middleware order defines the access policy.
const router = express.Router();

// Public routes establish or clear sessions; protected routes authenticate before authorization.
router.post('/signup', signupRateLimiter, validateBody('signup'), signUp);
router.post('/login', loginRateLimiter, loginAccountRateLimiter, validateBody('login'), signIn);
router.post('/forgot-password', passwordResetRequestRateLimiter, validateBody('forgotPassword'), requestPasswordReset);
router.post('/reset-password', passwordResetSubmitRateLimiter, validateBody('resetPassword'), resetPassword);
router.get('/me', authenticateToken, authenticatedApiRateLimiter, getCurrentUser);
router.get('/notifications', authenticateToken, authenticatedApiRateLimiter, listNotifications);
router.patch('/notifications/read-all', authenticateToken, authenticatedApiRateLimiter, markAllNotificationsRead);
router.patch('/notifications/:id/read', authenticateToken, authenticatedApiRateLimiter, markNotificationRead);
router.get('/mail/directory', authenticateToken, authenticatedApiRateLimiter, listEmailDirectory);
router.get('/mail/sent', authenticateToken, authenticatedApiRateLimiter, listSentEmails);
router.post('/mail/send', authenticateToken, authenticatedApiRateLimiter, emailRateLimiter, organizationEmailRateLimiter, validateBody('email'), sendEmail);
router.get('/billing/invoices', authenticateToken, authenticatedApiRateLimiter, authorizeBillingAccess, listInvoices);
router.post('/billing/invoices', authenticateToken, authenticatedApiRateLimiter, authorizeBillingAccess, invoiceEmailRateLimiter, validateBody('invoice'), createInvoice);
router.get('/billing/invoices/:id/pdf', authenticateToken, authenticatedApiRateLimiter, authorizeBillingAccess, downloadInvoice);
router.post('/billing/invoices/:id/email', authenticateToken, authenticatedApiRateLimiter, authorizeBillingAccess, invoiceEmailRateLimiter, organizationEmailRateLimiter, emailInvoice);
router.patch('/billing/invoices/:id/status', authenticateToken, authenticatedApiRateLimiter, authorizeBillingAccess, validateBody('invoiceStatus'), updateInvoiceStatus);
router.patch('/profile', authenticateToken, authenticatedApiRateLimiter, validateBody('profile'), updateProfile);
router.put('/profile/image', authenticateToken, authenticatedApiRateLimiter, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '1536kb' }), updateProfileImage);
router.patch('/profile/password', authenticateToken, authenticatedApiRateLimiter, passwordChangeRateLimiter, validateBody('password'), changePassword);
router.post('/logout', signOut);
router.get('/admin', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin'), getAdminDashboard);
router.get('/admin/overview', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin'), getAdminOverview);
router.get('/admin/export.csv', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin'), exportRateLimiter, exportAllDataCsv);
router.get('/admin/audit-events', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin'), listAuditEvents);
router.get('/tasks/assignees', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin', 'hr', 'manager'), getTaskAssignees);
router.get('/tasks', authenticateToken, authenticatedApiRateLimiter, listTasks);
router.post('/tasks', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin', 'hr', 'manager'), validateBody('task'), createTask);
router.patch('/tasks/:id/status', authenticateToken, authenticatedApiRateLimiter, validateBody('taskStatus'), updateTaskStatus);
router.get('/attendance', authenticateToken, authenticatedApiRateLimiter, getAttendance);
router.get('/attendance/location-reviews', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin', 'hr', 'manager'), getLocationReviewQueue);
router.get('/leaves', authenticateToken, authenticatedApiRateLimiter, listLeaveRequests);
router.get('/admin/leaves/approved', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin'), listAdminApprovedLeaves);
router.post('/leaves', authenticateToken, authenticatedApiRateLimiter, validateBody('leave'), createLeaveRequest);
router.patch('/leaves/:id/action', authenticateToken, authenticatedApiRateLimiter, validateBody('leaveAction'), actOnLeaveRequest);
router.get('/admin/attendance/month', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin'), getAdminMonthlyAttendance);
router.post('/attendance/check-in', authenticateToken, authenticatedApiRateLimiter, validateBody('checkIn'), checkIn);
router.patch('/attendance/location', authenticateToken, authenticatedApiRateLimiter, validateBody('location'), updateAttendanceLocation);
router.post('/attendance/check-out', authenticateToken, authenticatedApiRateLimiter, checkOut);
router.post('/attendance/:id/location-correction', authenticateToken, authenticatedApiRateLimiter, validateBody('locationCorrection'), requestAttendanceLocationCorrection);
router.patch('/attendance/:id/location-review', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin', 'hr', 'manager'), validateBody('locationReview'), reviewAttendanceLocation);
router.get('/admin/users', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin'), listUsers);
router.post('/admin/users', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin'), validateBody('adminUser'), createManagedUser);
router.post('/admin/users/import', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin'), importRateLimiter, validateBody('userImport'), importManagedUsers);
router.post('/admin/users/import/google-sheet', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin'), importRateLimiter, validateBody('googleSheet'), importUsersFromGoogleSheet);
router.patch('/admin/users/:id', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin'), validateBody('adminUserUpdate'), updateManagedUser);
router.get('/admin/organization', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin'), listOrganizationSettings);
router.post('/admin/roles', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin'), validateBody('roleName'), createRole);
router.delete('/admin/roles/:id', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin'), deleteRole);
router.post('/admin/departments', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin'), validateBody('departmentName'), createDepartment);
router.delete('/admin/departments/:id', authenticateToken, authenticatedApiRateLimiter, authorizeRoles('admin'), deleteDepartment);

export default router;







