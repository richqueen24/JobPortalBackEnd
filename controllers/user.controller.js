import { User } from "../models/user.model.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import getDataUri from "../utils/datauri.js";
import cloudinary from "../utils/cloud.js";
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

// Normalize role strings to canonical values used in the schema
const normalizeRoleString = (r) => {
    if (!r) return r;
    const s = String(r).trim().toLowerCase();
    if (s === 'student') return 'Job Seeker';
    if (s === 'job seeker' || s === 'jobseeker') return 'Job Seeker';
    if (s === 'recruiter') return 'Recruiter';
    if (s === 'administrator' || s === 'admin') return 'Administrator';
    return r;
};

// REGISTER

export const register = async (req, res) => {
    let profilePhotoUrl = null;
    try {
        const { fullname, email, phoneNumber, password, role } = req.body;
        
        const file = req.file; 

        if (!fullname || !email || !phoneNumber || !password || !role) {
            return res.status(400).json({
                message: "Missing required fields",
                success: false,
            });
        }

        const user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({
                message: "Email already exists",
                success: false,
            });
        }

        
        if (file) {
            try {
                // If diskStorage is used, multer already saved the file to disk
                if (file.path || file.filename) {
                    const filename = file.filename || path.basename(file.path);
                    profilePhotoUrl = `${req.protocol}://${req.get('host')}/uploads/${filename}`;
                } else if (file.buffer) {
                    // Save uploaded buffer to local uploads folder
                    const uploadsDir = path.join(process.cwd(), 'uploads');
                    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
                    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
                    const filename = `profile_${Date.now()}_${safeName}`;
                    const filepath = path.join(uploadsDir, filename);
                    await fs.promises.writeFile(filepath, file.buffer);
                    // Use absolute URL so frontend can access it reliably
                    profilePhotoUrl = `${req.protocol}://${req.get('host')}/uploads/${filename}`;
                }
            } catch (uploadError) {
                console.error("Local upload error:", uploadError);
            }
        }


        const hashedPassword = await bcrypt.hash(password, 10);

        const normalizedRole = normalizeRoleString(role);

        const newUser = new User({
            fullname,
            email,
            phoneNumber,
            password: hashedPassword,
            role: normalizedRole,
            profile: {
                profilePhoto: profilePhotoUrl,
            },
        });

        await newUser.save();

        // Notify administrators about the new user registration
        try {
            const admins = await User.find({ role: 'Administrator' });
            if (admins && admins.length) {
                const note = {
                    type: 'new_user',
                    message: `New user registered: ${newUser.fullname} (${newUser.email})`,
                    data: { userId: newUser._id, email: newUser.email },
                    read: false,
                };
                for (const a of admins) {
                    a.notifications = a.notifications || [];
                    a.notifications.unshift(note);
                    // save asynchronously but do not block response
                    a.save().catch((e) => console.error('Failed to save admin notification', e));
                }
            }
        } catch (notifErr) {
            console.error('Failed to notify admins about new user:', notifErr);
        }

        return res.status(201).json({
            message: `Account created successfully for ${fullname}`,
            success: true,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Server Error registering user",
            success: false,
        });
    }
};

