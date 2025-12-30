import mongoose from "mongoose";

const jobSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    requirements: [
      {
        type: String,
      },
    ],
    // legacy: single salary value (kept for backward compatibility)
    salary: {
      type: Number,
    },
    // preferred: salary range
    salaryMin: {
      type: Number,
    },
    salaryMax: {
      type: Number,
    },
    currency: {
      type: String,
      default: "ETB",
    },
    applicationDeadline: {
      type: Date,
    },
    experienceLevel: {
      type: Number,
      required: true,
    },
    location: {
      type: String,
      required: true,
    },
    jobType: {
      type: String,
      required: true,
    },
    position: {
      type: Number,
      required: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    applications: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Application",
      },
    ],
    // Moderation
    approved: { type: Boolean, default: false },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectionReason: { type: String, default: '' },
    // Operational status controlled by recruiter who created the job
    status: { type: String, enum: ['open', 'paused', 'closed'], default: 'open' },
  },
  { timestamps: true }
);
export const Job = mongoose.model("Job", jobSchema);