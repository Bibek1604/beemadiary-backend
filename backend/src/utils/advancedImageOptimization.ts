import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Advanced Image Optimization
 * Intelligent compression, thumbnail generation, and format optimization
 */

export interface ImageOptimizationOptions {
  // Compression
  quality?: number; // 1-100
  progressive?: boolean;

  // Formats to generate
  formats?: ('jpeg' | 'webp' | 'avif')[];

  // Thumbnails
  generateThumbnail?: boolean;
  thumbnailSizes?: { width: number; height: number }[];

  // Security
  removeExif?: boolean;
  stripMetadata?: boolean;

  // Validation
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;

  // Storage
  storageQuota?: number; // bytes
}

export interface OptimizedImageResult {
  success: boolean;
  primary: {
    path: string;
    format: string;
    size: number;
    width: number;
    height: number;
    hash: string;
  };
  formats?: {
    webp?: {
      path: string;
      size: number;
    };
    avif?: {
      path: string;
      size: number;
    };
  };
  thumbnails?: {
    path: string;
    size: number;
    width: number;
    height: number;
  }[];
  totalSize: number;
  compressionRatio: number;
  error?: string;
}

/**
 * Generate optimized versions of image in multiple formats
 */
export const optimizeImage = async (
  sourcePath: string,
  outputDir: string,
  options: ImageOptimizationOptions = {}
): Promise<OptimizedImageResult> => {
  try {
    const {
      quality = 80,
      progressive = true,
      formats = ['jpeg', 'webp'],
      generateThumbnail = true,
      thumbnailSizes = [
        { width: 100, height: 100 },
        { width: 300, height: 300 },
      ],
      removeExif = true,
      stripMetadata = true,
      minWidth = 100,
      minHeight = 100,
      maxWidth = 4000,
      maxHeight = 4000,
    } = options;

    // Read source file
    if (!fs.existsSync(sourcePath)) {
      throw new Error('Source file not found');
    }

    const sourceStats = fs.statSync(sourcePath);
    const sourceSize = sourceStats.size;
    const fileName = path.parse(sourcePath).name;

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Get image metadata
    let metadata = await sharp(sourcePath).metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error('Unable to determine image dimensions');
    }

    // Validate dimensions
    if (metadata.width < minWidth || metadata.height < minHeight) {
      throw new Error(
        `Image dimensions too small: ${metadata.width}x${metadata.height}`
      );
    }

    if (metadata.width > maxWidth || metadata.height > maxHeight) {
      throw new Error(
        `Image dimensions too large: ${metadata.width}x${metadata.height}`
      );
    }

    // Build optimization pipeline
    let pipeline = sharp(sourcePath);

    // Remove EXIF/metadata for privacy
    if (removeExif || stripMetadata) {
      pipeline = pipeline.withMetadata(false);
    }

    // Process primary image
    const primaryPath = path.join(outputDir, `${fileName}-primary.jpg`);
    await pipeline
      .resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality, progressive, mozjpeg: true })
      .toFile(primaryPath);

    const primaryStats = fs.statSync(primaryPath);
    const primarySize = primaryStats.size;
    const primaryMetadata = await sharp(primaryPath).metadata();

    // Calculate hash for deduplication
    const fileHash = crypto
      .createHash('sha256')
      .update(fs.readFileSync(primaryPath))
      .digest('hex')
      .substring(0, 16);

    const result: OptimizedImageResult = {
      success: true,
      primary: {
        path: primaryPath,
        format: 'jpeg',
        size: primarySize,
        width: primaryMetadata.width || 0,
        height: primaryMetadata.height || 0,
        hash: fileHash,
      },
      totalSize: primarySize,
      compressionRatio: sourceSize / primarySize,
    };

    // Generate additional formats
    const formatsObj: Record<string, { path: string; size: number }> = {};

    // WebP format (typically 25-35% smaller)
    if (formats.includes('webp')) {
      const webpPath = path.join(outputDir, `${fileName}-primary.webp`);
      await sharp(sourcePath)
        .resize(maxWidth, maxHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality })
        .toFile(webpPath);

      const webpStats = fs.statSync(webpPath);
      formatsObj.webp = {
        path: webpPath,
        size: webpStats.size,
      };
      result.totalSize += webpStats.size;
    }

    // AVIF format (even smaller but less compatible)
    if (formats.includes('avif')) {
      try {
        const avifPath = path.join(outputDir, `${fileName}-primary.avif`);
        await sharp(sourcePath)
          .resize(maxWidth, maxHeight, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .avif({ quality })
          .toFile(avifPath);

        const avifStats = fs.statSync(avifPath);
        formatsObj.avif = {
          path: avifPath,
          size: avifStats.size,
        };
        result.totalSize += avifStats.size;
      } catch (avifError) {
        console.warn('[AVIF Generation Error]', avifError);
        // Continue without AVIF
      }
    }

    if (Object.keys(formatsObj).length > 0) {
      result.formats = formatsObj;
    }

    // Generate thumbnails
    if (generateThumbnail && thumbnailSizes.length > 0) {
      const thumbnails: OptimizedImageResult['thumbnails'] = [];

      for (const size of thumbnailSizes) {
        const thumbPath = path.join(
          outputDir,
          `${fileName}-thumb-${size.width}x${size.height}.jpg`
        );

        const thumbMetadata = await sharp(sourcePath)
          .resize(size.width, size.height, { fit: 'cover' })
          .jpeg({ quality: 75, progressive: true })
          .toFile(thumbPath);

        const thumbStats = fs.statSync(thumbPath);
        thumbnails.push({
          path: thumbPath,
          size: thumbStats.size,
          width: thumbMetadata.width,
          height: thumbMetadata.height,
        });

        result.totalSize += thumbStats.size;
      }

      result.thumbnails = thumbnails;
    }

    return result;
  } catch (error) {
    console.error('[Image Optimization Error]', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      primary: {
        path: '',
        format: '',
        size: 0,
        width: 0,
        height: 0,
        hash: '',
      },
      totalSize: 0,
      compressionRatio: 1,
    };
  }
};

