import express from 'express';
import authenticateToken from '../middleware/isAuthenticated.js';
import { scheduleInterview, getApplicantInterviews, getInterviewByApplication } from '../controllers/interview.controller.js';

const router = express.Router();

router.post('/schedule', authenticateToken, scheduleInterview);
router.get('/applicant', authenticateToken, getApplicantInterviews);
router.get('/:id', authenticateToken, getInterviewByApplication);

export default router;
