import { User } from "../models/user.model.js";
import { Company } from "../models/company.model.js";
import { Job } from "../models/job.model.js";
import { Application } from "../models/application.model.js";

export const getAllUsers = async (req, res) => {
  try {
    // Allow optional role-based filtering via query param (e.g., /api/admin/users?role=Recruiter)
    const role = req.query.role;
    const query = {};
    if (role) {
      // support case-insensitive exact matching (e.g., role=recruiter)
      query.role = { $regex: new RegExp(`^${role}$`, 'i') };
    }

    // Populate associated company for recruiter users so frontend can display company names
    const users = await User.find(query).sort({ createdAt: -1 }).populate('profile.company', 'name').select('-password');
    return res.status(200).json({ users, success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', success: false });
  }
};

export const getUserById = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found', success: false });
    return res.status(200).json({ user, success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', success: false });
  }
};

export const updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const { role, isBanned } = req.body;

    const updateData = {};
    if (typeof role !== 'undefined') {
      // only allow changing between Job Seeker and Recruiter; never promote to Administrator here
      if (role === 'Administrator') {
        return res.status(403).json({ message: 'Cannot assign Administrator role via this endpoint', success: false });
      }
      updateData.role = role;
    }
    if (typeof isBanned !== 'undefined') updateData.isBanned = !!isBanned;

    const user = await User.findByIdAndUpdate(userId, updateData, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found', success: false });
    return res.status(200).json({ user, success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', success: false });
  }
};

// Admin edits user profile (name, phoneNumber, basic details)
export const updateUserProfile = async (req, res) => {
  try {
    const userId = req.params.id;

    // Admin endpoint — callers are already validated by isAdmin middleware.
    const { fullname, phoneNumber, companyName, skills } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found', success: false });

    if (!user.profile) user.profile = {};

    if (typeof fullname !== 'undefined') user.fullname = fullname;
    if (typeof phoneNumber !== 'undefined') user.phoneNumber = phoneNumber;

    // Skills handling (admin may set skills as comma-separated string)
    if (typeof skills !== 'undefined') {
      try {
        user.profile.skills = (typeof skills === 'string' && skills.length > 0) ? skills.split(',').map(s => s.trim()).filter(Boolean) : [];
      } catch (err) {
        user.profile.skills = [];
      }
    }

    // Company name handling (admin may set / clear company association)
    if (typeof companyName !== 'undefined') {
      if (!companyName) {
        user.profile.company = undefined;
      } else {
        let company = await Company.findOne({ name: new RegExp(`^${companyName}$`, 'i') });
        if (!company) {
          try {
            company = new Company({ name: companyName, userId: user._id });
            await company.save();
          } catch (err) {
            company = await Company.findOne({ name: new RegExp(`^${companyName}$`, 'i') });
          }
        }
        if (company) user.profile.company = company._id;
      }
    }

    // Validate unique phone number if it was changed
    if (typeof phoneNumber !== 'undefined' && phoneNumber !== user.phoneNumber) {
      const existingPhone = await User.findOne({ phoneNumber });
      if (existingPhone && existingPhone._id.toString() !== user._id.toString()) {
        return res.status(400).json({ message: 'Phone number already in use by another account', success: false });
      }
    }

    try {
      await user.save();
    } catch (err) {
      // Handle duplicate key errors gracefully
      if (err && err.code === 11000) {
        const dupKey = Object.keys(err.keyValue || {})[0];
        const fieldName = dupKey === 'email' ? 'Email' : dupKey === 'phoneNumber' ? 'Phone number' : dupKey;
        return res.status(400).json({ message: `${fieldName} already exists`, success: false });
      }
      throw err; // rethrow to be caught by outer handler
    }

    // Include company name if available for convenience
    let companyObj = null;
    if (user.profile && user.profile.company) {
      try {
        companyObj = await Company.findById(user.profile.company).select('name');
      } catch (err) {
        companyObj = null;
      }
    }

    const sanitized = (await User.findById(userId).select('-password'));
    const userToReturn = {
      ...sanitized.toObject(),
      profile: {
        ...sanitized.profile?.toObject ? sanitized.profile.toObject() : sanitized.profile,
        company: companyObj ? { _id: companyObj._id, name: companyObj.name } : (sanitized.profile && sanitized.profile.company ? sanitized.profile.company : undefined),
      }
    };

    return res.status(200).json({ user: userToReturn, success: true });
  } catch (error) {
    console.error('updateUserProfile error', error);
    return res.status(500).json({ message: 'Server error', success: false });
  }
};

// Admin: register a new Administrator
export const registerAdmin = async (req, res) => {
  try {
    const { fullname, email, phoneNumber, password } = req.body;
    if (!fullname || !email || !phoneNumber || !password) {
      return res.status(400).json({ message: 'Missing required fields', success: false });
    }

    // prevent creation if email already exists
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already exists', success: false });

    const hashed = await import('bcryptjs').then(m => m.default.hash(password, 10));

    const newAdmin = new User({ fullname, email, phoneNumber, password: hashed, role: 'Administrator' });
    await newAdmin.save();

    return res.status(201).json({ message: 'Administrator account created', success: true, admin: { _id: newAdmin._id, fullname: newAdmin.fullname, email: newAdmin.email } });
  } catch (error) {
    console.error('registerAdmin error', error);
    return res.status(500).json({ message: 'Server error', success: false });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findByIdAndDelete(userId);
    if (!user) return res.status(404).json({ message: 'User not found', success: false });
    return res.status(200).json({ message: 'User deleted', success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', success: false });
  }
};

export const generateReport = async (req, res) => {
  try {
    // Optional date range filters: startDate, endDate (ISO strings)
    const { startDate, endDate } = req.query;
    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        // include the entire endDate day by setting to end of day
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        dateFilter.createdAt.$lte = e;
      }
    }

    const userCount = await User.countDocuments(dateFilter);
    const companyCount = await Company.countDocuments(startDate || endDate ? dateFilter : {});
    const jobMatch = {};
    if (startDate || endDate) jobMatch.createdAt = dateFilter.createdAt;
    const jobCount = await Job.countDocuments(jobMatch);

    const appMatch = {};
    if (startDate || endDate) appMatch.createdAt = dateFilter.createdAt;
    const applicationCount = await Application.countDocuments(appMatch);

    const latestUsers = await User.find(startDate || endDate ? dateFilter : {}).sort({ createdAt: -1 }).limit(5).select('fullname email createdAt');

    return res.status(200).json({
      success: true,
      data: { userCount, companyCount, jobCount, applicationCount, latestUsers },
    });
  } catch (error) {
    console.error('generateReport error', error);
    return res.status(500).json({ message: 'Server error', success: false });
  }
};

export const getDashboardStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalRecruiters = await User.countDocuments({ role: 'Recruiter' });
    // Count only jobs pending approval (exclude explicitly rejected jobs where a rejectionReason was provided)
    const pendingJobs = await Job.countDocuments({
      approved: { $ne: true },
      $or: [{ rejectionReason: { $exists: false } }, { rejectionReason: '' }],
    });

    return res.status(200).json({
      totalUsers,
      totalRecruiters,
      pendingJobs,
      success: true,
    });
  } catch (error) {
    console.error('getDashboardStats error', error);
    return res.status(500).json({ message: 'Server error', success: false });
  }
};

// Return a CSV-friendly JSON array of users (sanitized)
export const getUsersReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = {};
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23,59,59,999);
        filter.createdAt.$lte = e;
      }
    }

    const users = await User.find(filter).select('fullname email role createdAt').sort({ createdAt: -1 });
    // Map to plain objects for CSV conversion on frontend
    const data = users.map(u => ({
      fullname: u.fullname,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
    }));

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('getUsersReport error', error);
    return res.status(500).json({ message: 'Server error', success: false });
  }
};

