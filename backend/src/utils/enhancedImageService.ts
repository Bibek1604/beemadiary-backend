import path from 'path';
import fs from 'fs';
import { optimizeImage, deduplicateImage, indexImage } from './advancedImageOptimization';
import {
  initializeRecoverySystems,
  GracefulDegradation,
} from '../middleware/advancedErrorRecovery';
import imageHandler from './imageHandler';

/**
 * Enhanced Image Service
 * Integrates optimization, deduplication, storage quota, and recovery mechanisms
 */

interface UploadConfig {
  storageDir: string;
  storageQuotaMB: number;
  optimizationEnabled: boolean;
  deduplicationEnabled: boolean;
  compressionQuality: number;
  supportedFormats: ('jpeg' | 'webp' | 'avif')[];
  generateThumbnails: boolean;
  removeExif: boolean;
}

export class EnhancedImageService {
  private config: UploadConfig;
  private recovery: ReturnType<typeof initializeRecoverySystems>;
  private indexPath: string;
  private statsPath: string;

  constructor(config: Partial<UploadConfig> = {}) {
    this.config = {
      storageDir: config.storageDir || imageHandler.LOCAL_STORAGE_PATH,
      storageQuotaMB: config.storageQuotaMB || 5000, // 5GB default
      optimizationEnabled: config.optimizationEnabled !== false,
      deduplicationEnabled: config.deduplicationEnabled !== false,
      compressionQuality: config.compressionQuality || 80,
      supportedFormats: config.supportedFormats || ['jpeg', 'webp'],
      generateThumbnails: config.generateThumbnails !== false,
      removeExif: config.removeExif !== false,
    };

    this.recovery = initializeRecoverySystems();
    this.indexPath = path.join(this.config.storageDir, '.image-index.json');
    this.statsPath = path.join(this.config.storageDir, '.storage-stats.json');

    this.initializeStorage();
  }

  /**
   * Initialize storage directories and load stats
   */
  private initializeStorage(): void {
    if (!fs.existsSync(this.config.storageDir)) {
      fs.mkdirSync(this.config.storageDir, { recursive: true });
    }

    // Create stats file if it doesn't exist
    if (!fs.existsSync(this.statsPath)) {
      this.saveStats({
        totalSize: 0,
        fileCount: 0,
        lastUpdated: new Date(),
      });
    }
  }

