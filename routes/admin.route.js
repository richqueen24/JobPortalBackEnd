import express from 'express';
import isAdmin from '../middleware/isAdmin.js';
import { getAllUsers, getUserById, updateUser, deleteUser, generateReport, getDashboardStats, getUsersReport, getRecruiterActivityReport, getAdminNotifications, markAdminNotificationRead, markAllAdminNotificationsRead } from '../controllers/admin.controller.js';
import { getAdminJobs, updateJob, deleteJob } from '../controllers/job.controller.js';

const router = express.Router();

router.use(isAdmin);

router.get('/users', getAllUsers);
router.get('/notifications', getAdminNotifications);
router.get('/users/:id', getUserById);
router.post('/notifications/:adminId/:notifId/read', markAdminNotificationRead);
router.post('/notifications/:adminId/read-all', markAllAdminNotificationsRead);
router.put('/users/:id', updateUser);
router.delete('/user/:id', deleteUser);
router.get('/report', generateReport);
router.get('/dashboard/stats', getDashboardStats);
// Report endpoints
router.get('/reports/users', getUsersReport);
router.get('/reports/recruiter-activity', getRecruiterActivityReport);
// Admin job management
router.get('/jobs', getAdminJobs);
router.put('/jobs/:id', updateJob);
router.delete('/jobs/:id', deleteJob);

export default router;
 
