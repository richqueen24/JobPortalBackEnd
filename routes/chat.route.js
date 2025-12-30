import express from "express";
import { createConversation, getConversationsForUser, getConversationById, sendMessage } from "../controllers/chat.controller.js";
import authenticateToken from "../middleware/isAuthenticated.js";

const router = express.Router();

router.post("/conversations", authenticateToken, createConversation);
router.get("/conversations", authenticateToken, getConversationsForUser);
router.get("/:id", authenticateToken, getConversationById);
router.post("/:id/message", authenticateToken, sendMessage);

export default router;
