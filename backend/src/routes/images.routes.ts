import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
// Use dynamic require for node-fetch to avoid TS declaration issues
const fetch = require('node-fetch');
import imageHandler from '../utils/imageHandler';
import { ResponseHandler } from '../utils/errorResponse';
import { CONSTANTS } from '../config/constants';

const router = Router();

// Stream helper
const streamLocalFile = (filePath: string, res: Response) => {
  const ext = path.extname(filePath).toLowerCase();
  const mime = imageHandler.getMimeType(ext);
  res.set('Content-Type', mime);
  res.set('Cache-Control', 'public, max-age=86400');
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  stream.on('error', () => {
    if (!res.headersSent) res.status(CONSTANTS.STATUS_CODES.NOT_FOUND).json(ResponseHandler.error('File not found', CONSTANTS.STATUS_CODES.NOT_FOUND));
  });
};

/**
 * GET /api/images/:folder/:filename
 * Serve image by trying Cloudinary first, falling back to local backup
 */
/**
 * @swagger
 * /api/images/{folder}/{filename}:
 *   get:
 *     summary: Get image
 *     tags: [Images]
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
 *         description: Image served successfully
 */
router.get('/:folder/:filename', async (req: Request, res: Response) => {
  const { folder, filename } = req.params;
  // basic validation
  if (!folder || !filename || filename.includes('..') || filename.includes('/')) {
    return res.status(CONSTANTS.STATUS_CODES.NOT_FOUND).json(ResponseHandler.error('Invalid file', CONSTANTS.STATUS_CODES.NOT_FOUND));
  }

  const localPath = path.join(imageHandler.LOCAL_STORAGE_PATH, folder, filename);

  // If query contains Cloudinary public id, try Cloudinary first
  const pub = String(req.query.pub || '');
  if (pub && process.env.CLOUDINARY_CLOUD_NAME) {
    try {
      // Build Cloudinary raw fetch URL (use fetch to validate availability)
      const cloudUrl = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/${encodeURIComponent(pub)}.webp`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000); // 3s timeout
      const resp = await fetch(cloudUrl, { method: 'GET', signal: controller.signal });
      clearTimeout(timeout);
      if (resp.ok) {
        // Pipe remote response
        res.set('Content-Type', resp.headers.get('content-type') || 'image/webp');
        res.set('Cache-Control', 'public, max-age=86400');
        (resp.body as any).pipe(res);
        return;
      }
      // otherwise fallthrough to local
    } catch (err) {
      // Cloudinary fetch failed -> fallback to local
    }
  }

  // Serve local backup if available
  if (fs.existsSync(localPath)) {
    return streamLocalFile(localPath, res);
  }

  return res.status(CONSTANTS.STATUS_CODES.NOT_FOUND).json(ResponseHandler.error('File not found', CONSTANTS.STATUS_CODES.NOT_FOUND));
});

export default router;
