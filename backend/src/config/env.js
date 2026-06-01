const dotenv = require("dotenv");
const path = require("path");

// Load .env file
dotenv.config({ path: path.join(__dirname, "../../.env") });

const isProduction = process.env.NODE_ENV === 'production';

// ---------------------------------------------------------------------------
// Hard requirements — crash immediately if missing (both envs)
// ---------------------------------------------------------------------------
const alwaysRequired = ['JWT_SECRET', 'JWT_ADMIN_SECRET'];
for (const key of alwaysRequired) {
  if (!process.env[key]) {
    throw new Error(`${key} is required. Generate with: openssl rand -hex 64`);
  }
}

// ---------------------------------------------------------------------------
// Production-only requirements — crash if any are missing in prod
// ---------------------------------------------------------------------------
if (isProduction) {
  const prodRequired = [
    'JWT_SECRET',
    'JWT_ADMIN_SECRET',
    'JWT_REFRESH_SECRET',
    'JWT_ADMIN_REFRESH_SECRET',
    'MONGODB_URI',
    'MONGODB_HOST',
    'CORS_ALLOWED_ORIGINS',
    'CLOUDINARY_CLOUD_NAME',
  ];

  for (const key of prodRequired) {
    if (!process.env[key]) {
      throw new Error(`CRITICAL: "${key}" is required in production`);
    }
  }
}

// ---------------------------------------------------------------------------
// CORS origins
// In development: allow localhost on both HTTP and HTTPS.
// In production:  all origins MUST use HTTPS — any http:// origin is rejected
//                 at startup to prevent accidental mixed-content issues.
// ---------------------------------------------------------------------------
const getProductionOrigins = () => {
  const raw = process.env.CORS_ORIGIN || process.env.CORS_ALLOWED_ORIGINS || '';
  const origins = raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (isProduction) {
    if (origins.length === 0) {
      throw new Error('CORS_ALLOWED_ORIGINS is required in production');
    }
    // Enforce HTTPS-only in production — HTTP origins are a security risk
    const httpOrigins = origins.filter((o) => o.startsWith('http://'));
    if (httpOrigins.length > 0) {
      throw new Error(
        `CORS_ALLOWED_ORIGINS contains plain HTTP origins which are not allowed in production: ${httpOrigins.join(', ')}\n` +
        `Use HTTPS for all origins, e.g. https://yourdomain.com`
      );
    }
    return origins;
  }

  // Development fallback
  if (origins.length === 0) {
    return [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
    ];
  }

  return origins;
};

// ---------------------------------------------------------------------------
// Backend API URL — used in CSP connectSrc so the frontend can reach the API
// ---------------------------------------------------------------------------
const getApiBaseUrl = () => {
  if (process.env.API_BASE_URL) return process.env.API_BASE_URL.replace(/\/$/, '');
  if (isProduction) return ''; // Must be set via API_BASE_URL in production
  return `http://localhost:${process.env.PORT || 3001}`;
};

module.exports = {
  NODE_ENV: isProduction ? 'production' : (process.env.NODE_ENV || 'development'),
  PORT:     parseInt(process.env.PORT || '3001', 10),
  IS_PRODUCTION: isProduction,

  // MongoDB
  MONGODB_URI:      process.env.MONGODB_URI      || '',
  MONGODB_DATABASE: process.env.MONGODB_DATABASE || process.env.DB_NAME || 'beemadiary',
  MONGODB_HOST:     process.env.MONGODB_HOST     || 'localhost',
  MONGODB_PORT:     process.env.MONGODB_PORT     || '27017',
  MONGODB_USERNAME: process.env.MONGODB_USERNAME || process.env.DB_USER      || '',
  MONGODB_PASSWORD: process.env.MONGODB_PASSWORD || process.env.DB_PASSWORD  || '',

  // User / agent JWT
  JWT_SECRET:              process.env.JWT_SECRET,
  JWT_REFRESH_SECRET:      process.env.JWT_REFRESH_SECRET      || (process.env.JWT_SECRET + '_refresh'),
  JWT_EXPIRES_IN:          process.env.JWT_EXPIRES_IN          || '15m',
  JWT_REFRESH_EXPIRES_IN:  process.env.JWT_REFRESH_EXPIRES_IN  || '7d',

  // Admin JWT — separate secrets, never interchangeable with user tokens
  JWT_ADMIN_SECRET:              process.env.JWT_ADMIN_SECRET,
  JWT_ADMIN_REFRESH_SECRET:      process.env.JWT_ADMIN_REFRESH_SECRET      || (process.env.JWT_ADMIN_SECRET + '_refresh'),
  JWT_ADMIN_EXPIRES_IN:          process.env.JWT_ADMIN_EXPIRES_IN          || '15m',
  JWT_ADMIN_REFRESH_EXPIRES_IN:  process.env.JWT_ADMIN_REFRESH_EXPIRES_IN  || '7d',

  // Cloudinary
  USE_CLOUDINARY:        process.env.USE_CLOUDINARY === 'True' || process.env.USE_CLOUDINARY === 'true',
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY:    process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,

  // Admin seed credentials
  ADMIN_EMAIL:    process.env.ADMIN_EMAIL    || '',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',

  // CORS
  CORS_ALLOWED_ORIGINS: getProductionOrigins(),

  // API base URL (used in CSP)
  API_BASE_URL: getApiBaseUrl(),
};
