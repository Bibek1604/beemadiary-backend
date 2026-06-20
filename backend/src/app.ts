import express, { Express, Request, Response, NextFunction } from 'express';
import 'dotenv/config';
import { v4 as uuidv4 } from 'uuid';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import {
  securityHeaders,
  corsConfig,
  xssProtection,
  preventParamPollution,
  apiSecurityHeaders,
  requestLogger,
} from './middleware/security';
import { sanitizeRequest } from './middleware/validation';
import { boundaryGuard } from './middleware/boundaryGuard';
import { notFoundHandler } from './middleware/errorHandler';
import imageHandler from './utils/imageHandler';
import dashboardRoutes from './routes/dashboard.routes';
import authRoutes from './routes/auth.routes';
import uploadRoutes from './routes/upload.routes';
import imagesRoutes from './routes/images.routes';
import adminRoutes from './routes/admin.routes';
import notesRoutes from './routes/notes.routes';
import calendarRoutes from './routes/calendar.routes';
import targetsRoutes from './routes/targets.routes';
import clientEnrollmentRoutes from './routes/clientEnrollment.routes';
import clientDocumentsRoutes from './routes/clientDocuments.routes';
import policyRoutes from './routes/policy.routes';
import policyBankDetailsRoutes from './routes/policyBankDetails.routes';
import agentProfileRoutes from './routes/agentProfile.routes';
import analyticsRoutes from './routes/analytics.routes';
// dashboard-agent.routes.js — legacy agent dashboard (/api/dashboard-overview/)
// Renamed from dashboard.routes.js to avoid naming collision with dashboard.routes.ts,
// which TypeScript compiles to the same dist/routes/dashboard.routes.js filename.
const dashboardLegacyRoutes = require('./routes/dashboard-agent.routes.js');
// dashboard.consolidated.routes.js — single consolidated dashboard API
// (/api/dashboard and /api/dashboard/:agentId) used by the agent dashboard UI.
const dashboardConsolidatedRoutes = require('./routes/dashboard.consolidated.routes.js');
import agentNotificationRoutes from './routes/agentNotification.routes';
import swaggerOptions from './docs/swagger-complete';
import { globalErrorHandler } from './middleware/errors/global-error-handler';
const logger = require('./utils/logger');

// JS (CommonJS) routes that work with the actual admin/agent DB tables
const jsAuthRoutesModule = require('./routes/auth.routes.js');
const adminCompatRoutesModule = require('./routes/admin.compat.routes.js');
const jsAuthRoutes = jsAuthRoutesModule.default || jsAuthRoutesModule;
const adminCompatRoutes = adminCompatRoutesModule.default || adminCompatRoutesModule;

const app: Express = express();

// Initialize upload directories
imageHandler.ensureUploadDirs();

// Middleware - Request ID (MUST BE FIRST)
app.use((req: any, res: Response, next: NextFunction) => {
  req.id = uuidv4();
  res.locals.requestId = req.id;
  next();
});

// Middleware - Security & Body Parsing
app.use(securityHeaders);
app.use(corsConfig);
// Allow cross-origin loading of images and other resources
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve uploaded files statically
app.use('/api/uploads', express.static(imageHandler.LOCAL_STORAGE_PATH));

// Middleware - Logging & Security
// NOTE: rate limiting is intentionally disabled (per requirements).
app.use(requestLogger);
app.use(apiSecurityHeaders);
app.use(xssProtection);
app.use(preventParamPollution);
app.use(sanitizeRequest);
// BVA guard (GLOBAL-003): reject oversized name/title fields before they reach the DB.
app.use(boundaryGuard);

// Swagger API Documentation
const swaggerSpec = swaggerJsdoc(swaggerOptions);

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));
logger.info('Swagger API Documentation available at /api-docs');

// Health Check Route
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  });
});

// API Routes - JS auth routes first (admin/agent login that works with actual DB tables)
app.use('/api', jsAuthRoutes);
app.use('/api/admin', adminCompatRoutes);
// COMMENTED OUT: Duplicate TypeScript routes - use JavaScript versions instead (jsAuthRoutes)
// app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/images', imagesRoutes);
app.use('/api/user-panel', dashboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', notesRoutes);
app.use('/api', targetsRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api', clientEnrollmentRoutes);
app.use('/api', clientDocumentsRoutes);
app.use('/api', policyBankDetailsRoutes);
app.use('/api', policyRoutes);
app.use('/api', agentProfileRoutes);          // /api/agent/profile, /api/agent/profile/upload-image, ...
app.use('/api', analyticsRoutes);             // /api/analytics/monthly-graph/, ...
app.use('/api', dashboardLegacyRoutes);       // /api/dashboard-overview/
app.use('/api', dashboardConsolidatedRoutes); // /api/dashboard, /api/dashboard/:agentId (consolidated)
app.use('/api', agentNotificationRoutes);     // /api/agent/notifications, /api/agent/notifications/:id/read, ...

// 404 Handler - Must be after all routes
app.use('*', notFoundHandler);

// Global Error Handler - MUST BE ABSOLUTELY LAST.
// Catches ALL errors (async/sync/thrown/uncaught from handlers) and returns
// human-friendly responses without leaking stack traces in production.
app.use(globalErrorHandler);

export default app;