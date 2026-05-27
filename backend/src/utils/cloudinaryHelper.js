const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const crypto = require('crypto');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload file to Cloudinary from buffer
 * @param {Buffer} fileBuffer - File buffer from multer
 * @param {string} folder - Cloudinary folder path
 * @param {string} publicId - Custom public ID (optional)
 * @returns {Promise<{public_id, secure_url, url, ...}>}
 */
exports.uploadToCloudinary = async (fileBuffer, folder = 'agent-profiles', publicId = null) => {
  try {
    // Create local backup directory
    const uploadsRoot = path.join(process.cwd(), 'uploads');
    const backupDir = path.join(uploadsRoot, folder);
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    // Convert to WEBP optimized buffer
    let processedBuffer = fileBuffer;
    try {
      processedBuffer = await sharp(fileBuffer).webp({ quality: 80 }).toBuffer();
    } catch (procErr) {
      // fallback to original buffer
      processedBuffer = fileBuffer;
    }

    // Save local backup
    const uniqueName = `${folder}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}.webp`;
    const localPath = path.join(backupDir, uniqueName);
    fs.writeFileSync(localPath, processedBuffer);

    // Upload to Cloudinary
    return await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: folder,
          resource_type: 'auto',
          public_id: publicId,
          overwrite: publicId ? true : false,
          quality: 'auto',
          fetch_format: 'auto',
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            // attach localPath for callers if needed
            result.localPath = localPath;
            resolve(result);
          }
        }
      );

      uploadStream.end(processedBuffer);
    });
  } catch (err) {
    return Promise.reject(err);
  }
};

/**
 * Delete file from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<{result}>}
 */
exports.deleteFromCloudinary = async (publicId) => {
  return cloudinary.uploader.destroy(publicId);
};

/**
 * Get Cloudinary optimization URL
 * @param {string} publicId - Cloudinary public ID
 * @param {object} options - Transformation options
 * @returns {string} - Optimized URL
 */
exports.getOptimizedUrl = (publicId, options = {}) => {
  const defaultOptions = {
    quality: 'auto',
    fetch_format: 'auto',
    width: 400,
    height: 400,
    crop: 'fill',
    gravity: 'face',
  };

  return cloudinary.url(publicId, { ...defaultOptions, ...options });
};
