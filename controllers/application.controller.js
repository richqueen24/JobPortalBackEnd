import { Application } from "../models/application.model.js";
import { Job } from "../models/job.model.js";
import { User } from "../models/user.model.js";

export const applyJob = async (req, res) => {
  try {
    const userId = req.id;
    if (!userId) {
      return res
        .status(401)
        .json({ message: "Authentication required", success: false });
    }
    const jobId = req.params.id;
    if (!jobId) {
      return res
        .status(400)
        .json({ message: "Invalid job id", success: false });
    }
    // check if the user already has applied for this job
    const existingApplication = await Application.findOne({
      job: jobId,
      applicant: userId,
    });
    if (existingApplication) {
      return res.status(400).json({
        message: "You have already applied for this job",
        success: false,
      });
    }
    //check if the job exists or not
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ message: "Job not found", success: false });
    }
    // create a new application

    const newApplication = await Application.create({
      job: jobId,
      applicant: userId,
    });
    job.applications.push(newApplication._id);
    await job.save();

    // Notify the recruiter (job created_by) that someone applied
    try {
      const recruiterId = job.created_by;
      const applicantUser = await User.findById(userId).select("fullname");
      if (recruiterId) {
        const recruiter = await User.findById(recruiterId);
        if (recruiter) {
          recruiter.notifications = recruiter.notifications || [];
          recruiter.notifications.unshift({
            type: "application",
            message: `${applicantUser.fullname} applied to your job: ${job.title}`,
            data: { jobId: job._id, applicationId: newApplication._id, applicantId: userId },
            read: false,
          });
          await recruiter.save();
        }
      }
    } catch (notifErr) {
      console.error("Failed to create recruiter notification:", notifErr);
    }

    return res
      .status(201)
      .json({ message: "Application submitted", success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", success: false });
  }
};

export const getAppliedJobs = async (req, res) => {
  try {
    const userId = req.id;
    const application = await Application.find({ applicant: userId })
      .sort({ createdAt: -1 })
      .populate({
        path: "job",
        options: { sort: { createdAt: -1 } },
        populate: { path: "company", options: { sort: { createdAt: -1 } } },
      });
    if (!application) {
      return res
        .status(404)
        .json({ message: "No applications found", success: false });
    }

    return res.status(200).json({ application, success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", success: false });
  }
};

export const getApplicants = async (req, res) => {
  try {
    const jobId = req.params.id;
    const job = await Job.findById(jobId).populate({
      path: "applications",
      options: { sort: { createdAt: -1 } },
      populate: {
        path: "applicant",
        options: { sort: { createdAt: -1 } },
        select: "fullname email phoneNumber profile role",
      },
    });
    if (!job) {
      return res.status(404).json({ message: "Job not found", success: false });
    }

    return res.status(200).json({ job, success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", success: false });
  }
};

export const updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const applicationId = req.params.id;
    if (!status) {
      return res.status(400).json({
        message: "status is required",
        success: false,
      });
    }

    // find the application by applicantion id
    const application = await Application.findOne({ _id: applicationId });
    if (!application) {
      return res.status(404).json({
        message: "Application not found.",
        success: false,
      });
    }

    // update the status
    application.status = status.toLowerCase();
    await application.save();

    // If accepted, create or reuse a chat conversation between recruiter and applicant
    let conversationId = null;
    try {
      if (application.status === 'accepted') {
        const jobItem = await Job.findById(application.job).select('created_by title');
        const recruiterId = jobItem?.created_by;
        if (recruiterId) {
          // lazy-load Chat model to avoid circular deps
          const { Chat } = await import('../models/chat.model.js');
          // check for existing convo between the two participants
          const participants = [application.applicant.toString(), recruiterId.toString()];
          let convo = await Chat.findOne({ participants: { $all: participants, $size: 2 } });
          if (!convo) {
            convo = await Chat.create({ participants });
          }
          conversationId = convo._id;

          // Notify the applicant about status change and include conversationId so applicant can open chat
          try {
            const applicant = await User.findById(application.applicant);
            const jobItem2 = jobItem || (await Job.findById(application.job).select('title'));
            if (applicant) {
              applicant.notifications = applicant.notifications || [];
              applicant.notifications.unshift({
                type: "status_update",
                message: `Your application for ${jobItem2?.title || 'a job'} was accepted. Open chat to view interview schedule.`,
                data: { applicationId: application._id, jobId: application.job, status: application.status, conversationId },
                read: false,
              });
              await applicant.save();
            }
          } catch (notifErr) {
            console.error("Failed to notify applicant:", notifErr);
          }
        }
      } else {
        // for non-accepted statuses, notify as before without conversationId
        try {
          const applicant = await User.findById(application.applicant);
          const jobItem = await Job.findById(application.job).select("title");
          if (applicant) {
            applicant.notifications = applicant.notifications || [];
            applicant.notifications.unshift({
              type: "status_update",
              message: `Your application for ${jobItem?.title || 'a job'} was ${application.status}`,
              data: { applicationId: application._id, jobId: application.job, status: application.status },
              read: false,
            });
            await applicant.save();
          }
        } catch (notifErr) {
          console.error("Failed to notify applicant:", notifErr);
        }
      }
    } catch (chatErr) {
      console.error('Failed to create conversation on acceptance:', chatErr);
    }

    return res.status(200).json({ message: "Application status updated", success: true, conversationId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", success: false });
  }
};