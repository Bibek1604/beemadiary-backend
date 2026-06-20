import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
// Use dynamic require for node-fetch to avoid TS declaration issues
const fetch = require('node-fetch');
import imageHandler from '../utils/imageHandler';
import { ResponseHandler } from '../utils/errorResponse';
import { CONSTANTS } from '../config/constants';
const logger = require('../utils/logger');
const asyncHandler = require('../utils/asyncHandler');

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
 * @swagger
 * /api/images/{path}:
 *   get:
 *     summary: Get image (Cloudinary-first, local backup fallback)
 *     description: >
 *       Serves an image by trying Cloudinary first (when a ?pub public id is given
 *       and Cloudinary is reachable) and falling back to the local backup copy.
 *       The path may contain nested folder segments, e.g.
 *       lic-insurance/agent-profiles/<id>/<file>.webp
 *     tags: [Images]
 *     parameters:
 *       - in: path
 *         name: path
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: pub
 *         required: false
 *         schema: { type: string }
 *         description: Cloudinary public id (enables Cloudinary-first serving)
 *     responses:
 *       200: { description: Image served successfully }
 *       404: { description: File not found }
 */
router.get('/*', asyncHandler(async (req: Request, res: Response) => {
  // Everything after /api/images/ — may include nested folders + the filename.
  const subPath = String((req.params as any)[0] || '');

  // Reject empty paths and traversal attempts (raw or null-byte).
  if (!subPath || subPath.includes('..') || subPath.includes('\0')) {
    return res.status(CONSTANTS.STATUS_CODES.NOT_FOUND).json(ResponseHandler.error('Invalid file', CONSTANTS.STATUS_CODES.NOT_FOUND));
  }

  const root = path.resolve(imageHandler.LOCAL_STORAGE_PATH);
  const localPath = path.resolve(root, subPath);
  // Path-containment guard: the resolved path must stay inside the uploads root.
  if (localPath !== root && !localPath.startsWith(root + path.sep)) {
    return res.status(CONSTANTS.STATUS_CODES.NOT_FOUND).json(ResponseHandler.error('Invalid file', CONSTANTS.STATUS_CODES.NOT_FOUND));
  }

  // PRIMARY: if a Cloudinary public id is supplied, try Cloudinary first.
  const pub = String(req.query.pub || '');
  if (pub && process.env.CLOUDINARY_CLOUD_NAME) {
    try {
      // Encode each path segment but keep folder slashes intact (a public_id like
      // "agent-profiles/xyz" must stay a real path, not %2F).
      const encodedPub = pub.split('/').map(encodeURIComponent).join('/');
      const cloudUrl = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/${encodedPub}.webp`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000); // 3s timeout
      const resp = await fetch(cloudUrl, { method: 'GET', signal: controller.signal });
      clearTimeout(timeout);
      if (resp.ok) {
        res.set('Content-Type', resp.headers.get('content-type') || 'image/webp');
        res.set('Cache-Control', 'public, max-age=86400');
        (resp.body as any).pipe(res);
        return;
      }
      // not ok -> fall through to local
    } catch (err) {
      logger.warn('[images] Cloudinary fetch failed, serving local fallback', err);
    }
  }

  // FALLBACK: serve the local backup copy if present.
  if (fs.existsSync(localPath)) {
    return streamLocalFile(localPath, res);
  }

  return res.status(CONSTANTS.STATUS_CODES.NOT_FOUND).json(ResponseHandler.error('File not found', CONSTANTS.STATUS_CODES.NOT_FOUND));
}));

export default router;