  /**
   * Enhanced upload with optimization, deduplication, and quota checking
   */
  async uploadAndOptimize(
    filePath: string,
    folder: string
  ): Promise<{
    success: boolean;
    primary: { url: string; size: number; hash: string };
    formats?: Record<string, { url: string; size: number }>;
    thumbnails?: { url: string; size: number }[];
    savedSpace: number;
    isDuplicate: boolean;
    error?: string;
  }> {
    try {
      // Validate file exists
      if (!fs.existsSync(filePath)) {
        throw new Error('File not found');
      }

      const fileSize = fs.statSync(filePath).size;

      // Check storage quota
      const quotaBytes = this.config.storageQuotaMB * 1024 * 1024;
      const { canUpload, currentUsage } = this.checkQuota(fileSize);

      if (!canUpload) {
        throw new Error(
          `Storage quota exceeded. Current: ${(currentUsage / 1024 / 1024).toFixed(2)}MB, Limit: ${this.config.storageQuotaMB}MB`
        );
      }

      // Check for duplicates
      let isDuplicate = false;
      let existingPath: string | undefined;

      if (this.config.deduplicationEnabled) {
        const fileHash = await this.calculateFileHash(filePath);
        const dupCheck = deduplicateImage(fileHash, this.indexPath);

        if (dupCheck.isDuplicate && dupCheck.existingPath) {
          isDuplicate = true;
          existingPath = dupCheck.existingPath;

          // Return existing image info
          return {
            success: true,
            primary: {
              url: `/api/uploads/${folder}/${path.basename(existingPath)}`,
              size: fileSize,
              hash: fileHash,
            },
            savedSpace: fileSize,
            isDuplicate: true,
          };
        }
      }

      // Optimize image with recovery
      const outputDir = path.join(
        this.config.storageDir,
        folder,
        'optimized'
      );

      const optimization = await this.recovery.degradation.executeWithFallback(
        'advanced-compression',
        async () => {
          return optimizeImage(filePath, outputDir, {
            quality: this.config.compressionQuality,
            formats: this.config.supportedFormats,
            generateThumbnail: this.config.generateThumbnails,
            removeExif: this.config.removeExif,
            minWidth: 50,
            minHeight: 50,
            maxWidth: 4000,
            maxHeight: 4000,
          });
        },
        async () => {
          // Fallback: simple upload without optimization
          const result = await imageHandler.uploadImage(filePath, folder);
          return {
            success: result.success,
            primary: {
              path: result.localPath || '',
              format: 'jpeg',
              size: result.size || 0,
              width: result.width || 0,
              height: result.height || 0,
              hash: '',
            },
            totalSize: result.size || 0,
            compressionRatio: 1,
          };
        }
      );

      if (!optimization.success) {
        throw new Error(optimization.error || 'Optimization failed');
      }

      // Index image for deduplication
      if (this.config.deduplicationEnabled && optimization.primary.hash) {
        indexImage(
          optimization.primary.hash,
          optimization.primary.path,
          this.indexPath
        );
      }

      // Update storage stats
      this.updateStats(optimization.totalSize);

      // Format response
      const savedSpace = fileSize - optimization.primary.size;

      return {
        success: true,
        primary: {
          url: `/api/uploads/${folder}/optimized/${path.basename(
            optimization.primary.path
          )}`,
          size: optimization.primary.size,
          hash: optimization.primary.hash,
        },
        formats: optimization.formats
          ? Object.entries(optimization.formats).reduce(
              (acc, [format, data]) => {
                acc[format] = {
                  url: `/api/uploads/${folder}/optimized/${path.basename(
                    data.path
                  )}`,
                  size: data.size,
                };
                return acc;
              },
              {} as Record<string, { url: string; size: number }>
            )
          : undefined,
        thumbnails: optimization.thumbnails
          ? optimization.thumbnails.map((thumb) => ({
              url: `/api/uploads/${folder}/optimized/${path.basename(
                thumb.path
              )}`,
              size: thumb.size,
            }))
          : undefined,
        savedSpace,
        isDuplicate: false,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.recovery.errorMonitor.recordError('UploadOptimization', 500);

      return {
        success: false,
        primary: { url: '', size: 0, hash: '' },
        savedSpace: 0,
        isDuplicate: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Check storage quota
   */
  checkQuota(additionalSize: number): {
    canUpload: boolean;
    currentUsage: number;
    availableSpace: number;
  } {
    const stats = this.loadStats();
    const quotaBytes = this.config.storageQuotaMB * 1024 * 1024;
    const currentUsage = stats.totalSize;
    const availableSpace = quotaBytes - currentUsage;
    const canUpload = additionalSize <= availableSpace;

    return { canUpload, currentUsage, availableSpace };
  }

  /**
   * Calculate file hash for deduplication
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    const crypto = await import('crypto');
    const fs = await import('fs');
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex').substring(0, 16);
  }

  /**
   * Update storage stats
   */
  private updateStats(additionalSize: number): void {
    const stats = this.loadStats();
    stats.totalSize += additionalSize;
    stats.fileCount += 1;
    stats.lastUpdated = new Date();
    this.saveStats(stats);
  }

  /**
   * Load storage stats
   */
  private loadStats(): {
    totalSize: number;
    fileCount: number;
    lastUpdated: Date;
  } {
    try {
      if (fs.existsSync(this.statsPath)) {
        const data = JSON.parse(fs.readFileSync(this.statsPath, 'utf-8'));
        return {
          totalSize: data.totalSize || 0,
          fileCount: data.fileCount || 0,
          lastUpdated: new Date(data.lastUpdated),
        };
      }
    } catch (error) {
      console.warn('[Stats Load Error]', error);
    }

    return {
      totalSize: 0,
      fileCount: 0,
      lastUpdated: new Date(),
    };
  }

  /**
   * Save storage stats
   */
  private saveStats(stats: {
    totalSize: number;
    fileCount: number;
    lastUpdated: Date;
  }): void {
    try {
      fs.writeFileSync(this.statsPath, JSON.stringify(stats, null, 2));
    } catch (error) {
      console.warn('[Stats Save Error]', error);
    }
  }

  /**
   * Get storage stats
   */
  getStorageStats(): {
    usedMB: number;
    quotaMB: number;
    usagePercent: number;
    fileCount: number;
    lastUpdated: Date;
  } {
    const stats = this.loadStats();
    const usedMB = stats.totalSize / 1024 / 1024;
    const usagePercent = (usedMB / this.config.storageQuotaMB) * 100;

    return {
      usedMB: parseFloat(usedMB.toFixed(2)),
      quotaMB: this.config.storageQuotaMB,
      usagePercent: parseFloat(usagePercent.toFixed(2)),
      fileCount: stats.fileCount,
      lastUpdated: stats.lastUpdated,
    };
  }

  /**
   * Get error metrics
   */
  getErrorMetrics(): Record<string, any> {
    return this.recovery.errorMonitor.getMetricsSummary();
  }

  /**
   * Get system health
   */
  getSystemHealth(): {
    status: 'healthy' | 'degraded' | 'critical';
    components: Record<string, { status: string; details: string }>;
  } {
    const storageStats = this.getStorageStats();
    const errorMetrics = this.getErrorMetrics();
    const features = this.recovery.degradation.getStatus();

    const components: Record<string, { status: string; details: string }> = {
      storage: {
        status: storageStats.usagePercent > 90 ? 'critical' : 'healthy',
        details: `${storageStats.usedMB}MB / ${storageStats.quotaMB}MB (${storageStats.usagePercent}%)`,
      },
      errors: {
        status: this.recovery.errorMonitor.isCritical() ? 'critical' : 'healthy',
        details: `${errorMetrics.totalErrors} errors, ${errorMetrics.errorsPerMinute}/min`,
      },
      database: {
        status: this.recovery.databaseCircuitBreaker.getState(),
        details: `Circuit breaker: ${this.recovery.databaseCircuitBreaker.getState()}`,
      },
      cloudinary: {
        status: this.recovery.cloudinaryCircuitBreaker.getState(),
        details: `Circuit breaker: ${this.recovery.cloudinaryCircuitBreaker.getState()}`,
      },
      features: {
        status: Object.values(features).every((f) => f) ? 'healthy' : 'degraded',
        details: Object.entries(features)
          .map(([name, enabled]) => `${name}: ${enabled ? 'enabled' : 'disabled'}`)
          .join(', '),
      },
    };

    const statuses = Object.values(components).map((c) => c.status);
    const overallStatus: 'healthy' | 'degraded' | 'critical' = statuses.includes('critical')
      ? 'critical'
      : statuses.includes('degraded')
      ? 'degraded'
      : 'healthy';

    return {
      status: overallStatus,
      components,
    };
  }

  /**
   * Reset error monitoring
   */
  resetMetrics(): void {
    this.recovery.errorMonitor.reset();
  }

  /**
   * Get recovery systems for external use
   */
  getRecoverySystems() {
    return this.recovery;
  }
}

// Create singleton instance
let serviceInstance: EnhancedImageService | null = null;

export const getEnhancedImageService = (config?: Partial<UploadConfig>): EnhancedImageService => {
  if (!serviceInstance) {
    serviceInstance = new EnhancedImageService(config);
  }
  return serviceInstance;
};

export default {
  EnhancedImageService,
  getEnhancedImageService,
};
