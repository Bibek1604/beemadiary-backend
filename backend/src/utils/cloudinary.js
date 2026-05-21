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

// Multer memory storage (ideal for buffer processing/streaming)
const storage = multer.memoryStorage();

// File upload restrictions
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB maximum
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
    
    // Save file buffer to local disk
    fs.writeFileSync(filePath, file.buffer);
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
    
    fs.writeFileSync(filePath, file.buffer);
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
