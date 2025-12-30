import { Application } from "../models/application.model.js";
import { Job } from "../models/job.model.js";
import { User } from "../models/user.model.js";
import createMeetingPlaceholder from "../utils/meeting.js";
import nodemailer from "nodemailer";

// POST /api/interviews/schedule
export const scheduleInterview = async (req, res) => {
  try {
    const recruiterId = req.id;
    const { applicationId, interviewTitle, startTime, duration, type = 'interview' } = req.body;
    if (!applicationId || !interviewTitle || !startTime || !duration) {
      return res.status(400).json({ message: 'Missing required fields', success: false });
    }

    // find application and related job
    const application = await Application.findById(applicationId).populate('job applicant');
    if (!application) return res.status(404).json({ message: 'Application not found', success: false });

    const job = await Job.findById(application.job._id);
    if (!job) return res.status(404).json({ message: 'Job not found', success: false });

    // ensure the requester is the recruiter who created the job
    if (!recruiterId || job.created_by.toString() !== recruiterId.toString()) {
      return res.status(403).json({ message: 'Not authorized to schedule interview for this job', success: false });
    }

    // Create meeting (placeholder for real API)
    const meeting = await createMeetingPlaceholder({ title: interviewTitle, startTime, duration });

    // Update application with interview details, include type and reset reminder flag
    application.interview = {
      meetingLink: meeting.meetingLink,
      eventId: meeting.eventId,
      interviewTitle,
      startTime: new Date(startTime),
      duration: Number(duration),
      type,
      reminderSent: false,
    };
    application.interviewStatus = 'scheduled';
    await application.save();

    // Push a notification to the applicant
    try {
      const applicant = await User.findById(application.applicant);
      if (applicant) {
        applicant.notifications = applicant.notifications || [];
        const notifType = type === 'written_exam' ? 'exam_scheduled' : 'interview_scheduled';
        applicant.notifications.unshift({
          type: notifType,
          message: `${type === 'written_exam' ? 'A written exam' : 'An interview'} has been scheduled for ${application.job.title}: ${interviewTitle}`,
          data: { applicationId: application._id, meetingLink: meeting.meetingLink, startTime, type },
          read: false,
        });
        await applicant.save();
      }
    } catch (notifErr) {
      console.error('Failed to notify applicant', notifErr);
    }

    // Optionally send email if SMTP configured
    try {
      if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });
        const applicant = await User.findById(application.applicant).select('email fullname');
        if (applicant && applicant.email) {
          const subject = type === 'written_exam' ? 'Written Exam Scheduled' : 'Interview Scheduled';
          const htmlBody = `<p>Your ${type === 'written_exam' ? '<strong>written exam</strong>' : '<strong>interview</strong>'} for <strong>${application.job.title}</strong> is scheduled at <strong>${new Date(startTime).toLocaleString()}</strong>.</p>${meeting.meetingLink ? `<p><a href="${meeting.meetingLink}">Join Meeting</a></p>` : ''}`;
          await transporter.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: applicant.email,
            subject,
            text: `Your ${type === 'written_exam' ? 'written exam' : 'interview'} for ${application.job.title} is scheduled at ${new Date(startTime).toLocaleString()}. ${meeting.meetingLink ? `Join: ${meeting.meetingLink}` : ''}`,
            html: htmlBody,
          });
        }
      }
    } catch (mailErr) {
      console.error('Failed to send interview email', mailErr);
    }

    return res.status(200).json({ message: `${type === 'written_exam' ? 'Written exam' : 'Interview'} scheduled`, success: true, meeting });
  } catch (error) {
    console.error('scheduleInterview error', error);
    return res.status(500).json({ message: 'Server error', success: false });
  }
};

// GET /api/interviews/applicant
export const getApplicantInterviews = async (req, res) => {
  try {
    const applicantId = req.id;
    if (!applicantId) return res.status(401).json({ message: 'Unauthorized', success: false });
    const applications = await Application.find({ applicant: applicantId, interviewStatus: 'scheduled' }).populate('job');
    return res.status(200).json({ interviews: applications.map(a => ({ applicationId: a._id, interview: a.interview, job: a.job, interviewStatus: a.interviewStatus })), success: true });
  } catch (error) {
    console.error('getApplicantInterviews error', error);
    return res.status(500).json({ message: 'Server error', success: false });
  }
};

// GET /api/interviews/:applicationId
export const getInterviewByApplication = async (req, res) => {
  try {
    const userId = req.id;
    const applicationId = req.params.id;
    const application = await Application.findById(applicationId).populate('job applicant');
    if (!application) return res.status(404).json({ message: 'Application not found', success: false });
    // allow applicant or job owner to view
    const job = await Job.findById(application.job._id);
    if (!userId) return res.status(401).json({ message: 'Unauthorized', success: false });
    if (application.applicant._id.toString() !== userId.toString() && job.created_by.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Not authorized', success: false });
    }
    return res.status(200).json({ interview: application.interview, interviewStatus: application.interviewStatus, job: application.job, success: true });
  } catch (error) {
    console.error('getInterviewByApplication error', error);
    return res.status(500).json({ message: 'Server error', success: false });
  }
};

export default {
  scheduleInterview,
  getApplicantInterviews,
  getInterviewByApplication,
};
