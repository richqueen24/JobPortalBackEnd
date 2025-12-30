import { User } from "../models/user.model.js";
import { Company } from "../models/company.model.js";
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
                    // Use environment variable for production domain, fallback to request host for development
                    const backendDomain = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
                    profilePhotoUrl = `${backendDomain}/uploads/${filename}`;
                } else if (file.buffer) {
                    // Save uploaded buffer to local uploads folder
                    const uploadsDir = path.join(process.cwd(), 'uploads');
                    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
                    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
                    const filename = `profile_${Date.now()}_${safeName}`;
                    const filepath = path.join(uploadsDir, filename);
                    await fs.promises.writeFile(filepath, file.buffer);
                    // Use environment variable for production domain, fallback to request host for development
                    const backendDomain = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
                    profilePhotoUrl = `${backendDomain}/uploads/${filename}`;
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
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Missing required fields",
                success: false,
            });
        }

        // Special fixed admin login (legacy): allow admin to login with fixed credentials
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
            return res
                .status(200)
                .cookie('token', token, cookieOptions)
                .json({ message: 'Admin logged in', user: adminUser, token, success: true });
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

        // No frontend role required anymore: backend uses stored user.role

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
            token,
            success: true,
        });
    } catch (error) {
        console.error('login error:', error && error.stack ? error.stack : error);
        res.status(500).json({
            message: "Server Error login failed",
            success: false,
            error: process.env.NODE_ENV === 'production' ? undefined : (error && error.message ? error.message : String(error)),
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
        const { fullname, email, phoneNumber, bio, skills, grade, companyName } = req.body;
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

        // allow updating numeric grade (sent as string from frontend)
        if (typeof grade !== 'undefined') {
            const parsed = grade === '' || grade === null ? null : Number(grade);
            user.profile.grade = Number.isFinite(parsed) ? parsed : null;
        }

        // Company name handling: for Recruiter profiles allow linking to an existing company or creating a new one
        if (typeof companyName !== 'undefined') {
            // empty string clears the association
            if (!companyName) {
                user.profile.company = undefined;
            } else {
                // case-insensitive exact name search
                let company = await Company.findOne({ name: new RegExp(`^${companyName}$`, 'i') });
                if (!company) {
                    // create a minimal company record and set the current user as owner
                    try {
                        company = new Company({ name: companyName, userId: user._id });
                        await company.save();
                    } catch (err) {
                        // if unique constraint fails concurrently, try to find again
                        company = await Company.findOne({ name: new RegExp(`^${companyName}$`, 'i') });
                    }
                }
                if (company) user.profile.company = company._id;
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
                    // Use environment variable for production domain, fallback to request host for development
                    const backendDomain = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
                    const fileUrl = `${backendDomain}/uploads/${filename}`;
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
                    // Use environment variable for production domain, fallback to request host for development
                    const backendDomain = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
                    const fileUrl = `${backendDomain}/uploads/${filename}`;
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

        // Enforce required profile fields for Job Seekers
        const normalizedRole = normalizeRoleString(user.role);
        if (normalizedRole === 'Job Seeker') {
            // Ensure a numeric grade exists
            if (typeof user.profile.grade === 'undefined' || user.profile.grade === null) {
                return res.status(400).json({ message: 'Grade is required for Job Seekers', success: false });
            }
            // Ensure a resume file URL exists
            if (!user.profile.resume) {
                return res.status(400).json({ message: 'Resume is required for Job Seekers', success: false });
            }
        }

        await user.save();

        // Try to include company name in the returned profile for convenience
        let companyObj = null;
        if (user.profile && user.profile.company) {
            try {
                companyObj = await Company.findById(user.profile.company).select('name');
            } catch (err) {
                companyObj = null;
            }
        }

        const updatedUser = {
            _id: user._id,
            fullname: user.fullname,
            email: user.email,
            phoneNumber: user.phoneNumber,
            role: user.role,
            profile: {
                ...user.profile,
                company: companyObj ? { _id: companyObj._id, name: companyObj.name } : (user.profile.company || undefined),
            },
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
        if (!user) return res.status(200).json({ message: 'If an account exists, a reset code has been sent', success: true });

        // generate a 6-digit numeric code
        const code = String(Math.floor(100000 + Math.random() * 900000));
        const expire = Date.now() + 1000 * 60 * 60; // 1 hour
        const hashedCode = await bcrypt.hash(code, 10);
        user.resetCodeHash = hashedCode;
        user.resetCodeExpires = new Date(expire);
        
        // Generate a password reset token for link-based reset
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = Date.now() + 3600000; // 1 hour
        
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = resetTokenExpiry;
        await user.save();
        
        // Get the frontend URL from environment or default to production
        const frontendUrl = process.env.FRONTEND_URL || 'https://ourjobsportal.netlify.app';
        
        // Send email with both the code and the reset link if SMTP configured
        try {
            const { sendMail } = await import('../utils/mailer.js');
            const resetLink = `${frontendUrl}/reset-password/${resetToken}`;
            const subject = 'Password Reset Request';
            const text = `Your password reset code is: ${code}. It will expire in 1 hour.\n\nOr click this link to reset your password: ${resetLink}`;
            const html = `<p>Your password reset code is: <strong>${code}</strong>. It will expire in 1 hour.</p><br><p>Or <a href="${resetLink}">click here</a> to reset your password.</p>`;

            const mailResult = await sendMail({ to: user.email, subject, text, html });

            // If sending failed and we are in production, return an error to the client
            if (!mailResult.success) {
                if (process.env.NODE_ENV === 'production') {
                    console.error('Email sending failed for reset code:', mailResult.error || mailResult.reason || mailResult.info);
                    return res.status(500).json({ message: 'Failed to send reset email. Please contact support.', success: false });
                } else {
                    // Development: fall back to logging so developers can access the code easily
                    console.warn('Password reset code (dev, no SMTP):', code);
                }
            }
        } catch (mailErr) {
            console.error('Failed to send reset email', mailErr);
            // In production we don't want to leak info — still notify admin via error
            if (process.env.NODE_ENV === 'production') {
                return res.status(500).json({ message: 'Failed to send reset email. Please contact support.', success: false });
            } else {
                console.warn('Password reset code (dev, exception):', code, mailErr);
            }
        }

        return res.status(200).json({ message: 'If an account exists, a reset code has been sent', success: true });
    } catch (error) {
        console.error('forgotPassword error', error);
        return res.status(500).json({ message: 'Server error', success: false });
    }
};

// Reset using code (email + code + new password)
export const resetPasswordWithCode = async (req, res) => {
    try {
        const { email, code, password } = req.body;
        if (!email || !code || !password) return res.status(400).json({ message: 'Email, code and new password are required', success: false });
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: 'Invalid code or email', success: false });
        if (!user.resetCodeHash || !user.resetCodeExpires || new Date(user.resetCodeExpires).getTime() < Date.now()) {
            return res.status(400).json({ message: 'Reset code expired or invalid', success: false });
        }
        const match = await bcrypt.compare(code, user.resetCodeHash);
        if (!match) return res.status(400).json({ message: 'Invalid reset code', success: false });
        user.password = await bcrypt.hash(password, 10);
        user.resetCodeHash = '';
        user.resetCodeExpires = undefined;
        await user.save();
        return res.status(200).json({ message: 'Password reset successful', success: true });
    } catch (error) {
        console.error('resetPasswordWithCode error', error);
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
