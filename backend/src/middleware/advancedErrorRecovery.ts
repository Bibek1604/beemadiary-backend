import { Request, Response } from 'express';

/**
 * Advanced Error Recovery & Resilience System
 * Circuit breaker, retries, graceful degradation, monitoring
 */

export interface RetryConfig {
  maxRetries: number;
  initialDelay: number; // ms
  maxDelay: number; // ms
  backoffMultiplier: number;
  jitter?: boolean;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number; // ms
}

export interface ErrorMetrics {
  totalErrors: number;
  errorsByType: Record<string, number>;
  errorsByCode: Record<number, number>;
  errorRate: number;
  averageResponseTime: number;
  lastErrorTime: Date;
}

/**
 * Exponential backoff retry logic
 */
export class RetryManager {
  private config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = {
      maxRetries: config.maxRetries || 3,
      initialDelay: config.initialDelay || 100,
      maxDelay: config.maxDelay || 10000,
      backoffMultiplier: config.backoffMultiplier || 2,
      jitter: config.jitter !== false,
    };
  }

  /**
   * Execute function with automatic retries
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    context?: string
  ): Promise<T> {
    let lastError: any;
    let delay = this.config.initialDelay;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt === this.config.maxRetries) {
          break;
        }

        // Calculate delay with jitter
        let waitTime = Math.min(delay, this.config.maxDelay);
        if (this.config.jitter) {
          waitTime = waitTime * (0.5 + Math.random());
        }

        console.warn(
          `[Retry ${attempt + 1}/${this.config.maxRetries}] ${context || 'Operation'} failed, retrying in ${waitTime}ms`,
          error instanceof Error ? error.message : error
        );

        await this.sleep(waitTime);
        delay *= this.config.backoffMultiplier;
      }
    }

    throw new Error(
      `Operation failed after ${this.config.maxRetries} retries: ${
        lastError instanceof Error ? lastError.message : lastError
      }`
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Circuit Breaker pattern for preventing cascading failures
 */
export class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private config: CircuitBreakerConfig;
  private name: string;

  constructor(name: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.name = name;
    this.config = {
      failureThreshold: config.failureThreshold || 5,
      successThreshold: config.successThreshold || 2,
      timeout: config.timeout || 60000, // 1 minute default
    };
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should be reset
    if (
      this.state === 'OPEN' &&
      Date.now() - this.lastFailureTime > this.config.timeout
    ) {
      console.log(
        `[Circuit Breaker ${this.name}] Transitioning to HALF_OPEN`
      );
      this.state = 'HALF_OPEN';
      this.successCount = 0;
    }

    // Reject if circuit is open
    if (this.state === 'OPEN') {
      throw new Error(`Circuit breaker ${this.name} is OPEN`);
    }

    try {
      const result = await fn();

      // Record success
      if (this.state === 'HALF_OPEN') {
        this.successCount++;
        if (this.successCount >= this.config.successThreshold) {
          console.log(
            `[Circuit Breaker ${this.name}] Transitioning to CLOSED`
          );
          this.state = 'CLOSED';
          this.failureCount = 0;
          this.successCount = 0;
        }
      } else {
        this.failureCount = 0;
      }

      return result;
    } catch (error) {
      this.lastFailureTime = Date.now();
      this.failureCount++;

      if (this.failureCount >= this.config.failureThreshold) {
        console.error(
          `[Circuit Breaker ${this.name}] Opening circuit after ${this.failureCount} failures`
        );
        this.state = 'OPEN';
      }

      throw error;
    }
  }

  getState(): string {
    return this.state;
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
  }
}

/**
 * Error metrics collector and monitor
 */
export class ErrorMonitor {
  private metrics: ErrorMetrics = {
    totalErrors: 0,
    errorsByType: {},
    errorsByCode: {},
    errorRate: 0,
    averageResponseTime: 0,
    lastErrorTime: new Date(),
  };

  private requestTimings: Map<string, number> = new Map();
  private errorWindow: { time: number; count: number }[] = [];
  private windowSize = 60000; // 1 minute window

  /**
   * Record an error
   */
  recordError(
    errorType: string,
    errorCode?: number,
    requestId?: string
  ): void {
    this.metrics.totalErrors++;
    this.metrics.errorsByType[errorType] =
      (this.metrics.errorsByType[errorType] || 0) + 1;

    if (errorCode) {
      this.metrics.errorsByCode[errorCode] =
        (this.metrics.errorsByCode[errorCode] || 0) + 1;
    }

    this.metrics.lastErrorTime = new Date();

    // Add to error window for rate calculation
    const now = Date.now();
    this.errorWindow.push({ time: now, count: 1 });

    // Clean old entries from window
    this.errorWindow = this.errorWindow.filter(
      (entry) => now - entry.time < this.windowSize
    );

    // Calculate error rate (errors per minute)
    this.metrics.errorRate = this.errorWindow.length;

    console.error(
      `[Error Monitor] ${errorType}${errorCode ? ` (${errorCode})` : ''}${
        requestId ? ` [${requestId}]` : ''
      }`
    );
  }

