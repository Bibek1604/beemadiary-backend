const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../../.env") });

const isProduction = process.env.NODE_ENV === 'production';

const alwaysRequired = ['JWT_SECRET', 'JWT_ADMIN_SECRET'];
for (const key of alwaysRequired) {
  if (!process.env[key]) {
    throw new Error(`${key} is required. Generate with: openssl rand -hex 64`);
  }
}

if (isProduction) {
  const prodRequired = ['JWT_SECRET', 'JWT_ADMIN_SECRET', 'JWT_REFRESH_SECRET', 'JWT_ADMIN_REFRESH_SECRET', 'MONGODB_URI', 'MONGODB_HOST', 'CORS_ALLOWED_ORIGINS', 'CLOUDINARY_CLOUD_NAME'];
  for (const key of prodRequired) {
    if (!process.env[key]) throw new Error(`CRITICAL: "${key}" is required in production`);
  }
}

const getProductionOrigins = () => {
  const raw = process.env.CORS_ORIGIN || process.env.CORS_ALLOWED_ORIGINS || '';
  const origins = raw.split(',').map((o) => o.trim()).filter(Boolean);
  if (isProduction) {
    if (origins.length === 0) throw new Error('CORS_ALLOWED_ORIGINS is required in production');
    const httpOrigins = origins.filter((o) => o.startsWith('http://'));
    if (httpOrigins.length > 0) throw new Error(`CORS_ALLOWED_ORIGINS contains plain HTTP origins not allowed in production: ${httpOrigins.join(', ')}`);
    return origins;
  }
  if (origins.length === 0) return ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'];
  return origins;
};

const getApiBaseUrl = () => {
  if (process.env.API_BASE_URL) return process.env.API_BASE_URL.replace(/\/$/, '');
  if (isProduction) return '';
  return `http://localhost:${process.env.PORT || 3001}`;
};

module.exports = {
  NODE_ENV: isProduction ? 'production' : (process.env.NODE_ENV || 'development'),
  PORT: parseInt(process.env.PORT || '3001', 10),
  IS_PRODUCTION: isProduction,
  MONGODB_URI: process.env.MONGODB_URI || '',
  MONGODB_DATABASE: process.env.MONGODB_DATABASE || process.env.DB_NAME || 'beemadiary',
  MONGODB_HOST: process.env.MONGODB_HOST || 'localhost',
  MONGODB_PORT: process.env.MONGODB_PORT || '27017',
  MONGODB_USERNAME: process.env.MONGODB_USERNAME || process.env.DB_USER || '',
  MONGODB_PASSWORD: process.env.MONGODB_PASSWORD || process.env.DB_PASSWORD || '',
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || (process.env.JWT_SECRET + '_refresh'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  JWT_ADMIN_SECRET: process.env.JWT_ADMIN_SECRET,
  JWT_ADMIN_REFRESH_SECRET: process.env.JWT_ADMIN_REFRESH_SECRET || (process.env.JWT_ADMIN_SECRET + '_refresh'),
  JWT_ADMIN_EXPIRES_IN: process.env.JWT_ADMIN_EXPIRES_IN || '15m',
  JWT_ADMIN_REFRESH_EXPIRES_IN: process.env.JWT_ADMIN_REFRESH_EXPIRES_IN || '7d',
  USE_CLOUDINARY: process.env.USE_CLOUDINARY === 'True' || process.env.USE_CLOUDINARY === 'true',
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || '',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
  CORS_ALLOWED_ORIGINS: getProductionOrigins(),
  API_BASE_URL: getApiBaseUrl(),
};
