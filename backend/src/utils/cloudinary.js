const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const env = require("../config/env");

// Configure Cloudinary SDK
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

// Ensure local uploads directory exists
const uploadsDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer disk storage (prevents memory exhaustion from large uploads)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

// File upload restrictions
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB maximum
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp|gif|pdf/;
    const isMimetypeValid = allowedTypes.test(file.mimetype);
    const isExtnameValid = allowedTypes.test(path.extname(file.originalname).toLowerCase());

    if (isMimetypeValid && isExtnameValid) {
      return cb(null, true);
    }
    cb(new Error("Only images (jpeg, jpg, png, webp, gif) and PDFs are allowed!"));
  },
});

/**
 * Upload buffer to Cloudinary or write to local storage as fallback
 * @param {object} file - Express multer file object
 * @returns {Promise<string>} File access URL
 */
const uploadFile = async (file) => {
  if (!file) return null;

  if (env.USE_CLOUDINARY && env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY) {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { resource_type: "auto", folder: "lic_diary" },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result.secure_url);
          }
        }
      );
      uploadStream.end(file.buffer);
    });
  } else {
    // Fallback to local storage
    const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    const filePath = path.join(uploadsDir, fileName);

    // Save file buffer to local disk asynchronously
    fs.promises.writeFile(filePath, file.buffer).catch((err) => {
      const logger = require('./logger');
      logger.error('Failed to write file to disk', err);
    });
    return `/uploads/${fileName}`;
  }
};

/**
 * Upload image to Cloudinary (returns both url and public_id)
 */
const uploadImage = async (file) => {
  if (!file) return null;

  if (env.USE_CLOUDINARY && env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY) {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { resource_type: "image", folder: "lic_diary/profiles" },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve({
              url: result.secure_url,
              public_id: result.public_id
            });
          }
        }
      );
      uploadStream.end(file.buffer);
    });
  } else {
    // Fallback to local storage
    const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    const filePath = path.join(uploadsDir, fileName);

    fs.promises.writeFile(filePath, file.buffer).catch((err) => {
      const logger = require('./logger');
      logger.error('Failed to write image file to disk', err);
    });
    return {
      url: `/uploads/${fileName}`,
      public_id: null
    };
  }
};

/**
 * Delete image from Cloudinary
 */
const deleteImage = async (public_id) => {
  if (!public_id) return true;
  
  if (env.USE_CLOUDINARY && env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY) {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.destroy(public_id, (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      });
    });
  }
  return true;
};

module.exports = {
  upload,
  uploadFile,
  uploadImage,
  deleteImage
};
