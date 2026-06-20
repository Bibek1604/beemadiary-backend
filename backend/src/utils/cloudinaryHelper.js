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
  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error('File buffer is empty');
  }

  // 1) ALWAYS write a local backup first — this is the fallback copy that keeps
  //    images working when Cloudinary is unreachable or not configured.
  const backupDir = path.join(process.cwd(), 'uploads', folder);
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  let processedBuffer = fileBuffer;
  try {
    processedBuffer = await sharp(fileBuffer).webp({ quality: 80 }).toBuffer();
  } catch (procErr) {
    console.warn('Sharp processing failed, using original buffer:', procErr.message);
    processedBuffer = fileBuffer;
  }

  const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.webp`;
  const localPath = path.join(backupDir, uniqueName);
  fs.writeFileSync(localPath, processedBuffer);

  // Build absolute URLs when a public backend base is configured (needed for
  // cross-origin frontends); fall back to relative for same-origin deployments.
  const apiBase = String(process.env.PUBLIC_API_URL || process.env.IMAGE_BASE_URL || '').replace(/\/+$/, '');
  const localUrl = `${apiBase}/api/uploads/${folder}/${uniqueName}`;

  // Local-only result, used when Cloudinary is unconfigured or fails. secure_url
  // points at the locally-served file so callers that store secure_url still get
  // a working URL.
  const localResult = () => ({
    secure_url: localUrl, url: localUrl, public_id: null,
    localPath, local_url: localUrl, resilient_url: localUrl, source: 'local',
  });

  // 2) Try Cloudinary (primary). On ANY failure, fall back to the local copy.
  const cloudConfigured = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY);
  if (!cloudConfigured) return localResult();

  try {
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'auto',
          public_id: publicId,
          overwrite: publicId ? true : false,
          quality: 'auto',
          fetch_format: 'auto',
          timeout: 60000,
        },
        (error, res) => (error ? reject(new Error(`Cloudinary upload failed: ${error.message}`)) : resolve(res))
      );
      uploadStream.on('error', (error) => reject(new Error(`Upload stream error: ${error.message}`)));
      uploadStream.end(processedBuffer);
    });

    result.localPath = localPath;
    result.local_url = localUrl;
    // Cloudinary-first, local-fallback proxy URL (served by GET /api/images/:folder/:filename).
    result.resilient_url = `${apiBase}/api/images/${folder}/${uniqueName}?pub=${encodeURIComponent(result.public_id)}`;
    result.source = 'cloudinary';
    return result;
  } catch (err) {
    console.error('Cloudinary upload failed; using local backup instead:', err.message);
    return localResult();
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