// =========================================================
// 2. LOGIN
// =========================================================
export const login = async (req, res) => {
    try {
        const { email, password, role } = req.body;

        if (!email || !password || !role) {
            return res.status(400).json({
                message: "Missing required fields",
                success: false,
            });
        }

        // Support the special fixed admin login: role 'admini' with fixed credentials
        if (role === 'admini') {
            // Accept either username 'rahelfikre2025' or common email variants
            const normalized = (email || '').toString().trim().toLowerCase();
            const isAdminEmail =
                normalized === 'rahelfikre2025' ||
                normalized === 'rahelfikre2025@gmail.com' ||
                normalized.startsWith('rahelfikre2025@') ||
                normalized.startsWith('rahelfikre2025');

            if (isAdminEmail && password === '4991') {
                const tokenData = { isAdminToken: true, role: 'Administrator' };
                const token = jwt.sign(tokenData, process.env.JWT_SECRET, { expiresIn: '1d' });
                const adminUser = { _id: 'admin', fullname: 'Administrator', email: 'rahelfikre2025', role: 'Administrator', profile: {} };
                const cookieOptions = {
                    maxAge: 24 * 60 * 60 * 1000,
                    httpOnly: true,
                    sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
                    secure: process.env.NODE_ENV === 'production',
                };
                // Also return the token in the response body so the frontend can send it
                // when cookies are not available (development proxying scenarios).
                return res
                    .status(200)
                    .cookie('token', token, cookieOptions)
                    .json({ message: 'Admin logged in', user: adminUser, token, success: true });
            } else {
                return res.status(401).json({ message: 'Invalid admin credentials', success: false });
            }
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({
                message: "Incorrect email or password",
                success: false,
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({
                message: "Incorrect email or password",
                success: false,
            });
        }

        // Normalize role names to handle legacy values (e.g., previous "Student")
        const normalizeRole = (r) => {
            if (!r) return "";
            const s = r.toString().trim().toLowerCase().replace(/\s+/g, "");
            // treat legacy 'student' as equivalent to 'jobseeker'
            if (s === "student") return "jobseeker";
            return s;
        };

        const normalizedUserRole = normalizeRole(user.role);
        const normalizedRequestedRole = normalizeRole(role);

        if (normalizedUserRole !== normalizedRequestedRole) {
            return res.status(403).json({
                message: "You don't have the necessary role to access this resource",
                success: false,
            });
        }

        const tokenData = {
            userId: user._id,
        };
        const token = jwt.sign(tokenData, process.env.JWT_SECRET, {
            expiresIn: "1d",
        });
        
        
        const cookieOptions = {
            maxAge: 24 * 60 * 60 * 1000, 
            httpOnly: true,
            
            sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
            secure: process.env.NODE_ENV === "production",
        };
        
       
        if (process.env.NODE_ENV !== "production") {
            cookieOptions.sameSite = "Lax";
            cookieOptions.secure = false;   
             }

        const sanitizedUser = {
            _id: user._id,
            fullname: user.fullname,
            email: user.email,
            phoneNumber: user.phoneNumber,
            role: user.role,
            profile: user.profile,
        };

        return res.status(200).cookie("token", token, cookieOptions).json({
            message: `Welcome back ${sanitizedUser.fullname}`,
            user: sanitizedUser,
            success: true,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Server Error login failed",
            success: false,
        });
    }
};


export const logout = async (req, res) => {
    try {
        // Ensure the cookie options used to clear the token match those used when setting it
        // during login. In development we use `sameSite: "Lax"` and `secure: false`, while
        // in production we use `sameSite: "None"` and `secure: true` (for HTTPS).
        const cookieOptions = {
            httpOnly: true,
            sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
            secure: process.env.NODE_ENV === "production",
        };

        // Clear the cookie using Express helper which sets the cookie value to an empty string
        // and instructs the browser to remove it.
        res.clearCookie("token", cookieOptions);
        
        return res.status(200)
            .json({
                message: "Logged out successfully",
                success: true,
            });
    } catch (error) {
        console.error("LOGOUT CATCH ERROR:", error);
        res.status(500).json({
            message: "Server Error logging out",
            success: false,
        });
    }
};


// 4. UPDATE PROFILE

export const updateProfile = async (req, res) => {
    try {
        const { fullname, email, phoneNumber, bio, skills } = req.body;
        const file = req.file;

        const userId = req.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                message: "User not found",
                success: false,
            });
        }

        if (!user.profile) user.profile = {};
        if (!user.profile.skills) user.profile.skills = [];

        if (fullname) user.fullname = fullname;
        if (phoneNumber) user.phoneNumber = phoneNumber;
        if (bio) user.profile.bio = bio;
        if (skills) {
            try {
                user.profile.skills = skills.split(",").map(s => s.trim()).filter(Boolean);
            } catch (err) {
                user.profile.skills = [];
            }
        }

        // multer.fields will populate either req.file (single) or req.files (object).
        // Support both profile photo uploads and resume/file uploads.
        try {
            const uploadsDir = path.join(process.cwd(), 'uploads');
            if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

            // Priority: req.files.profilePhoto, then req.files.file, then req.file
            let fileToSave = null;
            let kind = null; // 'photo' or 'resume'
            if (req.files && req.files.profilePhoto && req.files.profilePhoto[0]) {
                fileToSave = req.files.profilePhoto[0];
                kind = 'photo';
            } else if (req.files && req.files.file && req.files.file[0]) {
                fileToSave = req.files.file[0];
                kind = 'resume';
            } else if (req.file) {
                fileToSave = req.file;
                kind = req.file.fieldname === 'profilePhoto' ? 'photo' : 'resume';
            }

            if (fileToSave) {
                // If file was saved by diskStorage, use its filename/path
                if (fileToSave.path || fileToSave.filename) {
                    const filename = fileToSave.filename || path.basename(fileToSave.path);
                    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${filename}`;
                    if (kind === 'photo') {
                        user.profile.profilePhoto = fileUrl;
                    } else {
                        user.profile.resume = fileUrl;
                        user.profile.resumeOriginalName = fileToSave.originalname;
                        user.profile.resumeOriginalname = fileToSave.originalname;
                    }
                } else if (fileToSave.buffer) {
                    const safeName = fileToSave.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
                    const filename = `${kind}_${Date.now()}_${safeName}`;
                    const filepath = path.join(uploadsDir, filename);
                    await fs.promises.writeFile(filepath, fileToSave.buffer);
                    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${filename}`;
                    if (kind === 'photo') {
                        user.profile.profilePhoto = fileUrl;
                    } else {
                        user.profile.resume = fileUrl;
                        user.profile.resumeOriginalName = fileToSave.originalname;
                        user.profile.resumeOriginalname = fileToSave.originalname;
                    }
                }
            }
        } catch (uploadError) {
            console.error("Local upload failed:", uploadError);
        }
        // If email is being changed, ensure it's not already taken by another user
        if (email && email !== user.email) {
            const existing = await User.findOne({ email });
            if (existing && existing._id.toString() !== user._id.toString()) {
                return res.status(400).json({ message: "Email already in use", success: false });
            }
            user.email = email;
        }

        // Normalize legacy role values (e.g., previously stored 'Student') before saving
        if (user.role) {
            const normalized = normalizeRoleString(user.role);
            if (normalized !== user.role) user.role = normalized;
        }

        await user.save();

        const updatedUser = {
            _id: user._id,
            fullname: user.fullname,
            email: user.email,
            phoneNumber: user.phoneNumber,
            role: user.role,
            profile: user.profile,
        };

        return res.status(200).json({
            message: "Profile updated successfully",
            user: updatedUser,
            success: true,
        });
    } catch (error) {
        console.error('updateProfile error:', error && error.stack ? error.stack : error);
        res.status(500).json({
            message: "Server Error updating profile",
            success: false,
            error: error && error.message ? error.message : undefined,
        });
    }
};

