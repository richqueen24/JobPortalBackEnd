import express from 'express';
import isAdmin from '../middleware/isAdmin.js';
import { getAllUsers, getUserById, updateUser, deleteUser, generateReport, getDashboardStats, getUsersReport, getRecruiterActivityReport, getAdminNotifications, markAdminNotificationRead, markAllAdminNotificationsRead, updateUserProfile, registerAdmin, getCompanyMetrics } from '../controllers/admin.controller.js';
import { getAdminJobs, approveJob, rejectJob } from '../controllers/job.controller.js';

const router = express.Router();

router.use(isAdmin);

router.get('/users', getAllUsers);
router.get('/notifications', getAdminNotifications);
router.get('/users/:id', getUserById);
router.post('/notifications/:adminId/:notifId/read', markAdminNotificationRead);
router.post('/notifications/:adminId/read-all', markAllAdminNotificationsRead);
router.put('/users/:id', updateUser);
// Admin can edit user profile (name, phone etc.) via this endpoint
router.put('/users/:id/profile', updateUserProfile);
router.delete('/user/:id', deleteUser);
router.post('/register-admin', registerAdmin);
router.get('/report', generateReport);
router.get('/dashboard/stats', getDashboardStats);
// Report endpoints
router.get('/reports/users', getUsersReport);
router.get('/reports/recruiter-activity', getRecruiterActivityReport);
router.get('/reports/company-metrics', getCompanyMetrics);
// Admin job management: admins may view all jobs and approve/reject pending postings (no direct edit/delete by admin)
router.get('/jobs', getAdminJobs);
router.post('/jobs/:id/approve', approveJob);
router.post('/jobs/:id/reject', rejectJob);

export default router;
 
