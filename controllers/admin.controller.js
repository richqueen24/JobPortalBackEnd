import { User } from "../models/user.model.js";
import { Company } from "../models/company.model.js";
import { Job } from "../models/job.model.js";
import { Application } from "../models/application.model.js";

export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 }).select('-password');
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
    const updates = req.body;
    // prevent changing role to Administrator via this endpoint for safety
    if (updates.role && updates.role === 'Administrator') delete updates.role;
    const user = await User.findByIdAndUpdate(userId, updates, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found', success: false });
    return res.status(200).json({ user, success: true });
  } catch (error) {
    console.error(error);
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
    const userCount = await User.countDocuments();
    const companyCount = await Company.countDocuments();
    const jobCount = await Job.countDocuments();
    const applicationCount = await Application.countDocuments();
    const latestUsers = await User.find().sort({ createdAt: -1 }).limit(5).select('fullname email createdAt');

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
    // If your Job model has an approval/status field, replace this with the proper filter.
    const pendingJobs = await Job.countDocuments();

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
    const users = await User.find().select('fullname email role createdAt').sort({ createdAt: -1 });
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
    // Aggregate jobs by creator
    const agg = await Job.aggregate([
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
 
 