// Notifications: get, mark single read, mark all read
export const getNotifications = async (req, res) => {
    try {
        const userId = req.id;
        const user = await User.findById(userId).select('notifications');
        if (!user) return res.status(404).json({ message: 'User not found', success: false });
        return res.status(200).json({ notifications: user.notifications || [], success: true });
    } catch (error) {
        console.error('getNotifications error', error);
        return res.status(500).json({ message: 'Server error', success: false });
    }
};

export const markNotificationRead = async (req, res) => {
    try {
        const userId = req.id;
        const notifId = req.params.id;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found', success: false });
        const notif = user.notifications.id(notifId);
        if (!notif) return res.status(404).json({ message: 'Notification not found', success: false });
        notif.read = true;
        await user.save();
        return res.status(200).json({ message: 'Notification marked read', success: true });
    } catch (error) {
        console.error('markNotificationRead error', error);
        return res.status(500).json({ message: 'Server error', success: false });
    }
};

export const markAllNotificationsRead = async (req, res) => {
    try {
        const userId = req.id;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found', success: false });
        user.notifications = (user.notifications || []).map((n) => ({ ...n.toObject(), read: true }));
        await user.save();
        return res.status(200).json({ message: 'All notifications marked read', success: true });
    } catch (error) {
        console.error('markAllNotificationsRead error', error);
        return res.status(500).json({ message: 'Server error', success: false });
    }
};

// FORGOT PASSWORD - generate token and email (or return) reset link
export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email is required', success: false });
        const user = await User.findOne({ email });
        if (!user) return res.status(200).json({ message: 'If an account exists, a reset link has been sent', success: true });

        const token = crypto.randomBytes(32).toString('hex');
        const expire = Date.now() + 1000 * 60 * 60; // 1 hour
        user.resetPasswordToken = token;
        user.resetPasswordExpires = new Date(expire);
        await user.save();

        const resetUrl = `${req.protocol}://${req.get('host')}/reset-password/${token}`;

        // Send email if SMTP configured
        try {
            if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
                const transporter = nodemailer.createTransport({
                    host: process.env.SMTP_HOST,
                    port: Number(process.env.SMTP_PORT) || 587,
                    secure: process.env.SMTP_SECURE === 'true',
                    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
                });
                await transporter.sendMail({
                    from: process.env.SMTP_FROM || process.env.SMTP_USER,
                    to: user.email,
                    subject: 'Password reset',
                    text: `Reset your password: ${resetUrl}`,
                    html: `<p>Reset your password by clicking <a href="${resetUrl}">here</a>.</p>`,
                });
            } else {
                // Not configured: log the reset link for development
                console.log('Password reset link (dev):', resetUrl);
            }
        } catch (mailErr) {
            console.error('Failed to send reset email', mailErr);
        }

        return res.status(200).json({ message: 'If an account exists, a reset link has been sent', success: true });
    } catch (error) {
        console.error('forgotPassword error', error);
        return res.status(500).json({ message: 'Server error', success: false });
    }
};

// RESET PASSWORD - using token
export const resetPassword = async (req, res) => {
    try {
        const token = req.params.token;
        const { password } = req.body;
        if (!token || !password) return res.status(400).json({ message: 'Invalid request', success: false });
        const user = await User.findOne({ resetPasswordToken: token, resetPasswordExpires: { $gt: new Date() } });
        if (!user) return res.status(400).json({ message: 'Invalid or expired token', success: false });

        user.password = await bcrypt.hash(password, 10);
        user.resetPasswordToken = '';
        user.resetPasswordExpires = undefined;
        await user.save();

        return res.status(200).json({ message: 'Password reset successful', success: true });
    } catch (error) {
        console.error('resetPassword error', error);
        return res.status(500).json({ message: 'Server error', success: false });
    }
};