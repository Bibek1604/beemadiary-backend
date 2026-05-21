const app = require("./src/app");
const env = require("./src/config/env");
const logger = require("./src/utils/logger");

const PORT = env.PORT || 3000;

const server = app.listen(PORT, () => {
  logger.info(`Server successfully started on port ${PORT} in ${env.NODE_ENV} mode`);
});

// Handle uncaught exceptions gracefully
process.on("uncaughtException", (err) => {
  logger.error("CRITICAL: UNCAUGHT EXCEPTION! Shutting down process...", err);
  process.exit(1);
});

// Handle unhandled promise rejections gracefully
process.on("unhandledRejection", (reason, promise) => {
  logger.error("CRITICAL: UNHANDLED REJECTION! Gracefully stopping server...", reason);
  server.close(() => {
    process.exit(1);
  });
});