import express from "express";

import authenticateToken from "../middleware/isAuthenticated.js";
import {
  getAdminJobs,
  getAllJobs,
  getJobById,
  postJob,
  updateJob,
  deleteJob,
} from "../controllers/job.controller.js";

const router = express.Router();

router.route("/post").post(authenticateToken, postJob);
// Public endpoints (no authentication required)
router.route("/get").get(getAllJobs);
router.route("/get/:id").get(getJobById);

// Protected endpoints
router.route("/getadminjobs").get(authenticateToken, getAdminJobs);
router.route("/update/:id").put(authenticateToken, updateJob);
router.route("/delete/:id").delete(authenticateToken, deleteJob);
export default router;