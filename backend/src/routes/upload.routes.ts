import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { verifyToken } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import imageHandler from '../utils/imageHandler';
import { ResponseHandler } from '../utils/errorResponse';
import { CONSTANTS } from '../config/constants';
import { NotFoundError } from '../middleware/globalExceptionHandler';
const logger = require('../utils/logger');

const router = Router();

/**
 * Upload Routes
 * Handle image uploads with support for Cloudinary fallback to local storage
 */

/**
 * POST /api/upload/profile-picture
 * Upload profile picture for authenticated user
 */
/**
 * @swagger
 * /api/upload/profile-picture:
 *   post:
 *     summary: Upload profile picture
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Profile picture uploaded successfully
 */
router.post(
  '/profile-picture',
  verifyToken,
  
  imageHandler.createUploadMiddleware('profile-pics').single('file'),
  asyncHandler(async (req: any, res: Response) => {
    if (!req.file) {
      throw new NotFoundError('No file provided');
    }

    // Validate image
    const validation = imageHandler.validateImageFile(req.file, {
      maxSize: 5 * 1024 * 1024, // 5MB
      allowedMimes: ['image/jpeg', 'image/png', 'image/webp'],
    });

    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Upload image with resize
    const result = await imageHandler.uploadImage(req.file.path, 'profile-pictures', {
      resize: true,
      width: 500,
      height: 500,
      quality: 85,
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to upload image');
    }

    return res.status(CONSTANTS.STATUS_CODES.CREATED).json(
      ResponseHandler.success('Profile picture uploaded successfully', {
        image: {
          url: result.url,
          size: result.size,
          width: result.width,
          height: result.height,
          storage: result.storage,
        },
      })
    );
  })
);

/**
 * POST /api/upload/document
 * Upload document for authenticated user
 */
/**
 * @swagger
 * /api/upload/document:
 *   post:
 *     summary: Upload document
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Document uploaded successfully
 */
router.post(
  '/document',
  verifyToken,
  
  imageHandler.createUploadMiddleware('documents').single('file'),
  asyncHandler(async (req: any, res: Response) => {
    if (!req.file) {
      throw new NotFoundError('No file provided');
    }

    // Validate image
    const validation = imageHandler.validateImageFile(req.file);

    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Upload image
    const result = await imageHandler.uploadImage(req.file.path, 'documents');

    if (!result.success) {
      throw new Error(result.error || 'Failed to upload document');
    }

    return res.status(CONSTANTS.STATUS_CODES.CREATED).json(
      ResponseHandler.success('Document uploaded successfully', {
        image: {
          url: result.url,
          size: result.size,
          width: result.width,
          height: result.height,
          storage: result.storage,
        },
      })
    );
  })
);

/**
 * GET /api/uploads/:folder/:filename
 * Serve uploaded files from local storage
 */
/**
 * @swagger
 * /api/upload/{folder}/{filename}:
 *   get:
 *     summary: Get uploaded file
 *     tags: [Upload]
 *     parameters:
 *       - in: path
 *         name: folder
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File streamed successfully
 */
router.get(
  '/:folder/:filename',
  asyncHandler(async (req: Request, res: Response) => {
    const { folder, filename } = req.params;

    // Validate folder and filename for security
    const validFolders = ['profile-pictures', 'documents', 'profile-pics'];
    if (!validFolders.includes(folder)) {
      throw new NotFoundError('Invalid folder');
    }

    // Prevent directory traversal
    if (filename.includes('..') || filename.includes('/')) {
      throw new NotFoundError('Invalid filename');
    }

    const filePath = path.join(imageHandler.LOCAL_STORAGE_PATH, folder, filename);

    // Verify file exists and is within the uploads directory
    const resolvedPath = path.resolve(filePath);
    const uploadsPath = path.resolve(imageHandler.LOCAL_STORAGE_PATH);

    if (!resolvedPath.startsWith(uploadsPath)) {
      throw new NotFoundError('File not found');
    }

    if (!fs.existsSync(filePath)) {
      throw new NotFoundError('File not found');
    }

    // Set appropriate headers
    const ext = path.extname(filename).toLowerCase();
    const mimeType = imageHandler.getMimeType(ext);

    res.set('Content-Type', mimeType);
    res.set('Cache-Control', 'public, max-age=86400'); // Cache for 1 day

    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      logger.error('[File Stream Error]', error);
      if (!res.headersSent) {
        res.status(CONSTANTS.STATUS_CODES.NOT_FOUND).json(
          ResponseHandler.error('File not found', CONSTANTS.STATUS_CODES.NOT_FOUND)
        );
      }
    });
  })
);

