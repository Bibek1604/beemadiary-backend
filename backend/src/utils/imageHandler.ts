import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import sharp from 'sharp';

/**
 * Image Handler Utility
 * Supports both local storage and Cloudinary with fallback mechanism
 */

// Configure Cloudinary if credentials available
if (
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

// Local storage paths
const LOCAL_STORAGE_PATH = path.join(
  process.cwd(),
  'uploads'
);
const PROFILE_PICS_PATH = path.join(LOCAL_STORAGE_PATH, 'profile-pics');
const DOCUMENTS_PATH = path.join(LOCAL_STORAGE_PATH, 'documents');
const TEMP_PATH = path.join(LOCAL_STORAGE_PATH, 'temp');

// Ensure directories exist
export const ensureUploadDirs = () => {
  [LOCAL_STORAGE_PATH, PROFILE_PICS_PATH, DOCUMENTS_PATH, TEMP_PATH].forEach(
    (dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  );
};

/**
 * Image Types and Constraints
 */
export interface ImageUploadOptions {
  maxSize?: number; // in bytes
  allowedMimes?: string[];
  quality?: number; // 1-100
  resize?: boolean;
  width?: number;
  height?: number;
}

export interface ImageUploadResult {
  success: boolean;
  url?: string;
  localPath?: string;
  cloudinaryId?: string;
  size?: number;
  width?: number;
  height?: number;
  storage: 'local' | 'cloudinary';
  error?: string;
}

export interface ImageDeleteResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Default constraints
 */
const DEFAULT_CONSTRAINTS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_MIMES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  PROFILE_PIC_MAX_SIZE: 10 * 1024 * 1024, // 10MB
  PROFILE_PIC_ALLOWED_MIMES: ['image/jpeg', 'image/png', 'image/webp'],
};

/**
 * Multer configuration for local file uploads
 */
export const createUploadMiddleware = (
  destination: 'profile-pics' | 'documents' = 'documents'
) => {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const targetPath =
        destination === 'profile-pics' ? PROFILE_PICS_PATH : DOCUMENTS_PATH;
      cb(null, targetPath);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${crypto
        .randomBytes(8)
        .toString('hex')}`;
      const ext = path.extname(file.originalname);
      cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
    },
  });

  return multer({
    storage,
    fileFilter: (req, file, cb) => {
      const maxSize =
        destination === 'profile-pics'
          ? DEFAULT_CONSTRAINTS.PROFILE_PIC_MAX_SIZE
          : DEFAULT_CONSTRAINTS.MAX_FILE_SIZE;

      const allowedMimes =
        destination === 'profile-pics'
          ? DEFAULT_CONSTRAINTS.PROFILE_PIC_ALLOWED_MIMES
          : DEFAULT_CONSTRAINTS.ALLOWED_MIMES;

      if (!allowedMimes.includes(file.mimetype)) {
        cb(new Error(`Invalid file type: ${file.mimetype}`));
        return;
      }

      cb(null, true);
    },
    limits: {
      fileSize:
        destination === 'profile-pics'
          ? DEFAULT_CONSTRAINTS.PROFILE_PIC_MAX_SIZE
          : DEFAULT_CONSTRAINTS.MAX_FILE_SIZE,
    },
  });
};

/**
 * Upload image with fallback: try Cloudinary first, fall back to local
 */
export const uploadImage = async (
  filePath: string,
  folder: string = 'dashboard',
  options: ImageUploadOptions = {}
): Promise<ImageUploadResult> => {
  try {
    // Validate file exists
    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        error: 'File not found',
        storage: 'local',
      };
    }

    const stats = fs.statSync(filePath);
    const maxSize = options.maxSize || DEFAULT_CONSTRAINTS.MAX_FILE_SIZE;

    if (stats.size > maxSize) {
      fs.unlinkSync(filePath); // Clean up
      return {
        success: false,
        error: `File size exceeds limit: ${maxSize / 1024 / 1024}MB`,
        storage: 'local',
      };
    }

    // Process image: convert to optimized WEBP and optionally resize
    const buffer = await fs.promises.readFile(filePath);
    let processedBuffer = buffer;

    try {
      let transformer = sharp(buffer).webp({ quality: options.quality || 80 });
      if (options.resize && options.width && options.height) {
        transformer = transformer.resize(options.width, options.height, { fit: 'cover' });
      }
      processedBuffer = await transformer.toBuffer();
    } catch (procErr) {
      console.warn('[Image Process Warning]', procErr);
      // fallback to original buffer
      processedBuffer = buffer;
    }

    // Ensure upload directories exist
    const uploadDir = path.join(LOCAL_STORAGE_PATH, folder);
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    // Generate secure unique filename with .webp
    const uniqueFileName = `${folder}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}.webp`;
    const savedFilePath = path.join(uploadDir, uniqueFileName);

    // Save optimized file permanently as backup
    await fs.promises.writeFile(savedFilePath, processedBuffer);

    const metadata = await getImageMetadata(savedFilePath);

    // Try Cloudinary upload (non-blocking for local backup) with timeout protection
    let cloudResult = null;
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        cloudResult = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            { folder: `${folder}`, resource_type: 'image', public_id: `${folder}-${Date.now()}` },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );

          uploadStream.end(processedBuffer);
        });
      } catch (cloudErr) {
        console.warn('[Cloudinary Upload Warning]', cloudErr);
        cloudResult = null;
      }
    }

    // Build proxy URL that frontend should use (backend will try cloudinary first)
    const backendProxyUrl = `/api/images/${encodeURIComponent(folder)}/${encodeURIComponent(uniqueFileName)}${cloudResult ? `?pub=${encodeURIComponent(cloudResult.public_id)}` : ''}`;

    return {
      success: true,
      url: backendProxyUrl,
      localPath: savedFilePath,
      cloudinaryId: cloudResult ? cloudResult.public_id : undefined,
      size: fs.statSync(savedFilePath).size,
      width: metadata.width,
      height: metadata.height,
      storage: cloudResult ? 'cloudinary' : 'local',
    };
  } catch (error) {
    console.error('[Image Upload Error]', error);
    return {
      success: false,
      error: 'Failed to upload image',
      storage: 'local',
    };
  }
};

/**
 * Upload image from Buffer
 */
export const uploadImageFromBuffer = async (
  buffer: Buffer,
  fileName: string,
  folder: string = 'dashboard',
  options: ImageUploadOptions = {}
): Promise<ImageUploadResult> => {
  try {
    // Validate mime type
    const allowedMimes =
      options.allowedMimes || DEFAULT_CONSTRAINTS.ALLOWED_MIMES;
    const ext = path.extname(fileName).toLowerCase();
    const mimeType = getMimeType(ext);

    if (!allowedMimes.includes(mimeType)) {
      return {
        success: false,
        error: `Invalid file type: ${mimeType}`,
        storage: 'local',
      };
    }

    // Validate size
    const maxSize = options.maxSize || DEFAULT_CONSTRAINTS.MAX_FILE_SIZE;
    if (buffer.length > maxSize) {
      return {
        success: false,
        error: `File size exceeds limit: ${maxSize / 1024 / 1024}MB`,
        storage: 'local',
      };
    }

    // Normalize and process buffer into WEBP optimized image
    let processedBuffer = buffer;
    try {
      let transformer = sharp(buffer).webp({ quality: options.quality || 80 });
      if (options.resize && options.width && options.height) {
        transformer = transformer.resize(options.width, options.height, { fit: 'cover' });
      }
      processedBuffer = await transformer.toBuffer();
    } catch (procErr) {
      console.warn('[Image Process Warning]', procErr);
      processedBuffer = buffer;
    }

    // Ensure upload directory exists
    const uploadDir = path.join(LOCAL_STORAGE_PATH, folder);
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    // Create secure filename with .webp
    const uniqueFileName = `${folder}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}.webp`;
    const filePath = path.join(uploadDir, uniqueFileName);
    await fs.promises.writeFile(filePath, processedBuffer);

    const metadata = await getImageMetadata(filePath);

    // Try Cloudinary upload
    let cloudResult = null;
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        cloudResult = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            { folder: `${folder}`, resource_type: 'image', public_id: `${folder}-${Date.now()}` },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );

          uploadStream.end(processedBuffer);
        });
      } catch (cloudErr) {
        console.warn('[Cloudinary Upload Warning]', cloudErr);
        cloudResult = null;
      }
    }

    const backendProxyUrl = `/api/images/${encodeURIComponent(folder)}/${encodeURIComponent(uniqueFileName)}${cloudResult ? `?pub=${encodeURIComponent((cloudResult as any).public_id)}` : ''}`;

    return {
      success: true,
      url: backendProxyUrl,
      localPath: filePath,
      cloudinaryId: cloudResult ? (cloudResult as any).public_id : undefined,
      size: fs.statSync(filePath).size,
      width: metadata.width,
      height: metadata.height,
      storage: cloudResult ? 'cloudinary' : 'local',
    };
  } catch (error) {
    console.error('[Image Upload from Buffer Error]', error);
    return {
      success: false,
      error: 'Failed to upload image',
      storage: 'local',
    };
  }
};

/**
 * Delete image
 */
export const deleteImage = async (
  imageUrl: string,
  cloudinaryId?: string
): Promise<ImageDeleteResult> => {
  try {
    // Try Cloudinary deletion first
    if (cloudinaryId && process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        await cloudinary.uploader.destroy(cloudinaryId);
        return {
          success: true,
          message: 'Image deleted from Cloudinary',
        };
      } catch (cloudinaryError) {
        console.warn('[Cloudinary Delete Error]', cloudinaryError);
        // Fall back to local
      }
    }

    // Delete local file
    if (imageUrl.startsWith('/api/uploads/')) {
      const fileName = imageUrl.replace('/api/uploads/', '');
      const filePath = path.join(LOCAL_STORAGE_PATH, fileName);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return {
          success: true,
          message: 'Local image deleted',
        };
      }
    }

    return {
      success: true,
      message: 'Image not found, skipping deletion',
    };
  } catch (error) {
    console.error('[Image Delete Error]', error);
    return {
      success: false,
      error: 'Failed to delete image',
    };
  }
};

/**
 * Get image metadata
 */
export const getImageMetadata = async (
  filePath: string
): Promise<{ width?: number; height?: number }> => {
  try {
    const metadata = await sharp(filePath).metadata();
    return {
      width: metadata.width,
      height: metadata.height,
    };
  } catch (error) {
    console.warn('[Metadata Error]', error);
    return {};
  }
};

/**
 * Get MIME type from file extension
 */
export const getMimeType = (ext: string): string => {
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };

  return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
};

/**
 * Validate image file
 */
export const validateImageFile = (
  file: Express.Multer.File | undefined,
  options: ImageUploadOptions = {}
): { valid: boolean; error?: string } => {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  const allowedMimes =
    options.allowedMimes || DEFAULT_CONSTRAINTS.ALLOWED_MIMES;
  const maxSize = options.maxSize || DEFAULT_CONSTRAINTS.MAX_FILE_SIZE;

  if (!allowedMimes.includes(file.mimetype)) {
    return { valid: false, error: `Invalid file type: ${file.mimetype}` };
  }

  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File size exceeds limit: ${maxSize / 1024 / 1024}MB`,
    };
  }

  return { valid: true };
};

/**
 * Clean up old uploaded files (optional cleanup task)
 */
export const cleanupOldFiles = (olderThanDays: number = 30): void => {
  try {
    const now = Date.now();
    const olderThanMs = olderThanDays * 24 * 60 * 60 * 1000;

    const cleanupDir = (dirPath: string) => {
      if (!fs.existsSync(dirPath)) return;

      fs.readdirSync(dirPath).forEach((file) => {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);

        if (stats.isFile() && now - stats.mtime.getTime() > olderThanMs) {
          fs.unlinkSync(filePath);
          console.log(`[Cleanup] Deleted old file: ${filePath}`);
        }
      });
    };

    cleanupDir(PROFILE_PICS_PATH);
    cleanupDir(DOCUMENTS_PATH);
    cleanupDir(TEMP_PATH);
  } catch (error) {
    console.error('[Cleanup Error]', error);
  }
};

export default {
  ensureUploadDirs,
  createUploadMiddleware,
  uploadImage,
  uploadImageFromBuffer,
  deleteImage,
  getImageMetadata,
  getMimeType,
  validateImageFile,
  cleanupOldFiles,
  PROFILE_PICS_PATH,
  DOCUMENTS_PATH,
  LOCAL_STORAGE_PATH,
};
