import { Application } from '../models/application.model.js';
import { User } from '../models/user.model.js';
import { Job } from '../models/job.model.js';
import nodemailer from 'nodemailer';

// Runs periodically (every 15 minutes) to find scheduled events that start ~24 hours from now and send reminders.
export const startReminderService = (intervalMinutes = 15) => {
  console.log('Starting reminder service; interval (minutes):', intervalMinutes);
  const checkAndSend = async () => {
    try {
      const now = Date.now();
      const targetStartLower = new Date(now + 24 * 60 * 60 * 1000); // ~24h ahead
      const targetStartUpper = new Date(now + 24 * 60 * 60 * 1000 + intervalMinutes * 60 * 1000); // plus interval window

      // find applications with scheduled interview/exam in the target window and reminder not sent
      const apps = await Application.find({
        interviewStatus: 'scheduled',
        'interview.reminderSent': { $ne: true },
        'interview.startTime': { $gte: targetStartLower, $lt: targetStartUpper },
      }).populate('applicant').populate('job');

      if (!apps || apps.length === 0) {
        return;
      }

      // Prepare transporter if SMTP is configured
      let transporter = null;
      if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });
      }

      for (const application of apps) {
        try {
          const applicant = application.applicant;
          const jobItem = application.job;
          const event = application.interview || {};
          const t = new Date(event.startTime).toLocaleString();

          // push in-app notification
          try {
            if (applicant) {
              applicant.notifications = applicant.notifications || [];
              const notifType = event.type === 'written_exam' ? 'exam_reminder' : 'interview_reminder';
              applicant.notifications.unshift({
                type: notifType,
                message: `Reminder: your ${event.type === 'written_exam' ? 'written exam' : 'interview'} for ${jobItem?.title || 'a job'} is scheduled at ${t}`,
                data: { applicationId: application._id, startTime: event.startTime, meetingLink: event.meetingLink, type: event.type },
                read: false,
              });
              await applicant.save();
            }
          } catch (notifErr) {
            console.error('Failed to add in-app reminder notification', notifErr);
          }

          // send email if transporter exists and applicant.email present
          try {
            if (transporter && applicant && applicant.email) {
              const subject = event.type === 'written_exam' ? 'Reminder: Written Exam Tomorrow' : 'Reminder: Interview Tomorrow';
              const html = `<p>Reminder: your <strong>${event.type === 'written_exam' ? 'written exam' : 'interview'}</strong> for <strong>${jobItem?.title || ''}</strong> is scheduled at <strong>${t}</strong>.</p>${event.meetingLink ? `<p><a href="${event.meetingLink}">Join Meeting</a></p>` : ''}`;
              await transporter.sendMail({
                from: process.env.SMTP_FROM || process.env.SMTP_USER,
                to: applicant.email,
                subject,
                text: `Reminder: your ${event.type === 'written_exam' ? 'written exam' : 'interview'} for ${jobItem?.title || ''} is scheduled at ${t}. ${event.meetingLink ? `Join: ${event.meetingLink}` : ''}`,
                html,
              });
            } else {
              // In dev, log the reminder
              console.log(`Reminder: ${application._id} - ${event.type} scheduled at ${t} (no SMTP configured)`);
            }
          } catch (mailErr) {
            console.error('Failed to send reminder email', mailErr);
          }

          // mark reminder sent to avoid duplicates
          application.interview = { ...application.interview, reminderSent: true };
          await application.save();
        } catch (err) {
          console.error('Failed to process single application reminder', err);
        }
      }
    } catch (err) {
      console.error('Reminder service error', err);
    }
  };

  // run immediately once, then schedule
  checkAndSend();
  const timer = setInterval(checkAndSend, intervalMinutes * 60 * 1000);
  return () => clearInterval(timer);
};

export default startReminderService;