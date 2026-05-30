import 'dotenv/config';
import app from './app';
import { MongoConnectionManager } from './config/mongoClient';
const logger = require('./utils/logger');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

let server: ReturnType<typeof app.listen> | null = null;
let isShuttingDown = false;

async function bootstrap() {
  try {
    const db = await MongoConnectionManager.getInstance().connect();
    logger.info(`✓ MongoDB connected (database: ${db.databaseName})`);
  } catch (error) {
    logger.error('MongoDB connection failed:', error);
    process.exit(1);
  }

  server = app.listen(PORT, () => {
    logger.info('✓ Dashboard Overview API Server Started');
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`Server: http://${HOST}:${PORT}`);
    logger.info(`Health: http://${HOST}:${PORT}/health`);
    logger.info(`Docs:   http://${HOST}:${PORT}/api-docs`);
  });
}

bootstrap().catch((error) => {
  logger.error('Failed to bootstrap server:', error);
  process.exit(1);
});

const gracefulShutdown = async (signal?: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`Gracefully shutting down...${signal ? ` (${signal})` : ''}`);

  if (server) {
    await new Promise<void>((resolve) => {
      server?.close(() => {
        logger.info('✓ HTTP server closed');
        resolve();
      });
    });
  }

  await MongoConnectionManager.getInstance().disconnect();
  logger.info('✓ Database disconnected');
  process.exit(0);
};

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', reason);
  process.exit(1);
});
