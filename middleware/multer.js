import multer from "multer";
import path from 'path';
import fs from 'fs';

// Memory storage (existing behavior) kept for backward compatibility
const memoryStorage = multer.memoryStorage();

// Disk storage: save files directly to Backend/uploads with safe, unique filenames
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const diskStorage = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, uploadsDir);
	},
	filename: function (req, file, cb) {
		const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-\_]/g, '_');
		const filename = `${file.fieldname}_${Date.now()}_${safeName}`;
		cb(null, filename);
	},
});

// Export handlers using diskStorage (preferred)
export const singleUploadProfile = multer({ storage: diskStorage }).single("profilePhoto");
export const singleUploadFile = multer({ storage: diskStorage }).single("file");
export const profileOrFileFields = multer({ storage: diskStorage }).fields([
	{ name: "profilePhoto", maxCount: 1 },
	{ name: "file", maxCount: 1 },
]);

// Also export memory-based handlers in case some controllers still expect buffers
export const singleUploadProfileMemory = multer({ storage: memoryStorage }).single("profilePhoto");
export const singleUploadFileMemory = multer({ storage: memoryStorage }).single("file");
export const profileOrFileFieldsMemory = multer({ storage: memoryStorage }).fields([
	{ name: "profilePhoto", maxCount: 1 },
	{ name: "file", maxCount: 1 },
]);