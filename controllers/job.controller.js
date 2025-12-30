import { Job } from "../models/job.model.js";
import { User } from "../models/user.model.js";
//Admin job posting
export const postJob = async (req, res) => {
  try {
    const {
      title,
      description,
      requirements,
      salary,
      salaryMin,
      salaryMax,
      currency,
      applicationDeadline,
      location,
      jobType,
      experience,
      position,
      companyId,
    } = req.body;
    const userId = req.id;

    // Administrators are not allowed to post jobs
    if (userId) {
      const caller = await User.findById(userId).select('role isBanned');
      if (caller && caller.role === 'Administrator') {
        return res.status(403).json({ message: 'Administrators are not allowed to post job postings', success: false });
      }
      // Banned recruiters cannot post jobs
      if (caller && caller.isBanned) {
        return res.status(403).json({ message: 'Your account has been banned. Posting is disabled.', success: false });
      }
    }

    // require either legacy salary OR both min & max (range)
    const hasSalary = (salary !== undefined && salary !== null && salary !== "") || (salaryMin !== undefined && salaryMax !== undefined && salaryMin !== "" && salaryMax !== "");

    if (
      !title ||
      !description ||
      !requirements ||
      !hasSalary ||
      !location ||
      !jobType ||
      !experience ||
      !position ||
      !companyId
    ) {
      return res.status(400).json({
        message: "All required fields are missing or invalid",
        success: false,
      });
    }
    const jobPayload = {
      title,
      description,
      requirements: Array.isArray(requirements) ? requirements : requirements.split(","),
      location,
      jobType,
      experienceLevel: experience,
      position,
      company: companyId,
      created_by: userId,
      approved: false, // requires admin approval before going live
    };

    if (salary !== undefined && salary !== null && salary !== "") jobPayload.salary = Number(salary);
    if (salaryMin !== undefined && salaryMin !== null && salaryMin !== "") jobPayload.salaryMin = Number(salaryMin);
    if (salaryMax !== undefined && salaryMax !== null && salaryMax !== "") jobPayload.salaryMax = Number(salaryMax);
    if (currency) jobPayload.currency = currency;
    if (applicationDeadline) jobPayload.applicationDeadline = new Date(applicationDeadline);

    const job = await Job.create(jobPayload);
    // Notify administrators about the new job posting
    try {
      const admins = await User.find({ role: 'Administrator' });
      if (admins && admins.length) {
        const note = {
          type: 'new_job',
          message: `New job posted: ${job.title}`,
          data: { jobId: job._id, companyId: job.company },
          read: false,
        };
        for (const a of admins) {
          a.notifications = a.notifications || [];
          a.notifications.unshift(note);
          a.save().catch((e) => console.error('Failed to save admin notification', e));
        }
      }
    } catch (notifErr) {
      console.error('Failed to notify admins about new job:', notifErr);
    }
    res.status(201).json({
      message: "Job posted successfully.",
      job,
      status: true,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server Error", status: false });
  }
};

//Users
export const getAllJobs = async (req, res) => {
  try {
    const keyword = req.query.keyword || "";
    const exact = req.query.exact === 'true' || req.query.exact === true;
    // Utility to escape regex special characters in the keyword
    const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
    let query = {};
    if (keyword) {
      const escaped = escapeRegex(keyword);
      // build OR clauses only for string fields (regex works on strings/arrays)
      const orClauses = [];
      if (exact) {
        const k = `^${escaped}$`;
        orClauses.push({ title: { $regex: k, $options: "i" } });
        orClauses.push({ description: { $regex: k, $options: "i" } });
        orClauses.push({ requirements: { $regex: k, $options: "i" } });
        orClauses.push({ location: { $regex: k, $options: "i" } });
      } else {
        orClauses.push({ title: { $regex: escaped, $options: "i" } });
        orClauses.push({ description: { $regex: escaped, $options: "i" } });
        orClauses.push({ requirements: { $regex: escaped, $options: "i" } });
        orClauses.push({ location: { $regex: escaped, $options: "i" } });
      }

      // If the keyword is a number (e.g., searching by position), add a numeric match
      const parsedNum = Number(keyword);
      if (!Number.isNaN(parsedNum)) {
        orClauses.push({ position: parsedNum });
      }

      if (orClauses.length) query = { $or: orClauses };
    }
    // Only return approved jobs for public listing
    query = { ...(query || {}), approved: true };
    const jobs = await Job.find(query)
      .populate({
        path: "company",
      })
      .sort({ createdAt: -1 });

    if (!jobs) {
      return res.status(404).json({ message: "No jobs found", status: false });
    }
    return res.status(200).json({ jobs, status: true });
  } catch (error) {
    console.error('getAllJobs error', error && error.stack ? error.stack : error);
    return res.status(500).json({ message: "Server Error", status: false, error: process.env.NODE_ENV === 'production' ? undefined : (error && error.message ? error.message : String(error)) });
  }
};

//Users
export const getJobById = async (req, res) => {
  try {
    const jobId = req.params.id;
    const job = await Job.findById(jobId)
      .populate({ path: "applications" })
      .populate({ path: "company" })
      .populate({ path: 'created_by', select: 'fullname email phoneNumber role profile' });
    if (!job) {
      return res.status(404).json({ message: "Job not found", status: false });
    }
    return res.status(200).json({ job, status: true });
  } catch (error) {
    console.error('getJobById error', error && error.stack ? error.stack : error);
    return res.status(500).json({ message: "Server Error", status: false, error: process.env.NODE_ENV === 'production' ? undefined : (error && error.message ? error.message : String(error)) });
  }
};

//Admin job created

export const getAdminJobs = async (req, res) => {
  try {
    const adminId = req.id; // may be undefined for special admin token
    const pending = req.query.pending === 'true' || req.query.pending === '1';
    const approvedParam = req.query.approved === 'true' || req.query.approved === '1';
    const rejectedParam = req.query.rejected === 'true' || req.query.rejected === '1';

    let jobs;

    if (pending) {
      // Only Administrators should be allowed to view pending job postings
      if (adminId) {
        const caller = await User.findById(adminId);
        if (!caller || caller.role !== 'Administrator') return res.status(403).json({ message: 'Forbidden', status: false });
      }
      // return all pending jobs across recruiters (exclude explicitly rejected jobs)
      jobs = await Job.find({
        approved: { $ne: true },
        $or: [{ rejectionReason: { $exists: false } }, { rejectionReason: '' }],
      })
        .populate({ path: 'company' })
        .populate({ path: 'created_by', select: 'fullname email phoneNumber profile role' })
        .sort({ createdAt: -1 });
    } else if (approvedParam) {
      // return approved jobs
      if (adminId) {
        jobs = await Job.find({ created_by: adminId, approved: true })
          .populate({ path: 'company' })
          .populate({ path: 'created_by', select: 'fullname email phoneNumber profile role' })
          .sort({ createdAt: -1 });
      } else {
        jobs = await Job.find({ approved: true })
          .populate({ path: 'company' })
          .populate({ path: 'created_by', select: 'fullname email phoneNumber profile role' })
          .sort({ createdAt: -1 });
      }
    } else if (rejectedParam) {
      // return explicitly rejected jobs
      if (adminId) {
        jobs = await Job.find({ created_by: adminId, approved: { $ne: true }, rejectionReason: { $exists: true, $ne: '' } })
          .populate({ path: 'company' })
          .populate({ path: 'created_by', select: 'fullname email phoneNumber profile role' })
          .sort({ createdAt: -1 });
      } else {
        jobs = await Job.find({ approved: { $ne: true }, rejectionReason: { $exists: true, $ne: '' } })
          .populate({ path: 'company' })
          .populate({ path: 'created_by', select: 'fullname email phoneNumber profile role' })
          .sort({ createdAt: -1 });
      }
    } else {
      if (adminId) {
        // normal behaviour: return jobs created by this user
        jobs = await Job.find({ created_by: adminId }).populate({ path: "company" }).populate({ path: 'created_by', select: 'fullname email phoneNumber profile role' }).sort({ createdAt: -1 });
      } else {
        // admin or system token: return all jobs
        jobs = await Job.find().populate({ path: "company" }).populate({ path: 'created_by', select: 'fullname email phoneNumber profile role' }).sort({ createdAt: -1 });
      }
    }

    // Always return an array (possibly empty)
    return res.status(200).json({ jobs: jobs || [], status: true });
  } catch (error) {
    console.error('getAdminJobs error', error && error.stack ? error.stack : error);
    return res.status(500).json({ message: "Server Error", status: false, error: process.env.NODE_ENV === 'production' ? undefined : (error && error.message ? error.message : String(error)) });
  }
};

// Admin: update a job by id
export const updateJob = async (req, res) => {
  try {
    const jobId = req.params.id;
    const {
      title,
      description,
      requirements,
      salary,
      salaryMin,
      salaryMax,
      currency,
      applicationDeadline,
      location,
      jobType,
      experience,
      position,
      companyId,
      approved,
      rejectionReason,
    } = req.body;

    // Fetch job to perform ownership and authorization checks
    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ message: 'Job not found', status: false });

    // Only the creator (recruiter) may update this job's content or operational status.
    // Administrators are NOT allowed to edit job details or delete jobs here — they may only use approve/reject endpoints.
    if (!req.id || String(job.created_by) !== String(req.id)) {
      return res.status(403).json({ message: 'Forbidden - only the job creator may modify this job', status: false });
    }

    // Disallow changing approval/rejection via this endpoint (admin should use approve/reject endpoints)
    if (typeof approved !== 'undefined' || typeof rejectionReason !== 'undefined') {
      return res.status(403).json({ message: 'Approval state cannot be set via this endpoint', status: false });
    }

    const updateData = {};
    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (requirements) updateData.requirements = Array.isArray(requirements) ? requirements : requirements.split(',');
    if (salary !== undefined && salary !== null && salary !== "") updateData.salary = Number(salary);
    if (salaryMin !== undefined && salaryMin !== null && salaryMin !== "") updateData.salaryMin = Number(salaryMin);
    if (salaryMax !== undefined && salaryMax !== null && salaryMax !== "") updateData.salaryMax = Number(salaryMax);
    if (currency) updateData.currency = currency;
    if (applicationDeadline) updateData.applicationDeadline = new Date(applicationDeadline);
    if (location) updateData.location = location;
    if (jobType) updateData.jobType = jobType;
    if (experience) updateData.experienceLevel = experience;
    if (position) updateData.position = position;
    if (companyId) updateData.company = companyId;

    // Allow job creator (recruiter) to update operational status
    if (typeof status !== 'undefined') {
      const allowed = ['open', 'paused', 'closed'];
      if (!allowed.includes(String(status))) {
        return res.status(400).json({ message: 'Invalid status', status: false });
      }
      updateData.status = String(status);
    }

    // Approval/rejection is not modifiable here (admins use dedicated endpoints)
    if (typeof approved !== 'undefined' || typeof rejectionReason !== 'undefined') {
      return res.status(403).json({ message: 'Approval state cannot be set via this endpoint', status: false });
    }

    const updated = await Job.findByIdAndUpdate(jobId, updateData, { new: true }).populate('company');
    if (!updated) return res.status(404).json({ message: 'Job not found', status: false });
    return res.status(200).json({ job: updated, status: true, message: 'Job updated' });
  } catch (error) {
    console.error('updateJob error', error);
    return res.status(500).json({ message: 'Server Error', status: false });
  }
};

