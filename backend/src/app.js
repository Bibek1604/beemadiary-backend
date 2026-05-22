const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const path = require("path");

const env = require("./config/env");
const { apiLimiter } = require("./middlewares/rateLimit.middleware");
const xssSanitizer = require("./middlewares/xss.middleware");
const errorMiddleware = require("./middlewares/error.middleware");
const { setupSwagger } = require("./docs/swagger");
const routes = require("./routes");
const ApiResponse = require("./utils/apiResponse");

const app = express();

// 1. Security Headers using Helmet
app.use(helmet());

// 2. CORS Handling
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, postman)
    if (!origin) return callback(null, true);
    
    if (env.CORS_ALLOWED_ORIGINS.includes(origin) || env.CORS_ALLOWED_ORIGINS.includes("*")) {
      return callback(null, true);
    }
    
    // Allow localhost origins in development
    if (process.env.NODE_ENV === 'development' && origin?.startsWith('http://localhost')) {
      return callback(null, true);
    }
    
    return callback(null, true); // Allow all origins for development
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};
app.use(cors(corsOptions));

// 3. Rate Limiting for all general API endpoints
app.use(apiLimiter);

// 4. Request Payloads Parsing & Custom XSS Sanitization
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(xssSanitizer);

// 5. Serve Uploads Statically (For local file upload fallback)
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// 6. Mount Swagger OpenAPI Documentation UI
setupSwagger(app);

// 7. Mount Master Router
app.use("/api", routes);

// 8. 404 Route handler for unregistered routes
app.use((req, res, next) => {
  const error = new Error(`The requested route '${req.method} ${req.originalUrl}' does not exist`);
  error.statusCode = 404;
  next(error);
});

// 9. Centralized Error Handling Middleware
app.use(errorMiddleware);

module.exports = app;
