import 'dotenv/config';
import app from './app';
import prisma from './config/database';

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║  Dashboard Overview API Server        ║
║  Environment: ${process.env.NODE_ENV || 'development'}
║  Server: http://${HOST}:${PORT}          ║
║  Health: http://${HOST}:${PORT}/health   ║
║  Docs: http://${HOST}:${PORT}/api/docs   ║
╚════════════════════════════════════════╝
  `);
});

// Handle graceful shutdown
const gracefulShutdown = async () => {
  console.log('Gracefully shutting down...');

  server.close(() => {
    console.log('HTTP server closed');
  });

  await prisma.$disconnect();
  console.log('Database disconnected');

  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