// Admin: approve a job
export const approveJob = async (req, res) => {
  try {
    const jobId = req.params.id;
    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ message: 'Job not found', status: false });

    job.approved = true;
    job.approvedBy = req.id;
    job.approvedAt = new Date();
    job.rejectionReason = '';
    await job.save();

    // Notify job creator
    try {
      const creator = await User.findById(job.created_by);
      if (creator) {
        creator.notifications = creator.notifications || [];
        creator.notifications.unshift({ type: 'job_approved', message: `Your job "${job.title}" was approved.`, data: { jobId: job._id }, read: false });
        await creator.save();
      }
    } catch (notifErr) {
      console.error('Failed to notify creator about approval', notifErr);
    }

    return res.status(200).json({ message: 'Job approved', success: true, job });
  } catch (error) {
    console.error('approveJob error', error);
    return res.status(500).json({ message: 'Server error', success: false });
  }
};

// Admin: reject a job
export const rejectJob = async (req, res) => {
  try {
    const jobId = req.params.id;
    const { reason = '' } = req.body;
    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ message: 'Job not found', status: false });

    job.approved = false;
    job.rejectionReason = reason;
    await job.save();

    try {
      const creator = await User.findById(job.created_by);
      if (creator) {
        creator.notifications = creator.notifications || [];
        creator.notifications.unshift({ type: 'job_rejected', message: `Your job "${job.title}" was rejected. Reason: ${reason}`, data: { jobId: job._id, reason }, read: false });
        await creator.save();
      }
    } catch (notifErr) {
      console.error('Failed to notify creator about rejection', notifErr);
    }

    return res.status(200).json({ message: 'Job rejected', success: true, job });
  } catch (error) {
    console.error('rejectJob error', error);
    return res.status(500).json({ message: 'Server error', success: false });
  }
};

// Admin: delete a job by id
export const deleteJob = async (req, res) => {
  try {
    const jobId = req.params.id;
    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ message: 'Job not found', status: false });

    // Only the creator (recruiter) may delete their job postings. Administrators may NOT delete jobs here.
    if (!req.id || String(job.created_by) !== String(req.id)) {
      return res.status(403).json({ message: 'Forbidden - only the job creator may delete this job', status: false });
    }

    const removed = await Job.findByIdAndDelete(jobId);
    if (!removed) return res.status(404).json({ message: 'Job not found', status: false });
    return res.status(200).json({ message: 'Job deleted', status: true });
  } catch (error) {
    console.error('deleteJob error', error);
    return res.status(500).json({ message: 'Server Error', status: false });
  }
};