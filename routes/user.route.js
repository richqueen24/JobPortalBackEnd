import express from "express";
import {
  login,
  logout,
  register,
  updateProfile,
  forgotPassword,
  resetPassword,
} from "../controllers/user.controller.js";
import authenticateToken from "../middleware/isAuthenticated.js";
import { singleUploadProfile, profileOrFileFields } from "../middleware/multer.js";
import { getNotifications, markNotificationRead, markAllNotificationsRead } from "../controllers/user.controller.js";

const router = express.Router();

// Accept either `profilePhoto` or `file` from the client for registration/profile update
router.route("/register").post(profileOrFileFields, register);
router.route("/login").post(login);
router.route("/logout").post(logout);
router.route("/profile/update")
  .post(authenticateToken, profileOrFileFields, updateProfile);

// Notifications
router.route('/notifications').get(authenticateToken, getNotifications);
router.route('/notifications/:id/read').post(authenticateToken, markNotificationRead);
router.route('/notifications/read-all').post(authenticateToken, markAllNotificationsRead);

// Password reset
router.route('/forgot-password').post(forgotPassword);
router.route('/reset-password/:token').post(resetPassword);

export default router;