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
      location,
      jobType,
      experience,
      position,
      companyId,
    } = req.body;
    const userId = req.id;

    if (
      !title ||
      !description ||
      !requirements ||
      !salary ||
      !location ||
      !jobType ||
      !experience ||
      !position ||
      !companyId
    ) {
      return res.status(400).json({
        message: "All fields are required",
        success: false,
      });
    }
    const job = await Job.create({
      title,
      description,
      requirements: requirements.split(","),
      salary: Number(salary),
      location,
      jobType,
      experienceLevel: experience,
      position,
      company: companyId,
      created_by: userId,
    });
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
    console.error(error);
    return res.status(500).json({ message: "Server Error", status: false });
  }
};

//Users
export const getJobById = async (req, res) => {
  try {
    const jobId = req.params.id;
    const job = await Job.findById(jobId).populate({
      path: "applications",
    });
    if (!job) {
      return res.status(404).json({ message: "Job not found", status: false });
    }
    return res.status(200).json({ job, status: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server Error", status: false });
  }
};

//Admin job created

export const getAdminJobs = async (req, res) => {
  try {
    const adminId = req.id; // may be undefined for special admin token
    let jobs;
    if (adminId) {
      // normal behaviour: return jobs created by this user
      jobs = await Job.find({ created_by: adminId }).populate({
        path: "company",
      }).sort({ createdAt: -1 });
    } else {
      // admin or system token: return all jobs
      jobs = await Job.find().populate({ path: "company" }).sort({ createdAt: -1 });
    }

    // Always return an array (possibly empty)
    return res.status(200).json({ jobs: jobs || [], status: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server Error", status: false });
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
      location,
      jobType,
      experience,
      position,
      companyId,
    } = req.body;

    const updateData = {};
    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (requirements) updateData.requirements = Array.isArray(requirements) ? requirements : requirements.split(',');
    if (salary) updateData.salary = Number(salary);
    if (location) updateData.location = location;
    if (jobType) updateData.jobType = jobType;
    if (experience) updateData.experienceLevel = experience;
    if (position) updateData.position = position;
    if (companyId) updateData.company = companyId;

    const updated = await Job.findByIdAndUpdate(jobId, updateData, { new: true }).populate('company');
    if (!updated) return res.status(404).json({ message: 'Job not found', status: false });
    return res.status(200).json({ job: updated, status: true, message: 'Job updated' });
  } catch (error) {
    console.error('updateJob error', error);
    return res.status(500).json({ message: 'Server Error', status: false });
  }
};

// Admin: delete a job by id
export const deleteJob = async (req, res) => {
  try {
    const jobId = req.params.id;
    const removed = await Job.findByIdAndDelete(jobId);
    if (!removed) return res.status(404).json({ message: 'Job not found', status: false });
    return res.status(200).json({ message: 'Job deleted', status: true });
  } catch (error) {
    console.error('deleteJob error', error);
    return res.status(500).json({ message: 'Server Error', status: false });
  }
};