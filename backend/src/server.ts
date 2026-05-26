import 'dotenv/config';
import app from './app';
import { MongoConnectionManager } from './config/mongoClient';

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

let server: ReturnType<typeof app.listen> | null = null;

async function bootstrap() {
  // Eagerly connect to MongoDB so a misconfigured URI fails at boot, not on the first request.
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

bootstrap();

const gracefulShutdown = async () => {
  console.log('Gracefully shutting down...');
  if (server) {
    server.close(() => {
      console.log('HTTP server closed');
    });
  }
  await MongoConnectionManager.getInstance().disconnect();
  console.log('Database disconnected');
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
