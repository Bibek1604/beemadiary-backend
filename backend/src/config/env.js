const dotenv = require("dotenv");
const path = require("path");

// Load .env file
dotenv.config({ path: path.join(__dirname, "../../.env") });

module.exports = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT || "3000", 10),
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET || "supersecretjwtkeyforbeemadiarybackend2026!",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "24h",
  USE_CLOUDINARY: process.env.USE_CLOUDINARY === "True" || process.env.USE_CLOUDINARY === "true",
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || "admin@beemadiary.com",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "Admin@Secure123",
  CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS 
    ? process.env.CORS_ALLOWED_ORIGINS.split(",") 
    : [
        "https://beemadiary.com",
        "https://admin.beemadiary.com",
        "http://localhost:3000",
        "http://localhost:5173"
      ],
};
