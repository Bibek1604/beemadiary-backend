import express, { Express, Request, Response } from 'express';
import 'dotenv/config';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import {
  securityHeaders,
  corsConfig,
  rateLimiter,
  xssProtection,
  preventParamPollution,
  apiSecurityHeaders,
  requestLogger,
} from './middleware/security';
import { sanitizeRequest } from './middleware/validation';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { setCSRFToken, csrfProtection } from './middleware/csrf';
import { globalExceptionHandler } from './middleware/globalExceptionHandler';
import imageHandler from './utils/imageHandler';
import dashboardRoutes from './routes/dashboard.routes';
import authRoutes from './routes/auth.routes';
import uploadRoutes from './routes/upload.routes';
import adminRoutes from './routes/admin.routes';
import notesRoutes from './routes/notes.routes';
import calendarRoutes from './routes/calendar.routes';
import targetsRoutes from './routes/targets.routes';
import swaggerOptions from './docs/swagger-complete';

const app: Express = express();

// Initialize upload directories
imageHandler.ensureUploadDirs();

// Middleware - Security & Body Parsing
app.use(securityHeaders);
app.use(corsConfig);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve uploaded files statically
app.use('/api/uploads', express.static(imageHandler.LOCAL_STORAGE_PATH));

// Middleware - Logging & Security
app.use(requestLogger);
app.use(apiSecurityHeaders);
app.use(rateLimiter);
app.use(xssProtection);
app.use(preventParamPollution);
app.use(sanitizeRequest);

// Swagger API Documentation
const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));

// Health Check Route
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  });
});

// CSRF Token Route - for initial token retrieval
app.get('/api/csrf-token', setCSRFToken, (req: Request, res: Response) => {
  res.status(200).json({
    message: 'CSRF token generated',
    csrfToken: req.cookies['csrf-token'],
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/user-panel', csrfProtection, dashboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', notesRoutes);
app.use('/api', targetsRoutes);
app.use('/api/calendar', calendarRoutes);

// 404 Handler - Must be after all routes
app.use('*', notFoundHandler);

// Legacy Error Handler (fallback)
app.use(errorHandler);

// Global Exception Handler - Must be last
// Catches all unhandled errors and ensures proper formatting
app.use(globalExceptionHandler);

export default app;
