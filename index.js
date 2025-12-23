import express from "express";
import cookieParser from "cookie-parser";
import multer from "multer";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./utils/db.js";
import userRoute from "./routes/user.route.js";
import companyRoute from "./routes/company.route.js";
import jobRoute from "./routes/job.route.js";
import applicationRoute from "./routes/application.route.js";
import adminRoute from "./routes/admin.route.js";
import interviewRoute from "./routes/interview.route.js";
import chatRoute from "./routes/chat.route.js";

dotenv.config({});
const app = express();

//middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const corsOptions = {
  origin: ["http://localhost:5173", "http://localhost:5174"],
  credentials: true,
};

// enable CORS for the configured origins; the cors middleware will handle preflight
app.use(cors(corsOptions));

const PORT = process.env.PORT || 5011;

 
//api's

app.use("/api/user", userRoute);
app.use("/api/company", companyRoute);
app.use("/api/job", jobRoute);
app.use("/api/application", applicationRoute);
app.use('/uploads', express.static('uploads'));
app.use('/api/admin', adminRoute);
app.use('/api/interviews', interviewRoute);
app.use('/api/chat', chatRoute);

// Simple system endpoint to return server time for debugging (useful for Cloudinary timestamp issues)
app.get('/api/system/time', (req, res) => {
  const serverTime = new Date().toISOString();
  return res.status(200).json({ serverTime });
});

app.listen(PORT, () => {
  connectDB();
  console.log(`Server is running on port ${PORT}`);
});

// Global error handler to catch multipart/busboy errors (from multer) and other unexpected errors
app.use((err, req, res, next) => {
  // Multer errors are instances of MulterError
  if (err instanceof multer.MulterError) {
    console.error('Multer error:', err);
    return res.status(400).json({ message: err.message || 'File upload error', success: false });
  }

  // Busboy/multipart parsing issues may surface as generic errors; handle common indicators
  if (err && err.message && /multipart|busboy|Unexpected field|boundary/i.test(err.message)) {
    console.error('Multipart parsing error:', err);
    return res.status(400).json({ message: 'Invalid multipart/form-data request', success: false });
  }

  // Fallback error handler
  if (err) {
    console.error('Unhandled error:', err);
    return res.status(500).json({ message: 'Server error', success: false });
  }

  next();
});