/**
 * Smart format selection based on browser support
 */
export const selectBestFormat = (
  availableFormats: {
    jpeg?: { path: string; size: number };
    webp?: { path: string; size: number };
    avif?: { path: string; size: number };
  },
  userAgent?: string
): { format: string; path: string } => {
  // AVIF has best compression but limited support
  if (availableFormats.avif && shouldUseAvif(userAgent)) {
    return {
      format: 'avif',
      path: availableFormats.avif.path,
    };
  }

  // WebP has good compression and broad support
  if (availableFormats.webp && shouldUseWebp(userAgent)) {
    return {
      format: 'webp',
      path: availableFormats.webp.path,
    };
  }

  // JPEG fallback - universal support
  if (availableFormats.jpeg) {
    return {
      format: 'jpeg',
      path: availableFormats.jpeg.path,
    };
  }

  throw new Error('No image formats available');
};

/**
 * Check if browser supports AVIF
 */
const shouldUseAvif = (userAgent?: string): boolean => {
  if (!userAgent) return false;

  // Chrome 85+, Firefox 93+, Safari 16+
  const isChrome = /Chrome\/([0-9]+)/.test(userAgent);
  const chromeMatch = userAgent.match(/Chrome\/([0-9]+)/);
  if (isChrome && chromeMatch) {
    return parseInt(chromeMatch[1]) >= 85;
  }

  const isFirefox = /Firefox\/([0-9]+)/.test(userAgent);
  const firefoxMatch = userAgent.match(/Firefox\/([0-9]+)/);
  if (isFirefox && firefoxMatch) {
    return parseInt(firefoxMatch[1]) >= 93;
  }

  const isSafari = /Version\/([0-9]+)/.test(userAgent);
  const safariMatch = userAgent.match(/Version\/([0-9]+)/);
  if (isSafari && safariMatch) {
    return parseInt(safariMatch[1]) >= 16;
  }

  return false;
};

/**
 * Check if browser supports WebP
 */
const shouldUseWebp = (userAgent?: string): boolean => {
  if (!userAgent) return true; // Default to WebP

  // IE doesn't support WebP
  if (/Trident/.test(userAgent) || /MSIE/.test(userAgent)) {
    return false;
  }

  // Safari < 14 doesn't support WebP
  const isSafari = /Version\/([0-9]+)/.test(userAgent);
  const safariMatch = userAgent.match(/Version\/([0-9]+)/);
  if (isSafari && safariMatch) {
    const version = parseInt(safariMatch[1]);
    if (version < 14) return false;
  }

  return true;
};

/**
 * Calculate storage quota usage
 */
export const getStorageUsage = (directory: string): number => {
  let total = 0;

  const walkDir = (dir: string) => {
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);

      if (stats.isDirectory()) {
        walkDir(filePath);
      } else {
        total += stats.size;
      }
    }
  };

  walkDir(directory);
  return total;
};

/**
 * Check if upload would exceed quota
 */
export const checkStorageQuota = (
  storageDir: string,
  newFileSize: number,
  quotaBytes: number
): { canUpload: boolean; currentUsage: number; availableSpace: number } => {
  const currentUsage = getStorageUsage(storageDir);
  const availableSpace = quotaBytes - currentUsage;
  const canUpload = newFileSize <= availableSpace;

  return { canUpload, currentUsage, availableSpace };
};

/**
 * Deduplicate images based on hash
 */
export const deduplicateImage = (
  hash: string,
  indexPath: string
): { isDuplicate: boolean; existingPath?: string } => {
  try {
    if (!fs.existsSync(indexPath)) {
      return { isDuplicate: false };
    }

    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    if (index[hash]) {
      return { isDuplicate: true, existingPath: index[hash] };
    }

    return { isDuplicate: false };
  } catch (error) {
    console.warn('[Deduplication Error]', error);
    return { isDuplicate: false };
  }
};

/**
 * Index image for deduplication
 */
export const indexImage = (
  hash: string,
  filePath: string,
  indexPath: string
): void => {
  try {
    let index: Record<string, string> = {};

    if (fs.existsSync(indexPath)) {
      index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    }

    index[hash] = filePath;
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  } catch (error) {
    console.warn('[Image Indexing Error]', error);
  }
};

/**
 * Responsive image srcset generator
 */
export const generateSrcSet = (
  basePath: string,
  formats?: {
    jpeg?: { path: string };
    webp?: { path: string };
    avif?: { path: string };
  }
): {
  srcset: string;
  webpSrcset?: string;
  avifSrcset?: string;
} => {
  const result: any = {
    srcset: basePath,
  };

  if (formats?.webp) {
    result.webpSrcset = formats.webp.path;
  }

  if (formats?.avif) {
    result.avifSrcset = formats.avif.path;
  }

  return result;
};

export default {
  optimizeImage,
  selectBestFormat,
  getStorageUsage,
  checkStorageQuota,
  deduplicateImage,
  indexImage,
  generateSrcSet,
};
