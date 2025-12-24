import mongoose from "mongoose";
const userSchema = new mongoose.Schema(
  {
    fullname: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },

    role: {
      type: String,
        enum: ["Job Seeker", "Recruiter", "Administrator"],
      default: "Job Seeker",
      required: true,
    },
    profile: {
     
      type: { 
        bio: {
          type: String,
        },
        skills: [{ type: String }],
        resume: {
          type: String, 
        },
        resumeOriginalname: {
          type: String, 
        },
        company: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Company",
        },
        profilePhoto: {
          type: String, 
          default: "",
        },
      },
      default: {}, 
    },
    notifications: [
      {
        type: { type: String },
        message: { type: String },
        data: { type: Object },
        read: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    // Password reset fields
    resetPasswordToken: { type: String, default: '' },
    resetPasswordExpires: { type: Date },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);