/**
 * DELETE /api/upload/:filename
 * Delete uploaded file (authenticated users only)
 */
/**
 * @swagger
 * /api/upload/{folder}/{filename}:
 *   delete:
 *     summary: Delete uploaded file
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: folder
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File deleted successfully
 */
router.delete(
  '/:folder/:filename',
  verifyToken,
  
  asyncHandler(async (req: any, res: Response) => {
    const { folder, filename } = req.params;

    // Validate folder
    const validFolders = ['profile-pictures', 'documents', 'profile-pics'];
    if (!validFolders.includes(folder)) {
      throw new NotFoundError('Invalid folder');
    }

    // Prevent directory traversal
    if (filename.includes('..') || filename.includes('/')) {
      throw new NotFoundError('Invalid filename');
    }

    const imageUrl = `/api/uploads/${folder}/${filename}`;

    const result = await imageHandler.deleteImage(imageUrl);

    if (!result.success) {
      throw new Error(result.error || 'Failed to delete image');
    }

    return res.status(CONSTANTS.STATUS_CODES.OK).json(
      ResponseHandler.success('Image deleted successfully', {
        message: result.message,
      })
    );
  })
);

/**
 * POST /api/upload/bulk
 * Bulk upload multiple images
 */
/**
 * @swagger
 * /api/upload/bulk:
 *   post:
 *     summary: Bulk upload files
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Bulk upload completed
 */
router.post(
  '/bulk',
  verifyToken,
  
  imageHandler.createUploadMiddleware('documents').array('files', 10),
  asyncHandler(async (req: any, res: Response) => {
    if (!req.files || req.files.length === 0) {
      throw new NotFoundError('No files provided');
    }

    const uploadResults = [];

    for (const file of req.files) {
      const validation = imageHandler.validateImageFile(file);

      if (!validation.valid) {
        uploadResults.push({
          filename: file.originalname,
          success: false,
          error: validation.error,
        });
        continue;
      }

      const result = await imageHandler.uploadImage(file.path, 'bulk-uploads');

      uploadResults.push({
        filename: file.originalname,
        success: result.success,
        url: result.url,
        error: result.error,
        storage: result.storage,
      });
    }

    const successCount = uploadResults.filter((r) => r.success).length;
    const failureCount = uploadResults.filter((r) => !r.success).length;

    return res.status(CONSTANTS.STATUS_CODES.CREATED).json(
      ResponseHandler.success(
        `Bulk upload completed: ${successCount} succeeded, ${failureCount} failed`,
        {
          results: uploadResults,
          summary: { successCount, failureCount },
        }
      )
    );
  })
);

/**
 * POST /api/upload/from-url
 * Upload image from URL
 */
/**
 * @swagger
 * /api/upload/from-url:
 *   post:
 *     summary: Upload image from URL
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Image uploaded from URL successfully
 */
router.post(
  '/from-url',
  verifyToken,
  
  asyncHandler(async (req: any, res: Response) => {
    const { url, folder = 'documents' } = req.body;

    if (!url) {
      throw new Error('URL is required');
    }

    try {
      // Fetch image from URL
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch image from URL: ${response.statusText}`);
      }

      const buffer = await response.buffer();
      const fileName = url.split('/').pop() || 'image.jpg';

      // Upload from buffer
      const result = await imageHandler.uploadImageFromBuffer(
        buffer,
        fileName,
        folder,
        { maxSize: 5 * 1024 * 1024 }
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to upload image');
      }

      return res.status(CONSTANTS.STATUS_CODES.CREATED).json(
        ResponseHandler.success('Image uploaded from URL successfully', {
          image: {
            url: result.url,
            size: result.size,
            width: result.width,
            height: result.height,
            storage: result.storage,
          },
        })
      );
    } catch (error: any) {
      throw new Error(`Failed to download and upload image: ${error.message}`);
    }
  })
);

export default router;
