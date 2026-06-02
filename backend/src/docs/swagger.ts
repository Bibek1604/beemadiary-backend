const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Dashboard Overview API',
      version: '1.0.0',
      description: 'Advanced Analytics Dashboard API with Role-Based Access Control',
      contact: {
        name: 'API Support',
        email: 'support@example.com',
      },
      license: {
        name: 'MIT',
      },
    },
    servers: [
      {
        url: process.env.NODE_ENV === 'production' ? 'https://api.beemadiary.com' : `http://localhost:${process.env.PORT || 3001}`,
        description: process.env.NODE_ENV === 'production' ? 'Production Server' : 'Development Server',
      },
      {
        url: 'https://api.beemadiary.com',
        description: 'Production Server',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT Bearer token for authentication',
        },
      },
      schemas: {
        DashboardSummary: {
          type: 'object',
          properties: {
            total_members: {
              type: 'integer',
              example: 150,
              description: 'Total number of members',
            },
            active_members: {
              type: 'integer',
              example: 120,
              description: 'Number of active members',
            },
            inactive_members: {
              type: 'integer',
              example: 30,
              description: 'Number of inactive members',
            },
            lapsed_policies: {
              type: 'integer',
              example: 5,
              description: 'Number of lapsed policies',
            },
            overdue_premiums: {
              type: 'integer',
              example: 12,
              description: 'Number of overdue premium payments',
            },
            unread_alerts: {
              type: 'integer',
              example: 3,
              description: 'Number of unread alerts',
            },
          },
          required: [
            'total_members',
            'active_members',
            'inactive_members',
            'lapsed_policies',
            'overdue_premiums',
            'unread_alerts',
          ],
        },
        BirthdayData: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              example: 1,
            },
            first_name: {
              type: 'string',
              example: 'Bibek',
            },
            last_name: {
              type: 'string',
              example: 'Pandey',
            },
            dob: {
              type: 'string',
              format: 'date',
              example: '2000-05-13',
            },
            contact_number: {
              type: 'string',
              example: '9800000000',
            },
          },
        },
        BirthdayResponse: {
          type: 'object',
          properties: {
            today: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/BirthdayData',
              },
              example: [],
            },
            this_month: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/BirthdayData',
              },
              example: [
                {
                  id: 1,
                  first_name: 'Bibek',
                  last_name: 'Pandey',
                  dob: '2000-05-13',
                  contact_number: '9800000000',
                },
              ],
            },
            this_month_count: {
              type: 'integer',
              example: 3,
            },
          },
        },
        OverduePremium: {
          type: 'object',
          properties: {
            client_name: {
              type: 'string',
              example: 'Ram Bahadur',
            },
            policy_number: {
              type: 'string',
              example: 'POL123',
            },
            premium_amount: {
              type: 'number',
              example: 5000,
            },
            premium_due_date: {
              type: 'string',
              format: 'date',
              example: '2026-05-10',
            },
            days_overdue: {
              type: 'integer',
              example: 12,
            },
            contact_number: {
              type: 'string',
              example: '9800000000',
            },
            policy_status: {
              type: 'string',
              enum: ['ACTIVE', 'INACTIVE', 'LAPSED', 'MATURED', 'SURRENDERED'],
              example: 'ACTIVE',
            },
          },
        },
        TargetData: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              example: 1,
            },
            target_type: {
              type: 'string',
              enum: ['NEW_POLICIES', 'PREMIUM_COLLECTION', 'CLIENT_ACQUISITION', 'POLICY_RENEWAL'],
              example: 'NEW_POLICIES',
            },
            target_value: {
              type: 'number',
              example: 50,
            },
            current_value: {
              type: 'number',
              example: 35,
            },
            progress_percentage: {
              type: 'number',
              example: 70.0,
            },
            target_month: {
              type: 'string',
              format: 'date',
              example: '2026-05-01',
            },
          },
        },
        GenderBreakdown: {
          type: 'object',
          properties: {
            MALE: {
              type: 'integer',
              example: 3,
            },
            FEMALE: {
              type: 'integer',
              example: 1,
            },
            CHILD: {
              type: 'integer',
              example: 0,
            },
            OTHER: {
              type: 'integer',
              example: 0,
            },
          },
        },
        WhyBoughtBreakdown: {
          type: 'object',
          properties: {
            why_bought: {
              type: 'string',
              example: 'PROTECTION',
            },
            count: {
              type: 'integer',
              example: 5,
            },
          },
        },
        Visualizations: {
          type: 'object',
          properties: {
            gender_breakdown: {
              $ref: '#/components/schemas/GenderBreakdown',
            },
            why_bought_breakdown: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/WhyBoughtBreakdown',
              },
            },
          },
        },
        DashboardOverviewData: {
          type: 'object',
          properties: {
            summary: {
              $ref: '#/components/schemas/DashboardSummary',
            },
            birthdays: {
              $ref: '#/components/schemas/BirthdayResponse',
            },
            recent_alerts: {
              type: 'array',
              items: {
                type: 'object',
              },
            },
            recent_notifications: {
              type: 'array',
              items: {
                type: 'object',
              },
            },
            achievements: {
              type: 'array',
              items: {
                type: 'object',
              },
            },
            payments_due: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/OverduePremium',
              },
            },
            targets: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/TargetData',
              },
            },
            visualizations: {
              $ref: '#/components/schemas/Visualizations',
            },
          },
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            status: {
              type: 'boolean',
              example: true,
            },
            message: {
              type: 'string',
              example: 'Dashboard overview fetched successfully',
            },
            data: {
              $ref: '#/components/schemas/DashboardOverviewData',
            },
            code: {
              type: 'integer',
              example: 200,
            },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            status: {
              type: 'boolean',
              example: false,
            },
            message: {
              type: 'string',
              example: 'Validation failed',
            },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: {
                    type: 'string',
                  },
                  message: {
                    type: 'string',
                  },
                },
              },
            },
            code: {
              type: 'integer',
              example: 400,
            },
          },
        },
        UnauthorizedError: {
          type: 'object',
          properties: {
            status: {
              type: 'boolean',
              example: false,
            },
            message: {
              type: 'string',
              example: 'No token provided',
            },
            code: {
              type: 'integer',
              example: 401,
            },
          },
        },
        ForbiddenError: {
          type: 'object',
          properties: {
            status: {
              type: 'boolean',
              example: false,
            },
            message: {
              type: 'string',
              example: 'Insufficient permissions',
            },
            code: {
              type: 'integer',
              example: 403,
            },
          },
        },
        NotFoundError: {
          type: 'object',
          properties: {
            status: {
              type: 'boolean',
              example: false,
            },
            message: {
              type: 'string',
              example: 'Resource not found',
            },
            code: {
              type: 'integer',
              example: 404,
            },
          },
        },
        RegisterRequest: {
          type: 'object',
          properties: {
            email: {
              type: 'string',
              example: 'user@example.com',
            },
            password: {
              type: 'string',
              example: 'SecurePass123!',
              description: 'Minimum 12 characters with uppercase, lowercase, number, and special char',
            },
            first_name: {
              type: 'string',
              example: 'John',
            },
            last_name: {
              type: 'string',
              example: 'Doe',
            },
          },
          required: ['email', 'password', 'first_name', 'last_name'],
        },
        LoginRequest: {
          type: 'object',
          properties: {
            email: {
              type: 'string',
              example: 'user@example.com',
            },
            password: {
              type: 'string',
              example: 'SecurePass123!',
            },
          },
          required: ['email', 'password'],
        },
        LoginResponse: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                id: {
                  type: 'integer',
                },
                email: {
                  type: 'string',
                },
                firstName: {
                  type: 'string',
                },
                lastName: {
                  type: 'string',
                },
                role: {
                  type: 'string',
                  enum: ['ADMIN', 'AGENT', 'USER'],
                },
              },
            },
            tokens: {
              type: 'object',
              properties: {
                accessToken: {
                  type: 'string',
                },
                refreshToken: {
                  type: 'string',
                },
              },
            },
            session: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                },
                expiresAt: {
                  type: 'string',
                  format: 'date-time',
                },
              },
            },
          },
        },
        Session: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
            },
            deviceName: {
              type: 'string',
            },
            ipAddress: {
              type: 'string',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            lastActivity: {
              type: 'string',
              format: 'date-time',
            },
            isActive: {
              type: 'boolean',
            },
          },
        },
      },
    },
    paths: {
      '/api/user-panel/dashboard-overview': {
        get: {
          summary: 'Get Dashboard Overview',
          description:
            'Fetch comprehensive dashboard analytics including summary statistics, birthdays, overdue premiums, targets, and visualizations. Agents see only their own data, Admins see all data.',
          tags: ['Dashboard'],
          security: [
            {
              BearerAuth: [],
            },
          ],
          responses: {
            200: {
              description: 'Dashboard overview successfully fetched',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/SuccessResponse',
                  },
                  example: {
                    status: true,
                    message: 'Dashboard overview fetched successfully',
                    data: {
                      summary: {
                        total_members: 150,
                        active_members: 120,
                        inactive_members: 30,
                        lapsed_policies: 5,
                        overdue_premiums: 12,
                        unread_alerts: 3,
                      },
                      birthdays: {
                        today: [],
                        this_month: [
                          {
                            id: 1,
                            first_name: 'Bibek',
                            last_name: 'Pandey',
                            dob: '2000-05-13',
                            contact_number: '9800000000',
                          },
                        ],
                        this_month_count: 3,
                      },
                      recent_alerts: [],
                      recent_notifications: [],
                      achievements: [],
                      payments_due: [
                        {
                          client_name: 'Ram Bahadur',
                          policy_number: 'POL123',
                          premium_amount: 5000,
                          premium_due_date: '2026-05-10',
                          days_overdue: 12,
                          contact_number: '9800000000',
                          policy_status: 'ACTIVE',
                        },
                      ],
                      targets: [
                        {
                          id: 1,
                          target_type: 'NEW_POLICIES',
                          target_value: 50,
                          current_value: 35,
                          progress_percentage: 70.0,
                          target_month: '2026-05-01',
                        },
                      ],
                      visualizations: {
                        gender_breakdown: {
                          MALE: 3,
                          FEMALE: 1,
                          CHILD: 0,
                          OTHER: 0,
                        },
                        why_bought_breakdown: [
                          {
                            why_bought: 'PROTECTION',
                            count: 5,
                          },
                        ],
                      },
                    },
                    code: 200,
                  },
                },
              },
            },
            400: {
              description: 'Bad Request - Validation Error',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
            401: {
              description: 'Unauthorized - Invalid or missing token',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/UnauthorizedError',
                  },
                },
              },
            },
            403: {
              description: 'Forbidden - Insufficient permissions',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ForbiddenError',
                  },
                },
              },
            },
            404: {
              description: 'Not Found - Resource not found',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/NotFoundError',
                  },
                },
              },
            },
            500: {
              description: 'Internal Server Error',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: {
                        type: 'boolean',
                        example: false,
                      },
                      message: {
                        type: 'string',
                        example: 'Internal server error',
                      },
                      code: {
                        type: 'integer',
                        example: 500,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/auth/register': {
        post: {
          summary: 'Register new user',
          description: 'Create a new user account with email and password',
          tags: ['Authentication'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/RegisterRequest',
                },
              },
            },
          },
          responses: {
            201: {
              description: 'User registered successfully',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/SuccessResponse',
                  },
                },
              },
            },
            400: {
              description: 'Validation error or user already exists',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
          },
        },
      },
      '/api/auth/login': {
        post: {
          summary: 'Login user',
          description: 'Authenticate user with email and password. Sets secure httpOnly cookies for tokens.',
          tags: ['Authentication'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/LoginRequest',
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Login successful',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: {
                        type: 'boolean',
                      },
                      message: {
                        type: 'string',
                      },
                      data: {
                        $ref: '#/components/schemas/LoginResponse',
                      },
                    },
                  },
                },
              },
            },
            401: {
              description: 'Invalid credentials or account locked',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/UnauthorizedError',
                  },
                },
              },
            },
          },
        },
      },
      '/api/auth/logout': {
        post: {
          summary: 'Logout user',
          description: 'Terminate current session and logout user',
          tags: ['Authentication'],
          security: [
            {
              BearerAuth: [],
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    session_id: {
                      type: 'string',
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Logout successful',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/SuccessResponse',
                  },
                },
              },
            },
            401: {
              description: 'Unauthorized',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/UnauthorizedError',
                  },
                },
              },
            },
          },
        },
      },
      '/api/auth/refresh': {
        post: {
          summary: 'Refresh access token',
          description: 'Generate new access token using refresh token. Implements token rotation.',
          tags: ['Authentication'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    refreshToken: {
                      type: 'string',
                    },
                  },
                  required: ['refreshToken'],
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Token refreshed successfully',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/SuccessResponse',
                  },
                },
              },
            },
            401: {
              description: 'Invalid or expired refresh token',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/UnauthorizedError',
                  },
                },
              },
            },
          },
        },
      },
      '/api/auth/sessions': {
        get: {
          summary: 'Get active sessions',
          description: 'Retrieve all active sessions for the authenticated user',
          tags: ['Authentication'],
          security: [
            {
              BearerAuth: [],
            },
          ],
          responses: {
            200: {
              description: 'Sessions retrieved successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: {
                        type: 'boolean',
                      },
                      message: {
                        type: 'string',
                      },
                      data: {
                        type: 'object',
                        properties: {
                          sessions: {
                            type: 'array',
                            items: {
                              $ref: '#/components/schemas/Session',
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            401: {
              description: 'Unauthorized',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/UnauthorizedError',
                  },
                },
              },
            },
          },
        },
      },
      '/api/auth/sessions/{sessionId}': {
        delete: {
          summary: 'Terminate session',
          description: 'End a specific session by ID',
          tags: ['Authentication'],
          security: [
            {
              BearerAuth: [],
            },
          ],
          parameters: [
            {
              name: 'sessionId',
              in: 'path',
              required: true,
              schema: {
                type: 'string',
              },
            },
          ],
          responses: {
            200: {
              description: 'Session terminated successfully',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/SuccessResponse',
                  },
                },
              },
            },
            401: {
              description: 'Unauthorized',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/UnauthorizedError',
                  },
                },
              },
            },
            404: {
              description: 'Session not found',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/NotFoundError',
                  },
                },
              },
            },
          },
        },
      },
      '/api/auth/logout-all': {
        post: {
          summary: 'Logout from all devices',
          description: 'Terminate all sessions and logout from all devices',
          tags: ['Authentication'],
          security: [
            {
              BearerAuth: [],
            },
          ],
          responses: {
            200: {
              description: 'Logged out from all devices',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/SuccessResponse',
                  },
                },
              },
            },
            401: {
              description: 'Unauthorized',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/UnauthorizedError',
                  },
                },
              },
            },
          },
        },
      },
      '/api/auth/change-password': {
        post: {
          summary: 'Change password',
          description: 'Change user password. Requires current password for verification.',
          tags: ['Authentication'],
          security: [
            {
              BearerAuth: [],
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    current_password: {
                      type: 'string',
                    },
                    new_password: {
                      type: 'string',
                    },
                  },
                  required: ['current_password', 'new_password'],
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Password changed successfully',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/SuccessResponse',
                  },
                },
              },
            },
            401: {
              description: 'Invalid current password or unauthorized',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/UnauthorizedError',
                  },
                },
              },
            },
          },
        },
      },
      '/api/auth/forgot-password': {
        post: {
          summary: 'Request password reset',
          description: 'Send password reset link to user email',
          tags: ['Authentication'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    email: {
                      type: 'string',
                    },
                  },
                  required: ['email'],
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Password reset email sent',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/SuccessResponse',
                  },
                },
              },
            },
          },
        },
      },
    },
    tags: [
      {
        name: 'Dashboard',
        description: 'Dashboard overview and analytics endpoints',
      },
      {
        name: 'Authentication',
        description: 'User authentication and session management endpoints',
      },
    ],
  },
  apis: ["src/routes/**/*.ts", "src/routes/**/*.js"],
};

export default swaggerOptions;
