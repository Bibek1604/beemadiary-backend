/**
 * Database Connection Handler
 * Manages connection pooling, health checks, and recovery
 */

import mongoPrisma, { MongoConnectionManager } from '../config/mongoClient';
import { ConnectionError, RetryHandler, ErrorLogger } from './errorHandler';

export interface IConnectionConfig {
  maxRetries?: number;
  retryDelayMs?: number;
  connectionTimeoutMs?: number;
  healthCheckIntervalMs?: number;
}

/**
 * Connection Manager Singleton
 */
export class ConnectionManager {
  private static instance: ConnectionManager;
  private isConnected: boolean = false;
  private config: Required<IConnectionConfig>;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  private constructor(config?: IConnectionConfig) {
    this.config = {
      maxRetries: config?.maxRetries || 3,
      retryDelayMs: config?.retryDelayMs || 1000,
      connectionTimeoutMs: config?.connectionTimeoutMs || 10000,
      healthCheckIntervalMs: config?.healthCheckIntervalMs || 60000,
    };

  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: IConnectionConfig): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager(config);
    }
    return ConnectionManager.instance;
  }

  /**
   * Initialize connection with retry logic
   */
  async initialize(): Promise<void> {
    try {
      await RetryHandler.retry(
        () => this.testConnection(),
        this.config.maxRetries,
        this.config.retryDelayMs,
        true
      );

      this.isConnected = true;
      console.log('[ConnectionManager] Database connection established');

      // Start health check
      this.startHealthCheck();
    } catch (error) {
      this.isConnected = false;
      const message = `Failed to connect to database after ${this.config.maxRetries} attempts`;
      ErrorLogger.logConnection(error as Error, true);
      throw new ConnectionError(message, true, this.config.maxRetries);
    }
  }

  /**
   * Test database connection
   */
  private async testConnection(): Promise<void> {
    try {
      const db = await MongoConnectionManager.getInstance().connect();
      await db.command({ ping: 1 });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Start health check interval
   */
  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.testConnection();
        if (!this.isConnected) {
          console.log('[ConnectionManager] Connection restored');
          this.isConnected = true;
        }
      } catch (error) {
        this.isConnected = false;
        console.error('[ConnectionManager] Health check failed:', error instanceof Error ? error.message : 'Unknown error');
      }
    }, this.config.healthCheckIntervalMs);
  }

  /**
   * Get Prisma client
   */
  getPrisma(): typeof mongoPrisma {
    if (!this.isConnected) {
      throw new ConnectionError(
        'Database connection is not active',
        false
      );
    }
    return mongoPrisma;
  }

  /**
   * Check if connected
   */
  isHealthy(): boolean {
    return this.isConnected;
  }

  /**
   * Get connection status
   */
  getStatus(): {
    connected: boolean;
    timestamp: string;
    uptime?: number;
  } {
    return {
      connected: this.isConnected,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Disconnect gracefully
   */
  async disconnect(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    try {
      await MongoConnectionManager.getInstance().disconnect();
      this.isConnected = false;
      console.log('[ConnectionManager] Database connection closed');
    } catch (error) {
      ErrorLogger.log(error as Error, { context: 'disconnect' });
      throw error;
    }
  }

  /**
   * Execute with connection check
   */
  async execute<T>(
    operation: (prisma: typeof mongoPrisma) => Promise<T>
  ): Promise<T> {
    if (!this.isConnected) {
      throw new ConnectionError('Database connection not available', true);
    }

    try {
      return await operation(mongoPrisma);
    } catch (error) {
      this.isConnected = false;
      throw error;
    }
  }
}

/**
 * Connection Health Check Middleware
 */
export const connectionHealthMiddleware = (req: any, res: any, next: any) => {
  const connectionManager = ConnectionManager.getInstance();

  if (!connectionManager.isHealthy()) {
    return res.status(503).json({
      success: false,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database connection unavailable',
      timestamp: new Date().toISOString(),
    });
  }

  res.locals.connectionManager = connectionManager;
  next();
};

/**
 * Get shared Prisma instance
 */
export const getPrisma = (): typeof mongoPrisma => {
  return ConnectionManager.getInstance().getPrisma();
};
