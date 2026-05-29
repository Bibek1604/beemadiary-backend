import 'dotenv/config';
import app from './app';
import { MongoConnectionManager } from './config/mongoClient';

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

let server: ReturnType<typeof app.listen> | null = null;
let isShuttingDown = false;

async function bootstrap() {
  try {
    const db = await MongoConnectionManager.getInstance().connect();
    console.log(`MongoDB connected (database: ${db.databaseName})`);
  } catch (error) {
    console.error('MongoDB connection failed:', error);
    process.exit(1);
  }

  server = app.listen(PORT, () => {
    console.log('Dashboard Overview API Server');
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Server: http://${HOST}:${PORT}`);
    console.log(`Health: http://${HOST}:${PORT}/health`);
    console.log(`Docs:   http://${HOST}:${PORT}/api-docs`);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to bootstrap server:', error);
  process.exit(1);
});

const gracefulShutdown = async (signal?: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`Gracefully shutting down...${signal ? ` (${signal})` : ''}`);

  if (server) {
    await new Promise<void>((resolve) => {
      server?.close(() => {
        console.log('HTTP server closed');
        resolve();
      });
    });
  }

  await MongoConnectionManager.getInstance().disconnect();
  console.log('Database disconnected');
  process.exit(0);
};

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
