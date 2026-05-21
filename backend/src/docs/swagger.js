const swaggerJSDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const env = require("../config/env");
const logger = require("../utils/logger");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "LIC BeemaDiary API Documentation",
      version: "1.0.0",
      description: "Enterprise-grade production-level backend for LIC BeemaDiary, built using Express, Prisma, and PostgreSQL.",
    },
    servers: [
      {
        url: `http://localhost:${env.PORT || 3000}`,
        description: "Development Server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter JWT token in the format: Bearer <token>",
        },
      },
      schemas: {
        AdminLoginRequest: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: {
              type: "string",
              format: "email",
              example: "admin@beemadiary.com",
              description: "Registered admin email address",
            },
            password: {
              type: "string",
              example: "admin123",
              description: "Admin password",
            },
          },
        },
        AdminLoginSuccessResponse: {
          type: "object",
          properties: {
            status: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Login successful",
            },
            token: {
              type: "string",
              example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjFhMmIzYyIsImVtYWlsIjoiYWRtaW5AYmVlbWFkaWFyeS5jb20iLCJyb2xlIjoiU1VQRVJfQURNSU4iLCJ0eXBlIjoiQURNSU4ifQ...",
            },
            data: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  format: "uuid",
                  example: "44be25ef-b1fa-4009-8438-fb8d97686d0a",
                },
                email: {
                  type: "string",
                  example: "admin@beemadiary.com",
                },
              },
            },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            status: {
              type: "boolean",
              example: false,
            },
            message: {
              type: "string",
              example: "Invalid credentials",
            },
            errors: {
              type: "array",
              items: {
                type: "string",
              },
              example: ["Password is required and cannot be empty"],
            },
          },
        },
      },
    },
  },
  // Point to the route files to extract JSDoc comments
  apis: ["./src/routes/*.js"],
};

const swaggerSpec = swaggerJSDoc(options);

const setupSwagger = (app) => {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  logger.info(`Swagger API Documentation is available at http://localhost:${env.PORT || 3000}/api-docs`);
};

module.exports = {
  swaggerSpec,
  setupSwagger,
};
