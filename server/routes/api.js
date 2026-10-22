import express from 'express';
import { listUsers, updateManagedUser } from '../controllers/adminUserController.js';
import { createDepartment, createRole, deleteDepartment, deleteRole, listOrganizationSettings } from '../controllers/organizationController.js';
import { authenticateToken, authorizeRoles } from '../middlewares/auth.js';
import { checkIn, checkOut, getAdminMonthlyAttendance, getAttendance, updateAttendanceLocation } from '../controllers/attendanceController.js';
import { createTask, getTaskAssignees, listTasks, updateTaskStatus } from '../controllers/taskController.js';
import { actOnLeaveRequest, createLeaveRequest, listAdminApprovedLeaves, listLeaveRequests } from '../controllers/leaveController.js';
import {
  getAdminDashboard,
  getCurrentUser,
  updateProfile,
  changePassword,
  signIn,
  signOut,
  signUp,
} from '../controllers/authController.js';
import { listEmailDirectory, listSentEmails, sendEmail } from '../controllers/emailController.js';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '../controllers/notificationController.js';
import { createInvoice, downloadInvoice, emailInvoice, listInvoices, updateInvoiceStatus } from '../controllers/billingController.js';
import { authorizeBillingAccess } from '../middlewares/billingAccess.js';

const router = express.Router();

router.post('/signup', signUp);
router.post('/login', signIn);
router.get('/me', authenticateToken, getCurrentUser);
router.get('/notifications', authenticateToken, listNotifications);
router.patch('/notifications/read-all', authenticateToken, markAllNotificationsRead);
router.patch('/notifications/:id/read', authenticateToken, markNotificationRead);
router.get('/mail/directory', authenticateToken, listEmailDirectory);
router.get('/mail/sent', authenticateToken, listSentEmails);
router.post('/mail/send', authenticateToken, sendEmail);
router.get('/billing/invoices', authenticateToken, authorizeBillingAccess, listInvoices);
router.post('/billing/invoices', authenticateToken, authorizeBillingAccess, createInvoice);
router.get('/billing/invoices/:id/pdf', authenticateToken, authorizeBillingAccess, downloadInvoice);
router.post('/billing/invoices/:id/email', authenticateToken, authorizeBillingAccess, emailInvoice);
router.patch('/billing/invoices/:id/status', authenticateToken, authorizeBillingAccess, updateInvoiceStatus);
router.patch('/profile', authenticateToken, updateProfile);
router.patch('/profile/password', authenticateToken, changePassword);
router.post('/logout', signOut);
router.get('/admin', authenticateToken, authorizeRoles('admin'), getAdminDashboard);
router.get('/tasks/assignees', authenticateToken, authorizeRoles('admin', 'hr', 'manager'), getTaskAssignees);
router.get('/tasks', authenticateToken, listTasks);
router.post('/tasks', authenticateToken, authorizeRoles('admin', 'hr', 'manager'), createTask);
router.patch('/tasks/:id/status', authenticateToken, updateTaskStatus);
router.get('/attendance', authenticateToken, getAttendance);
router.get('/leaves', authenticateToken, listLeaveRequests);
router.get('/admin/leaves/approved', authenticateToken, authorizeRoles('admin'), listAdminApprovedLeaves);
router.post('/leaves', authenticateToken, createLeaveRequest);
router.patch('/leaves/:id/action', authenticateToken, actOnLeaveRequest);
router.get('/admin/attendance/month', authenticateToken, authorizeRoles('admin'), getAdminMonthlyAttendance);
router.post('/attendance/check-in', authenticateToken, checkIn);
router.patch('/attendance/location', authenticateToken, updateAttendanceLocation);
router.post('/attendance/check-out', authenticateToken, checkOut);
router.get('/admin/users', authenticateToken, authorizeRoles('admin'), listUsers);
router.patch('/admin/users/:id', authenticateToken, authorizeRoles('admin'), updateManagedUser);
router.get('/admin/organization', authenticateToken, authorizeRoles('admin'), listOrganizationSettings);
router.post('/admin/roles', authenticateToken, authorizeRoles('admin'), createRole);
router.delete('/admin/roles/:id', authenticateToken, authorizeRoles('admin'), deleteRole);
router.post('/admin/departments', authenticateToken, authorizeRoles('admin'), createDepartment);
router.delete('/admin/departments/:id', authenticateToken, authorizeRoles('admin'), deleteDepartment);

export default router;