// Return recruiter job posting activity: count of jobs grouped by recruiter
export const getRecruiterActivityReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const match = {};
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23,59,59,999);
        match.createdAt.$lte = e;
      }
    }

    // Aggregate jobs by creator with optional date filter
    const agg = await Job.aggregate([
      { $match: match },
      { $group: { _id: '$created_by', count: { $sum: 1 } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $project: { recruiterName: '$user.fullname', recruiterEmail: '$user.email', jobCount: '$count' } },
      { $sort: { jobCount: -1 } },
    ]);

    const data = agg.map(a => ({
      recruiterName: a.recruiterName || 'Unknown',
      recruiterEmail: a.recruiterEmail || 'Unknown',
      jobCount: a.jobCount || 0,
    }));

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('getRecruiterActivityReport error', error);
    return res.status(500).json({ message: 'Server error', success: false });
  }
};

// Company metrics and time-series for a given date range
export const getCompanyMetrics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const matchDate = {};
    if (startDate) matchDate.$gte = new Date(startDate);
    if (endDate) {
      const e = new Date(endDate);
      e.setHours(23,59,59,999);
      matchDate.$lte = e;
    }

    // Jobs per company
    const jobMatch = {};
    if (startDate || endDate) jobMatch.createdAt = matchDate;

    const jobsAgg = await Job.aggregate([
      { $match: jobMatch },
      { $group: { _id: '$company', jobCount: { $sum: 1 }, recruiters: { $addToSet: '$created_by' } } },
      { $lookup: { from: 'companies', localField: '_id', foreignField: '_id', as: 'company' } },
      { $unwind: { path: '$company', preserveNullAndEmptyArrays: true } },
      { $project: { companyId: '$_id', companyName: '$company.name', jobCount: 1, activeRecruiters: { $size: '$recruiters' } } },
      { $sort: { jobCount: -1 } }
    ]);

    // Applications per company (join to job to get company)
    const appMatch = {};
    if (startDate || endDate) appMatch.createdAt = matchDate;

    const appsAgg = await Application.aggregate([
      { $match: appMatch },
      { $lookup: { from: 'jobs', localField: 'job', foreignField: '_id', as: 'job' } },
      { $unwind: { path: '$job', preserveNullAndEmptyArrays: true } },
      { $group: { _id: '$job.company', applicationCount: { $sum: 1 } } },
      { $lookup: { from: 'companies', localField: '_id', foreignField: '_id', as: 'company' } },
      { $unwind: { path: '$company', preserveNullAndEmptyArrays: true } },
      { $project: { companyId: '$_id', companyName: '$company.name', applicationCount: 1 } }
    ]);

    // Map the two results together
    const companyMap = new Map();
    for (const j of jobsAgg) {
      companyMap.set(String(j.companyId), { companyId: j.companyId, companyName: j.companyName || 'Unknown', jobCount: j.jobCount || 0, applicationCount: 0, activeRecruiters: j.activeRecruiters || 0 });
    }
    for (const a of appsAgg) {
      const id = String(a.companyId);
      if (companyMap.has(id)) {
        companyMap.get(id).applicationCount = a.applicationCount || 0;
      } else {
        companyMap.set(id, { companyId: a.companyId, companyName: a.companyName || 'Unknown', jobCount: 0, applicationCount: a.applicationCount || 0, activeRecruiters: 0 });
      }
    }

    const companies = Array.from(companyMap.values());

    // Time series: users/jobs/applications per day
    const toDateStr = (d) => {
      return d.toISOString().slice(0,10);
    };

    const tsStart = startDate ? new Date(startDate) : new Date(Date.now() - 30*24*60*60*1000);
    const tsEnd = endDate ? new Date(endDate) : new Date();
    tsEnd.setHours(23,59,59,999);

    // Users per day
    const usersAgg = await User.aggregate([
      { $match: startDate || endDate ? { createdAt: matchDate } : {} },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    // Jobs per day
    const jobsTsAgg = await Job.aggregate([
      { $match: startDate || endDate ? { createdAt: matchDate } : {} },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    // Applications per day
    const appsTsAgg = await Application.aggregate([
      { $match: startDate || endDate ? { createdAt: matchDate } : {} },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    // Build series for each date in range
    const series = [];
    for (let d = new Date(tsStart); d <= tsEnd; d.setDate(d.getDate() + 1)) {
      const dateStr = toDateStr(d);
      const u = usersAgg.find(x => x._id === dateStr)?.count || 0;
      const j = jobsTsAgg.find(x => x._id === dateStr)?.count || 0;
      const a = appsTsAgg.find(x => x._id === dateStr)?.count || 0;
      series.push({ date: dateStr, users: u, jobs: j, applications: a });
    }

    return res.status(200).json({ success: true, data: { companies, series } });
  } catch (error) {
    console.error('getCompanyMetrics error', error);
    return res.status(500).json({ message: 'Server error', success: false });
  }
};

    // Return aggregated notifications addressed to administrators
    export const getAdminNotifications = async (req, res) => {
      try {
        // Find all admin users and collect their notifications
        const admins = await User.find({ role: 'Administrator' }).select('notifications fullname email');
        const allNotes = [];
        for (const a of admins) {
          const notes = (a.notifications || []).map(n => ({
            ...n.toObject ? n.toObject() : n,
            adminId: a._id,
            adminName: a.fullname,
            adminEmail: a.email,
          }));
          allNotes.push(...notes);
        }
        // Sort by createdAt desc
        allNotes.sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt));
        return res.status(200).json({ notifications: allNotes, success: true });
      } catch (error) {
        console.error('getAdminNotifications error', error);
        return res.status(500).json({ message: 'Server error', success: false });
      }
    };

// Mark a single notification as read for a given admin
export const markAdminNotificationRead = async (req, res) => {
  try {
    const { adminId, notifId } = req.params;
    if (!adminId || !notifId) return res.status(400).json({ message: 'adminId and notifId required', success: false });
    const admin = await User.findById(adminId);
    if (!admin) return res.status(404).json({ message: 'Admin not found', success: false });
    const notif = admin.notifications.id(notifId);
    if (!notif) return res.status(404).json({ message: 'Notification not found', success: false });
    notif.read = true;
    await admin.save();
    return res.status(200).json({ message: 'Notification marked read', success: true });
  } catch (error) {
    console.error('markAdminNotificationRead error', error);
    return res.status(500).json({ message: 'Server error', success: false });
  }
};

// Mark all notifications as read for a given admin
export const markAllAdminNotificationsRead = async (req, res) => {
  try {
    const { adminId } = req.params;
    if (!adminId) return res.status(400).json({ message: 'adminId required', success: false });
    const admin = await User.findById(adminId);
    if (!admin) return res.status(404).json({ message: 'Admin not found', success: false });
    admin.notifications = (admin.notifications || []).map(n => ({ ...n.toObject ? n.toObject() : n, read: true }));
    await admin.save();
    return res.status(200).json({ message: 'All notifications marked read', success: true });
  } catch (error) {
    console.error('markAllAdminNotificationsRead error', error);
    return res.status(500).json({ message: 'Server error', success: false });
  }
};
 
 