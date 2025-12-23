import mongoose from "mongoose";
const applicationSchema = new mongoose.Schema(
  {
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },
    applicant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
      // Interview details (filled when recruiter schedules an interview)
      interview: {
        meetingLink: { type: String, default: '' },
        eventId: { type: String, default: '' },
        interviewTitle: { type: String, default: '' },
        startTime: { type: Date },
        duration: { type: Number }, // duration in minutes
      },
      interviewStatus: { type: String, enum: ['pending', 'scheduled', 'completed', 'cancelled'], default: 'pending' },
  },
  {
    timestamps: true,
  }
);

export const Application = mongoose.model("Application", applicationSchema);