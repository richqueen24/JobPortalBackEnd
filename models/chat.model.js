import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    text: { type: String },
    type: { type: String, default: "text" }, // 'text' | 'interview' etc.
    meta: { type: Object, default: {} },
  },
  { timestamps: true }
);

const chatSchema = new mongoose.Schema(
  {
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    messages: [messageSchema],
    lastMessage: { type: String, default: "" },
  },
  { timestamps: true }
);

export const Chat = mongoose.model("Chat", chatSchema);
