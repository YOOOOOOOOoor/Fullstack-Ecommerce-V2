import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "refund-evidence",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
  },
});

const refundUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 3 },
  fileFilter(_req, file, callback) {
    if (!allowedMimeTypes.has(file.mimetype)) return callback(new Error("Refund attachments must be JPEG, PNG, or WebP images."));
    callback(null, true);
  },
});

export default refundUpload;
