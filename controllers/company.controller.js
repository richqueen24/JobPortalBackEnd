import { Company } from "../models/company.model.js";
import { User } from "../models/user.model.js";
import getDataUri from "../utils/datauri.js";
import cloudinary from '../utils/cloud.js';
import fs from 'fs';
import path from 'path';


export const registerCompany = async (req, res) => {
  try {
    const { companyName } = req.body;
    if (!companyName) {
      return res.status(401).json({
        message: "Company name is required",
        success: false,
      });
    }
    let company = await Company.findOne({ name: companyName });
    if (company) {
      return res.status(401).json({
        message: "Company already exists",
        success: false,
      });
    }
    company = await Company.create({
      name: companyName,
      userId: req.id,
    });
    // Notify administrators about the new company registration
    try {
      const admins = await User.find({ role: 'Administrator' });
      if (admins && admins.length) {
        const note = {
          type: 'new_company',
          message: `New company registered: ${company.name}`,
          data: { companyId: company._id },
          read: false,
        };
        for (const a of admins) {
          a.notifications = a.notifications || [];
          a.notifications.unshift(note);
          a.save().catch((e) => console.error('Failed to save admin notification', e));
        }
      }
    } catch (notifErr) {
      console.error('Failed to notify admins about new company:', notifErr);
    }
    return res.status(201).json({
      message: "Company registered successfully.",
      company,
      success: true,
    });
  } catch (error) {
    console.log(error);
  }
};

export const getAllCompanies = async (req, res) => {
  try {
    const userId = req.id; // loggedin user id (may be undefined for admin token)
    let companies;
    if (userId) {
      // Regular user: only their companies
      companies = await Company.find({ userId });
    } else {
      // No userId present (admin token or system token): return all companies
      companies = await Company.find();
    }

    if (!companies || companies.length === 0) {
      return res.status(200).json({ companies: [], success: true });
    }

    return res.status(200).json({ companies, success: true });
  } catch (error) {
    console.error(error);
  }
};

//get company by id
export const getCompanyById = async (req, res) => {
  try {
    const companyId = req.params.id;
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }
    return res.status(200).json({ company, success: true });
  } catch (error) {
    console.error(error);
  }
};

//update company details
export const updateCompany = async (req, res) => {
  try {
    const { name, description, website, location } = req.body;
    const file = req.file;
    let logo = undefined;
    if (file) {
      // If multer.diskStorage is used, file will already be on disk.
      if (file.path || file.filename) {
        const filename = file.filename || path.basename(file.path);
        // Use environment variable for production domain, fallback to request host for development
        const backendDomain = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
        logo = `${backendDomain}/uploads/${filename}`;
      } else if (file.buffer) {
        // Try saving locally to uploads folder first (memoryStorage fallback)
        try {
          const uploadsDir = path.join(process.cwd(), 'uploads');
          if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
          const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
          const filename = `company_${Date.now()}_${safeName}`;
          const filepath = path.join(uploadsDir, filename);
          await fs.promises.writeFile(filepath, file.buffer);
          // Use environment variable for production domain, fallback to request host for development
          const backendDomain = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
          logo = `${backendDomain}/uploads/${filename}`;
        } catch (localErr) {
          console.error('Local save failed, falling back to Cloudinary:', localErr);
          // fallback to cloudinary if local save fails
          try {
            const fileUri = getDataUri(file);
            const cloudResponse = await cloudinary.uploader.upload(fileUri.content);
            logo = cloudResponse.secure_url;
          } catch (uploadError) {
            console.error("Cloudinary upload error:", uploadError);
            const msg = (uploadError && uploadError.message) || String(uploadError);
            return res.status(500).json({ message: "Logo upload failed", error: msg, success: false });
          }
        }
      }
    }

    // Build update data only with provided fields
    const updateData = { name, description, website, location };
    if (logo) updateData.logo = logo;

    const company = await Company.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
    });
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }
    return res.status(200).json({ message: "Company updated" });
  } catch (error) {
    console.error(error);
  }
};