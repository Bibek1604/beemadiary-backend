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
import { ResponseHandler } from './utils/errorResponse';
import dashboardRoutes from './routes/dashboard.routes';
import swaggerOptions from './docs/swagger-complete';

const app: Express = express();

// Middleware - Security & Body Parsing
app.use(securityHeaders);
app.use(corsConfig);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Middleware - Logging & Security
app.use(requestLogger);
app.use(apiSecurityHeaders);
app.use(rateLimiter);
app.use(xssProtection);
app.use(preventParamPollution);
app.use(sanitizeRequest);

// Swagger UI
const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health Check Route
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/user-panel', dashboardRoutes);

// 404 Handler - Must be after all routes
app.use('*', notFoundHandler);

// Error Handler - Must be last
app.use(errorHandler);

export default app;
