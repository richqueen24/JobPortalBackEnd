import express from "express";

import authenticateToken from "../middleware/isAuthenticated.js";
import { applyJob, getApplicants, getAppliedJobs, updateStatus, getAcceptedApplicantsForRecruiter, openConversationForApplication, updateMultipleStatus } from "../controllers/application.controller.js";

const router = express.Router();

router.route("/apply/:id").get(authenticateToken, applyJob);
router.route("/get").get(authenticateToken, getAppliedJobs);
router.route("/:id/applicants").get(authenticateToken, getApplicants);
router.route("/status/:id/update").post(authenticateToken, updateStatus);
router.route("/status/bulk").post(authenticateToken, updateMultipleStatus);
// list accepted applicants for the authenticated recruiter
router.route("/recruiter/accepted").get(authenticateToken, getAcceptedApplicantsForRecruiter);
// open (or create) a conversation for a specific application and return conversationId
router.route("/:id/open-chat").post(authenticateToken, openConversationForApplication);

export default router;