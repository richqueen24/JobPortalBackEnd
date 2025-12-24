import { Chat } from "../models/chat.model.js";
import { User } from "../models/user.model.js";

export const createConversation = async (req, res) => {
  try {
    const { participants } = req.body; // array of user ids
    if (!participants || !Array.isArray(participants) || participants.length < 2) {
      return res.status(400).json({ message: "Participants required", success: false });
    }

    // look for existing conversation with same participants (order-insensitive)
    const existing = await Chat.findOne({ participants: { $all: participants, $size: participants.length } });
    if (existing) return res.status(200).json({ conversation: existing, success: true });

    const convo = await Chat.create({ participants, messages: [] });
    return res.status(201).json({ conversation: convo, success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error", success: false });
  }
};

export const getConversationsForUser = async (req, res) => {
  try {
    const userId = req.id;
    const convos = await Chat.find({ participants: userId })
      .populate("participants", "fullname email profile")
      .populate({ path: 'messages', options: { sort: { createdAt: -1 }, limit: 1 }, populate: { path: 'sender', select: 'fullname email' } })
      .sort({ updatedAt: -1 });
    return res.status(200).json({ conversations: convos, success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error", success: false });
  }
};

export const getConversationById = async (req, res) => {
  try {
    const convoId = req.params.id;
    const convo = await Chat.findById(convoId)
      .populate("participants", "fullname email profile")
      .populate({ path: 'messages.sender', select: 'fullname email' });
    if (!convo) return res.status(404).json({ message: "Conversation not found", success: false });
    return res.status(200).json({ conversation: convo, success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error", success: false });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const convoId = req.params.id;
    const { text, type = "text", meta = {} } = req.body;
    const sender = req.id;

    const convo = await Chat.findById(convoId);
    if (!convo) return res.status(404).json({ message: "Conversation not found", success: false });

    const message = { sender, text, type, meta };
    convo.messages.push(message);
    convo.lastMessage = type === "text" ? text : `[${type}]`;
    await convo.save();

    const populated = await Chat.findById(convoId).populate("messages.sender", "fullname email");
    return res.status(201).json({ message: populated.messages.pop(), conversation: populated, success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error", success: false });
  }
};
