const dotenv = require("dotenv");
const path = require("path");

// Load .env file
dotenv.config({ path: path.join(__dirname, "../../.env") });

module.exports = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT || "3000", 10),
  MONGODB_URI: process.env.MONGODB_URI || "",
  MONGODB_DATABASE: process.env.MONGODB_DATABASE || process.env.DB_NAME || "beemadiary",
  MONGODB_HOST: process.env.MONGODB_HOST || "localhost",
  MONGODB_PORT: process.env.MONGODB_PORT || "27017",
  MONGODB_USERNAME: process.env.MONGODB_USERNAME || process.env.DB_USER || "",
  MONGODB_PASSWORD: process.env.MONGODB_PASSWORD || process.env.DB_PASSWORD || "",
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
        "http://localhost:5173",
        "http://localhost:5174"
      ],
};