  /**
   * Record request timing
   */
  recordRequestTiming(requestId: string, duration: number): void {
    this.requestTimings.set(requestId, duration);

    // Calculate average (keep last 100 requests)
    const timings = Array.from(this.requestTimings.values());
    if (timings.length > 100) {
      const firstKey = Array.from(this.requestTimings.keys())[0];
      this.requestTimings.delete(firstKey);
    }

    const sum = timings.reduce((a, b) => a + b, 0);
    this.metrics.averageResponseTime = sum / timings.length;
  }

  /**
   * Get current metrics
   */
  getMetrics(): ErrorMetrics {
    return { ...this.metrics };
  }

  /**
   * Get metrics for a specific period
   */
  getMetricsSummary(): Record<string, any> {
    return {
      totalErrors: this.metrics.totalErrors,
      errorsByType: this.metrics.errorsByType,
      errorsByCode: this.metrics.errorsByCode,
      errorsPerMinute: this.metrics.errorRate,
      averageResponseTimeMs: Math.round(this.metrics.averageResponseTime),
      lastErrorTime: this.metrics.lastErrorTime,
      uptime: new Date().getTime() - this.metrics.lastErrorTime.getTime(),
    };
  }

  /**
   * Check if error rate is critical
   */
  isCritical(threshold: number = 10): boolean {
    return this.metrics.errorRate > threshold;
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.metrics = {
      totalErrors: 0,
      errorsByType: {},
      errorsByCode: {},
      errorRate: 0,
      averageResponseTime: 0,
      lastErrorTime: new Date(),
    };
    this.requestTimings.clear();
    this.errorWindow = [];
  }
}

/**
 * Graceful degradation strategy
 */
export class GracefulDegradation {
  private features: Map<string, boolean> = new Map();

  /**
   * Register a feature that can be degraded
   */
  registerFeature(name: string, enabled: boolean = true): void {
    this.features.set(name, enabled);
  }

  /**
   * Check if feature is available
   */
  isAvailable(name: string): boolean {
    return this.features.get(name) ?? true;
  }

  /**
   * Disable a feature
   */
  disableFeature(name: string): void {
    this.features.set(name, false);
    console.warn(`[Graceful Degradation] Feature '${name}' disabled`);
  }

  /**
   * Enable a feature
   */
  enableFeature(name: string): void {
    this.features.set(name, true);
    console.log(`[Graceful Degradation] Feature '${name}' enabled`);
  }

  /**
   * Get feature status
   */
  getStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    for (const [name, enabled] of this.features) {
      status[name] = enabled;
    }
    return status;
  }

  /**
   * Execute with fallback
   */
  async executeWithFallback<T>(
    feature: string,
    primary: () => Promise<T>,
    fallback: () => Promise<T> | T
  ): Promise<T> {
    if (!this.isAvailable(feature)) {
      return fallback();
    }

    try {
      return await primary();
    } catch (error) {
      console.warn(
        `[Graceful Degradation] Primary failed for '${feature}', using fallback`,
        error instanceof Error ? error.message : error
      );
      return fallback();
    }
  }
}

/**
 * Error context enrichment
 */
export interface ErrorContext {
  userId?: number;
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  duration: number; // ms
  userAgent?: string;
  ipAddress?: string;
  errorType: string;
  errorMessage: string;
  stack?: string;
  additionalData?: Record<string, any>;
}

export class ErrorContextBuilder {
  static buildFromRequest(
    req: Request,
    statusCode: number,
    error: any,
    duration: number
  ): ErrorContext {
    return {
      userId: (req as any).user?.id,
      requestId: (req as any).id || 'unknown',
      method: req.method,
      path: req.path,
      statusCode,
      duration,
      userAgent: req.get('user-agent'),
      ipAddress: req.ip,
      errorType: error?.type || error?.name || 'Unknown',
      errorMessage: error?.message || 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
    };
  }
}

/**
 * Initialize recovery systems
 */
export const initializeRecoverySystems = () => {
  const retryManager = new RetryManager({
    maxRetries: 3,
    initialDelay: 100,
    maxDelay: 5000,
  });

  const databaseCircuitBreaker = new CircuitBreaker('database', {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
  });

  const cloudinaryCircuitBreaker = new CircuitBreaker('cloudinary', {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 60000,
  });

  const errorMonitor = new ErrorMonitor();

  const degradation = new GracefulDegradation();
  degradation.registerFeature('cloudinary', true);
  degradation.registerFeature('advanced-compression', true);
  degradation.registerFeature('thumbnail-generation', true);
  degradation.registerFeature('image-deduplication', true);

  return {
    retryManager,
    databaseCircuitBreaker,
    cloudinaryCircuitBreaker,
    errorMonitor,
    degradation,
  };
};

export default {
  RetryManager,
  CircuitBreaker,
  ErrorMonitor,
  GracefulDegradation,
  ErrorContextBuilder,
  initializeRecoverySystems,
};
