const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'LIC Dashboard API',
      version: '1.0.0',
      description: 'Complete API documentation for LIC Insurance Management System',
      contact: {
        name: 'API Support',
        email: 'support@lic.com',
      },
    },
    servers: [
      {
        url: process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : 'https://api.beemadiary.com',
        description: process.env.NODE_ENV === 'development' ? 'Development Server' : 'Production Server',
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
        // ============= COMMON SCHEMAS =============
        ApiResponse: {
          type: 'object',
          properties: {
            status: { type: 'boolean' },
            message: { type: 'string' },
            data: { type: 'object' },
            code: { type: 'integer' },
          },
        },
        RegisterRequest: {
          type: 'object',
          required: ['email', 'password', 'first_name', 'last_name'],
          properties: {
            email: { type: 'string', format: 'email', example: 'user@example.com' },
            password: { type: 'string', example: 'ChangeMe123!' },
            first_name: { type: 'string', example: 'John' },
            last_name: { type: 'string', example: 'Doe' },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'admin@beemadiary.com' },
            password: { type: 'string', example: 'Admin@123456' },
          },
        },
        AdminLoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'admin@beemadiary.com' },
            password: { type: 'string', example: 'Admin@123456' },
          },
        },
        AgentLoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'agent@test.com' },
            password: { type: 'string', example: 'Agent@123456' },
          },
        },
        AuthSuccessResponse: {
          type: 'object',
          properties: {
            status: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Login successful' },
            token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIs...' },
            data: {
              oneOf: [
                { $ref: '#/components/schemas/Agent' },
                {
                  type: 'object',
                  properties: {
                    id: { type: 'string', example: 'admin-id-123' },
                    email: { type: 'string', format: 'email', example: 'admin@beemadiary.com' },
                    username: { type: 'string', example: 'admin' },
                  },
                },
              ],
            },
            code: { type: 'integer', example: 200 },
          },
        },
        AuthErrorResponse: {
          type: 'object',
          properties: {
            status: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Invalid credentials' },
            errors: {
              type: 'array',
              items: { type: 'string' },
              example: ['Email or password is incorrect'],
            },
            code: { type: 'integer', example: 400 },
          },
        },
        AdminLoginSuccessResponse: {
          type: 'object',
          properties: {
            status: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Login successful' },
            token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIs...' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string', example: '44be25ef-b1fa-4009-8438-fb8d97686d0a' },
                email: { type: 'string', example: 'admin@beemadiary.com' },
              },
            },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            status: { type: 'boolean', example: false },
            message: { type: 'string' },
            code: { type: 'integer' },
          },
        },

        // ============= CLIENT SCHEMAS =============
        Client: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'client-uuid-123' },
            first_name: { type: 'string', example: 'Ram' },
            last_name: { type: 'string', example: 'Kumar' },
            email: { type: 'string', format: 'email', example: 'ram@example.com' },
            phone: { type: 'string', example: '9800123456' },
            address: { type: 'string', example: 'Kathmandu' },
            dob: { type: 'string', format: 'date', example: '1990-05-15' },
            age: { type: 'integer', example: 34 },
            gender: { type: 'string', example: 'MALE' },
            status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'], example: 'ACTIVE' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },

        // ============= POLICY SCHEMAS =============
        Policy: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'policy-uuid-456' },
            policy_number: { type: 'string', example: 'LIC-POL-2024-001' },
            plan_name: { type: 'string', example: 'Endowment Plan' },
            plan_no: { type: 'string', example: 'EP-2024' },
            policy_term: { type: 'string', example: '20 years' },
            sum_assured: { type: 'number', example: 500000 },
            premium_amount: { type: 'number', example: 5000 },
            premium_due_date: { type: 'string', format: 'date-time', example: '2024-01-15T00:00:00Z' },
            status: { type: 'string', enum: ['ACTIVE', 'LAPSED', 'PENDING', 'EXPIRED'], example: 'LAPSED' },
            days_overdue: { type: 'integer', example: 495 },
            months_overdue: { type: 'integer', example: 16 },
            client: { $ref: '#/components/schemas/Client' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },

        // ============= LAPSED POLICY SCHEMAS =============
        LapsedPolicy: {
          type: 'object',
          description: 'Policy with status=LAPSED (premium not paid for 6+ months)',
          properties: {
            id: { type: 'string', example: 'policy-uuid-456' },
            policy_number: { type: 'string', example: 'LIC-POL-2024-001' },
            plan_name: { type: 'string', example: 'Endowment Plan' },
            premium_amount: { type: 'number', example: 5000, description: 'Premium amount in currency' },
            premium_due_date: { type: 'string', format: 'date-time', example: '2024-01-15T00:00:00Z' },
            status: { type: 'string', example: 'LAPSED', description: 'Policy status' },
            days_overdue: { type: 'integer', example: 495, description: 'Number of days since premium due' },
            months_overdue: { type: 'integer', example: 16, description: 'Number of months since premium due' },
            client: {
              type: 'object',
              properties: {
                first_name: { type: 'string', example: 'Ram' },
                last_name: { type: 'string', example: 'Kumar' },
                email: { type: 'string', example: 'ram@example.com' },
                phone: { type: 'string', example: '9800123456' },
                address: { type: 'string', example: 'Kathmandu' },
              },
            },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },

        // ============= OUTDATED POLICY SCHEMAS =============
        OutdatedPolicy: {
          type: 'object',
          description: 'Policy with premium due date 6+ months old (not yet marked as lapsed)',
          properties: {
            id: { type: 'string', example: 'policy-uuid-789' },
            policy_number: { type: 'string', example: 'LIC-POL-2023-005' },
            plan_name: { type: 'string', example: 'Money Back Plan' },
            premium_amount: { type: 'number', example: 3500 },
            premium_due_date: { type: 'string', format: 'date-time', example: '2023-11-20T00:00:00Z' },
            status: { type: 'string', enum: ['ACTIVE', 'PENDING'], example: 'ACTIVE', description: 'Not yet marked as LAPSED' },
            days_overdue: { type: 'integer', example: 180, description: 'Days since premium was due' },
            months_overdue: { type: 'integer', example: 6, description: 'Months since premium was due' },
            client: {
              type: 'object',
              properties: {
                first_name: { type: 'string', example: 'Priya' },
                last_name: { type: 'string', example: 'Singh' },
                email: { type: 'string', example: 'priya@example.com' },
                phone: { type: 'string', example: '9801234567' },
                address: { type: 'string', example: 'Lalitpur' },
              },
            },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },

        // ============= LAPSED POLICIES RESPONSE =============
        LapsedPoliciesResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Found 5 lapsed policies' },
            data: {
              type: 'array',
              items: { $ref: '#/components/schemas/LapsedPolicy' },
              description: 'Array of lapsed policies with overdue calculations',
            },
          },
        },

        // ============= OUTDATED POLICIES RESPONSE =============
        OutdatedPoliciesResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Found 3 policies with outdated premium dues (6+ months)' },
            data: {
              type: 'array',
              items: { $ref: '#/components/schemas/OutdatedPolicy' },
              description: 'Array of policies with premium due 6+ months ago',
            },
          },
        },

        // ============= SYNC LAPSED RESPONSE =============
        SyncLapsedResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Synced lapsed policies. Updated 3 policies to LAPSED status' },
            data: {
              type: 'object',
              properties: {
                updated_count: { type: 'integer', example: 3, description: 'Number of policies updated' },
                policy_ids: {
                  type: 'array',
                  items: { type: 'string' },
                  example: ['policy-uuid-1', 'policy-uuid-2', 'policy-uuid-3'],
                  description: 'List of policy IDs that were updated',
                },
              },
            },
          },
        },

        // ============= NOTES SCHEMAS =============
        Note: {
          type: 'object',
          description: 'Personal note created by an agent',
          properties: {
            id: { type: 'string', example: 'note-uuid-123', description: 'Unique note identifier' },
            title: { type: 'string', example: 'Client Meeting Follow-up', description: 'Note title (auto-generated from content if not provided)' },
            content: { type: 'string', example: 'Call client on Monday to confirm policy details', description: 'Main note content (required)' },
            tag: { type: 'string', enum: ['GENERAL', 'IMPORTANT', 'FOLLOW_UP', 'TODO'], example: 'FOLLOW_UP', description: 'Note categorization tag' },
            created_at: { type: 'string', format: 'date-time', example: '2026-05-24T10:30:00Z' },
            updated_at: { type: 'string', format: 'date-time', example: '2026-05-24T10:30:00Z' },
          },
        },

        CreateNoteRequest: {
          type: 'object',
          required: ['content'],
          properties: {
            title: { type: 'string', maxLength: 500, example: 'Client Meeting Follow-up', description: 'Optional - auto-generated from content if not provided' },
            content: { type: 'string', maxLength: 10000, example: 'Call client on Monday to confirm policy details', description: 'Main note content (required)' },
            tag: { type: 'string', enum: ['GENERAL', 'IMPORTANT', 'FOLLOW_UP', 'TODO'], example: 'FOLLOW_UP', description: 'Optional - defaults to GENERAL' },
          },
        },

        UpdateNoteRequest: {
          type: 'object',
          properties: {
            title: { type: 'string', maxLength: 500, example: 'Updated Title', description: 'Optional - will be regenerated if not provided but content is updated' },
            content: { type: 'string', maxLength: 10000, example: 'Updated content', description: 'Optional' },
            tag: { type: 'string', enum: ['GENERAL', 'IMPORTANT', 'FOLLOW_UP', 'TODO'], example: 'TODO', description: 'Optional' },
          },
        },

        NotesListResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Found 5 notes' },
            data: {
              type: 'object',
              properties: {
                results: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Note' },
                  description: 'Array of notes',
                },
                data: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Note' },
                  description: 'Duplicate field for compatibility',
                },
                pagination: {
                  type: 'object',
                  properties: {
                    total: { type: 'integer', example: 5 },
                    page: { type: 'integer', example: 1 },
                    limit: { type: 'integer', example: 50 },
                    pages: { type: 'integer', example: 1 },
                  },
                },
              },
            },
          },
        },

        NotesStatsResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Notes statistics retrieved successfully' },
            data: {
              type: 'object',
              properties: {
                total: { type: 'integer', example: 15, description: 'Total notes count' },
                by_tag: {
                  type: 'object',
                  properties: {
                    GENERAL: { type: 'integer', example: 5 },
                    IMPORTANT: { type: 'integer', example: 3 },
                    FOLLOW_UP: { type: 'integer', example: 4 },
                    TODO: { type: 'integer', example: 3 },
                  },
                },
                created_today: { type: 'integer', example: 2, description: 'Notes created today' },
              },
            },
          },
        },

        // ============= CALENDAR EVENT SCHEMAS =============
        Event: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'event-uuid-123', description: 'Unique event identifier' },
            title: { type: 'string', maxLength: 255, example: 'Client Meeting', description: 'Event title' },
            description: { type: 'string', example: 'Discuss policy renewal options', description: 'Event details (optional)' },
            event_type: { type: 'string', enum: ['MEETING', 'FOLLOW_UP', 'RENEWAL', 'PREMIUM', 'PERSONAL', 'OTHER'], example: 'MEETING', description: 'Type of event' },
            event_date: { type: 'string', format: 'date', example: '2026-06-15', description: 'Date in YYYY-MM-DD format' },
            event_time: { type: 'string', example: '14:30', description: 'Time in HH:MM format (optional for all-day events)' },
            is_all_day: { type: 'boolean', example: false, description: 'Whether this is an all-day event' },
            location: { type: 'string', example: 'Office Room 201', description: 'Event location (optional)' },
            color_label: { type: 'string', example: 'indigo', description: 'Color category (indigo, pink, rose, etc.)' },
            is_recurring: { type: 'boolean', example: false, description: 'Whether this event repeats' },
            recurrence_pattern: { type: 'string', enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'], description: 'How the event recurs (optional)' },
            recurrence_end_date: { type: 'string', format: 'date', description: 'When recurrence stops (optional)' },
            reminder_minutes: { type: 'integer', example: 30, description: 'Reminder before event in minutes (optional)' },
            agent_id: { type: 'string', format: 'uuid', description: 'ID of agent who created the event' },
            client_id: { type: 'string', format: 'uuid', description: 'Associated client ID (optional)' },
            created_at: { type: 'string', format: 'date-time', example: '2026-05-24T10:30:00Z' },
            updated_at: { type: 'string', format: 'date-time', example: '2026-05-24T10:30:00Z' },
          },
        },

        CreateEventRequest: {
          type: 'object',
          required: ['title', 'event_date'],
          properties: {
            title: { type: 'string', maxLength: 255, example: 'Meeting with Policy Holder', description: 'Event title (required)' },
            description: { type: 'string', maxLength: 5000, example: 'Discuss policy renewal options', description: 'Event details (optional)' },
            event_type: { type: 'string', enum: ['MEETING', 'FOLLOW_UP', 'RENEWAL', 'PREMIUM', 'PERSONAL', 'OTHER'], example: 'MEETING', description: 'Type of event (optional, defaults to OTHER)' },
            event_date: { type: 'string', format: 'date', example: '2026-06-15', description: 'Date in YYYY-MM-DD format (required)' },
            event_time: { type: 'string', pattern: '^[0-2][0-9]:[0-5][0-9]$', example: '14:30', description: 'Time in HH:MM format (optional)' },
            is_all_day: { type: 'boolean', example: false, description: 'Whether this is an all-day event' },
            location: { type: 'string', maxLength: 500, example: 'Office Room 201', description: 'Event location (optional)' },
            color_label: { type: 'string', example: 'indigo', description: 'Color category (optional)' },
            client_id: { type: 'string', format: 'uuid', description: 'Associated client ID (optional)' },
            reminder_minutes: { type: 'integer', minimum: 0, example: 30, description: 'Reminder before event in minutes (optional)' },
            is_recurring: { type: 'boolean', example: false, description: 'Whether this event repeats' },
            recurrence_pattern: { type: 'string', enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'], description: 'How the event recurs (optional)' },
            recurrence_end_date: { type: 'string', format: 'date', description: 'When recurrence stops (optional)' },
          },
        },

        UpdateEventRequest: {
          type: 'object',
          properties: {
            title: { type: 'string', maxLength: 255, example: 'Updated Meeting Title', description: 'Event title (optional)' },
            description: { type: 'string', maxLength: 5000, example: 'Updated details', description: 'Event details (optional)' },
            event_type: { type: 'string', enum: ['MEETING', 'FOLLOW_UP', 'RENEWAL', 'PREMIUM', 'PERSONAL', 'OTHER'], description: 'Type of event (optional)' },
            event_date: { type: 'string', format: 'date', example: '2026-06-20', description: 'Date in YYYY-MM-DD format (optional)' },
            event_time: { type: 'string', pattern: '^[0-2][0-9]:[0-5][0-9]$', example: '15:00', description: 'Time in HH:MM format (optional)' },
            is_all_day: { type: 'boolean', description: 'Whether this is an all-day event' },
            location: { type: 'string', maxLength: 500, description: 'Event location (optional)' },
            color_label: { type: 'string', description: 'Color category (optional)' },
            reminder_minutes: { type: 'integer', minimum: 0, description: 'Reminder before event in minutes (optional)' },
            is_recurring: { type: 'boolean', description: 'Whether this event repeats' },
            recurrence_pattern: { type: 'string', enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'], description: 'How the event recurs (optional)' },
            recurrence_end_date: { type: 'string', format: 'date', description: 'When recurrence stops (optional)' },
          },
        },

        EventsListResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Found 10 events' },
            data: {
              type: 'object',
              properties: {
                results: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Event' },
                  description: 'Array of events',
                },
                pagination: {
                  type: 'object',
                  properties: {
                    total: { type: 'integer', example: 10 },
                    page: { type: 'integer', example: 1 },
                    limit: { type: 'integer', example: 50 },
                    pages: { type: 'integer', example: 1 },
                  },
                },
              },
            },
          },
        },

        // ============= AGENT SCHEMAS =============
        Agent: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            full_name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone_number: { type: 'string' },
            agent_code: { type: 'string' },
            lic_agent_code: { type: 'string' },
            status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    paths: {
      // ==================== AUTHENTICATION ====================
      '/api/agent/login': {
        post: {
          summary: 'Agent Login',
          tags: ['Authentication'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string' },
                  },
                  required: ['email', 'password'],
                },
              },
            },
          },
          responses: {
            200: { description: 'Login successful' },
            401: { description: 'Invalid credentials' },
          },
        },
      },
      '/api/agent/logout': {
        post: {
          summary: 'Agent Logout',
          tags: ['Authentication'],
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'Logout successful' },
            401: { description: 'Unauthorized' },
          },
        },
      },
      '/api/agent/me': {
        get: {
          summary: 'Get Current Agent Profile',
          tags: ['Authentication'],
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'Agent profile retrieved' },
            401: { description: 'Unauthorized' },
          },
        },
      },

      // ==================== POLICY MANAGEMENT ====================
      '/api/policy/create': {
        post: {
          summary: 'Create New Policy',
          tags: ['Policy Management'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Policy' },
              },
            },
          },
          responses: {
            201: { description: 'Policy created successfully' },
            400: { description: 'Validation error' },
            401: { description: 'Unauthorized' },
          },
        },
      },
      '/api/policy/search': {
        get: {
          summary: 'Search Policies',
          tags: ['Policy Management'],
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'query',
              in: 'query',
              description: 'Search query (policy number, client name, etc)',
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: { description: 'Policies found' },
            401: { description: 'Unauthorized' },
          },
        },
      },
      '/api/policy/lapsed': {
        get: {
          summary: 'Get All Lapsed Policies',
          description: 'Retrieve all policies with status=LAPSED (premium not paid for 6+ months). Returns policies with calculated days and months overdue.',
          operationId: 'getLapsedPolicies',
          tags: ['Lapsed & Outdated Policies'],
          security: [{ BearerAuth: [] }],
          responses: {
            200: {
              description: 'Lapsed policies successfully retrieved',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/LapsedPoliciesResponse' },
                  example: {
                    success: true,
                    message: 'Found 5 lapsed policies',
                    data: [
                      {
                        id: 'policy-uuid-123',
                        policy_number: 'LIC-POL-2024-001',
                        plan_name: 'Endowment Plan',
                        premium_amount: 5000,
                        premium_due_date: '2024-01-15T00:00:00Z',
                        status: 'LAPSED',
                        days_overdue: 495,
                        months_overdue: 16,
                        client: {
                          first_name: 'Ram',
                          last_name: 'Kumar',
                          email: 'ram@example.com',
                          phone: '9800123456',
                          address: 'Kathmandu',
                        },
                      },
                    ],
                  },
                },
              },
            },
            400: {
              description: 'Bad Request',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            401: {
              description: 'Unauthorized - Missing or invalid Bearer token',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            500: {
              description: 'Internal Server Error',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/policy/outdated': {
        get: {
          summary: 'Get Outdated Policies',
          description: 'Retrieve all policies with premium due date 6+ months old (but not yet marked as LAPSED). These are candidates for automatic lapsing.',
          operationId: 'getOutdatedPolicies',
          tags: ['Lapsed & Outdated Policies'],
          security: [{ BearerAuth: [] }],
          responses: {
            200: {
              description: 'Outdated policies successfully retrieved',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/OutdatedPoliciesResponse' },
                  example: {
                    success: true,
                    message: 'Found 3 policies with outdated premium dues (6+ months)',
                    data: [
                      {
                        id: 'policy-uuid-789',
                        policy_number: 'LIC-POL-2023-005',
                        plan_name: 'Money Back Plan',
                        premium_amount: 3500,
                        premium_due_date: '2023-11-20T00:00:00Z',
                        status: 'ACTIVE',
                        days_overdue: 180,
                        months_overdue: 6,
                        client: {
                          first_name: 'Priya',
                          last_name: 'Singh',
                          email: 'priya@example.com',
                          phone: '9801234567',
                          address: 'Lalitpur',
                        },
                      },
                    ],
                  },
                },
              },
            },
            400: {
              description: 'Bad Request',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            401: {
              description: 'Unauthorized - Missing or invalid Bearer token',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            500: {
              description: 'Internal Server Error',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/policy/sync-lapsed': {
        post: {
          summary: 'Automatically Sync & Mark Outdated Policies as Lapsed',
          description: 'Batch operation to automatically mark all outdated policies (premium due 6+ months ago) as LAPSED status. Updates all matching policies in the database.',
          operationId: 'syncLapsedPolicies',
          tags: ['Lapsed & Outdated Policies'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  description: 'Empty request body',
                  example: {},
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Policies successfully synced and updated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SyncLapsedResponse' },
                  example: {
                    success: true,
                    message: 'Synced lapsed policies. Updated 3 policies to LAPSED status',
                    data: {
                      updated_count: 3,
                      policy_ids: [
                        'policy-uuid-1',
                        'policy-uuid-2',
                        'policy-uuid-3',
                      ],
                    },
                  },
                },
              },
            },
            400: {
              description: 'Bad Request',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            401: {
              description: 'Unauthorized - Missing or invalid Bearer token',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            500: {
              description: 'Internal Server Error',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/policy/{policyId}': {
        get: {
          summary: 'Get Policy Details',
          tags: ['Policy Management'],
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'policyId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: { description: 'Policy details retrieved' },
            401: { description: 'Unauthorized' },
            404: { description: 'Policy not found' },
          },
        },
        put: {
          summary: 'Update Policy',
          tags: ['Policy Management'],
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'policyId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Policy' },
              },
            },
          },
          responses: {
            200: { description: 'Policy updated successfully' },
            401: { description: 'Unauthorized' },
            404: { description: 'Policy not found' },
          },
        },
        delete: {
          summary: 'Delete Policy',
          tags: ['Policy Management'],
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'policyId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: { description: 'Policy deleted successfully' },
            401: { description: 'Unauthorized' },
            404: { description: 'Policy not found' },
          },
        },
      },
      '/api/policy/{policyId}/mark-lapsed': {
        put: {
          summary: 'Mark Policy as Lapsed',
          tags: ['Policy Management'],
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'policyId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: { description: 'Policy marked as lapsed' },
            401: { description: 'Unauthorized' },
            404: { description: 'Policy not found' },
          },
        },
      },
      '/api/policy/summary': {
        get: {
          summary: 'Get Policy Summary',
          description: 'Get summary statistics for all policies',
          tags: ['Policy Management'],
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'Policy summary retrieved' },
            401: { description: 'Unauthorized' },
          },
        },
      },

      // ==================== NOTES MANAGEMENT ====================
      '/api/personal-notes': {
        get: {
          summary: 'Get All Notes',
          description: 'Retrieve all notes for authenticated agent with optional search and tag filters',
          operationId: 'getNotes',
          tags: ['Notes Management'],
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'page',
              in: 'query',
              description: 'Page number for pagination (starts at 1)',
              schema: { type: 'integer', default: 1 },
            },
            {
              name: 'limit',
              in: 'query',
              description: 'Number of notes per page (max 50)',
              schema: { type: 'integer', default: 50 },
            },
            {
              name: 'tag',
              in: 'query',
              description: 'Filter by note tag',
              schema: { type: 'string', enum: ['GENERAL', 'IMPORTANT', 'FOLLOW_UP', 'TODO'] },
            },
            {
              name: 'search',
              in: 'query',
              description: 'Search in note title and content',
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: {
              description: 'Notes successfully retrieved',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/NotesListResponse' },
                },
              },
            },
            401: { description: 'Unauthorized - Missing or invalid Bearer token' },
            500: { description: 'Internal Server Error' },
          },
        },
        post: {
          summary: 'Create a New Note',
          description: 'Create a new personal note. Title is auto-generated from content if not provided.',
          operationId: 'createNote',
          tags: ['Notes Management'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateNoteRequest' },
                examples: {
                  minimal: {
                    summary: 'Minimal (content only)',
                    value: {
                      content: 'Call client on Monday',
                    },
                  },
                  complete: {
                    summary: 'Complete (with all fields)',
                    value: {
                      title: 'Client Follow-up',
                      content: 'Call client on Monday to confirm policy details',
                      tag: 'FOLLOW_UP',
                    },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'Note created successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      message: { type: 'string' },
                      data: { $ref: '#/components/schemas/Note' },
                    },
                  },
                },
              },
            },
            400: {
              description: 'Bad Request - Validation error (empty content, etc.)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            401: { description: 'Unauthorized - Missing or invalid Bearer token' },
            500: { description: 'Internal Server Error' },
          },
        },
      },
      '/api/personal-notes/{noteId}': {
        get: {
          summary: 'Get Single Note',
          description: 'Retrieve a specific note by ID',
          operationId: 'getNote',
          tags: ['Notes Management'],
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'noteId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Note ID',
            },
          ],
          responses: {
            200: {
              description: 'Note retrieved successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      message: { type: 'string' },
                      data: { $ref: '#/components/schemas/Note' },
                    },
                  },
                },
              },
            },
            401: { description: 'Unauthorized' },
            403: { description: 'Forbidden - Not the note owner' },
            404: { description: 'Note not found' },
            500: { description: 'Internal Server Error' },
          },
        },
        patch: {
          summary: 'Update Note',
          description: 'Update note title and/or content. Title auto-generates from content if only content is updated.',
          operationId: 'updateNote',
          tags: ['Notes Management'],
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'noteId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UpdateNoteRequest' },
                examples: {
                  updateContent: {
                    summary: 'Update content only',
                    value: {
                      content: 'Updated content goes here',
                    },
                  },
                  updateTitle: {
                    summary: 'Update title only',
                    value: {
                      title: 'New Title',
                    },
                  },
                  updateAll: {
                    summary: 'Update all fields',
                    value: {
                      title: 'Updated Title',
                      content: 'Updated content',
                      tag: 'TODO',
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Note updated successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      message: { type: 'string' },
                      data: { $ref: '#/components/schemas/Note' },
                    },
                  },
                },
              },
            },
            400: { description: 'Bad Request - Validation error' },
            401: { description: 'Unauthorized' },
            403: { description: 'Forbidden - Not the note owner' },
            404: { description: 'Note not found' },
            500: { description: 'Internal Server Error' },
          },
        },
        delete: {
          summary: 'Soft Delete Note',
          description: 'Delete a note (soft delete - sets deleted_at timestamp)',
          operationId: 'deleteNote',
          tags: ['Notes Management'],
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'noteId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: {
              description: 'Note deleted successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      message: { type: 'string' },
                      data: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          deleted_at: { type: 'string', format: 'date-time' },
                        },
                      },
                    },
                  },
                },
              },
            },
            401: { description: 'Unauthorized' },
            403: { description: 'Forbidden - Not the note owner' },
            404: { description: 'Note not found' },
            500: { description: 'Internal Server Error' },
          },
        },
      },
      '/api/personal-notes/{noteId}/permanent': {
        delete: {
          summary: 'Permanently Delete Note',
          description: 'Hard delete a note (removes from database entirely). Admin only.',
          operationId: 'permanentlyDeleteNote',
          tags: ['Notes Management'],
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'noteId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: {
              description: 'Note permanently deleted',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      message: { type: 'string' },
                      data: { type: 'object', properties: { id: { type: 'string' } } },
                    },
                  },
                },
              },
            },
            401: { description: 'Unauthorized' },
            403: { description: 'Forbidden - Admin only' },
            404: { description: 'Note not found' },
            500: { description: 'Internal Server Error' },
          },
        },
      },
      '/api/personal-notes/stats/summary': {
        get: {
          summary: 'Get Notes Statistics',
          description: 'Get summary statistics for notes (total count, breakdown by tag, notes created today)',
          operationId: 'getNotesStats',
          tags: ['Notes Management'],
          security: [{ BearerAuth: [] }],
          responses: {
            200: {
              description: 'Statistics retrieved successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/NotesStatsResponse' },
                },
              },
            },
            401: { description: 'Unauthorized' },
            500: { description: 'Internal Server Error' },
          },
        },
      },

      // ==================== CLIENT MANAGEMENT ====================
      '/api/client/enroll': {
        post: {
          summary: 'Enroll New Client',
          tags: ['Client Management'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Client' },
              },
            },
          },
          responses: {
            201: { description: 'Client enrolled successfully' },
            400: { description: 'Validation error' },
            401: { description: 'Unauthorized' },
          },
        },
      },
      '/api/client/search': {
        get: {
          summary: 'Search Clients',
          tags: ['Client Management'],
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'query',
              in: 'query',
              description: 'Search query (name, email, phone, etc)',
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: { description: 'Clients found' },
            401: { description: 'Unauthorized' },
          },
        },
      },
      '/api/client/{clientId}': {
        get: {
          summary: 'Get Client Details',
          tags: ['Client Management'],
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'clientId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: { description: 'Client details retrieved' },
            401: { description: 'Unauthorized' },
            404: { description: 'Client not found' },
          },
        },
        put: {
          summary: 'Update Client',
          tags: ['Client Management'],
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'clientId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Client' },
              },
            },
          },
          responses: {
            200: { description: 'Client updated successfully' },
            401: { description: 'Unauthorized' },
            404: { description: 'Client not found' },
          },
        },
        delete: {
          summary: 'Delete Client',
          tags: ['Client Management'],
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'clientId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: { description: 'Client deleted successfully' },
            401: { description: 'Unauthorized' },
            404: { description: 'Client not found' },
          },
        },
      },

      // ==================== AGENT MANAGEMENT ====================
      '/api/agent/profile': {
        get: {
          summary: 'Get Agent Profile',
          tags: ['Agent Management'],
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'Agent profile retrieved' },
            401: { description: 'Unauthorized' },
          },
        },
        put: {
          summary: 'Update Agent Profile',
          tags: ['Agent Management'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Agent' },
              },
            },
          },
          responses: {
            200: { description: 'Agent profile updated' },
            401: { description: 'Unauthorized' },
          },
        },
      },

      // ==================== DASHBOARD ====================
      '/api/user-panel/dashboard-overview': {
        get: {
          summary: 'Get Dashboard Overview',
          tags: ['Dashboard'],
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'Dashboard data retrieved' },
            401: { description: 'Unauthorized' },
          },
        },
      },

      // ==================== NOTIFICATIONS ====================
      '/api/my-notifications': {
        get: {
          summary: 'Get Notifications',
          tags: ['Notifications'],
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'Notifications retrieved' },
            401: { description: 'Unauthorized' },
          },
        },
      },
      '/api/my-notifications/{notificationId}/mark_read': {
        post: {
          summary: 'Mark Notification as Read',
          tags: ['Notifications'],
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'notificationId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: { description: 'Notification marked as read' },
            401: { description: 'Unauthorized' },
          },
        },
      },

      // ==================== ANALYTICS ====================
      '/api/analytics/monthly-graph': {
        get: {
          summary: 'Get Monthly Analytics',
          tags: ['Analytics'],
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'Monthly analytics retrieved' },
            401: { description: 'Unauthorized' },
          },
        },
      },
      '/api/analytics/policy-status-breakdown': {
        get: {
          summary: 'Get Policy Status Breakdown',
          tags: ['Analytics'],
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'Policy status breakdown retrieved' },
            401: { description: 'Unauthorized' },
          },
        },
      },

      // ==================== CALENDAR MANAGEMENT ====================
      '/api/calendar': {
        get: {
          summary: 'Get Calendar Events',
          description: 'Retrieve events for authenticated agent with optional date range filters and pagination',
          tags: ['Calendar Management'],
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'from',
              in: 'query',
              schema: { type: 'string', format: 'date' },
              example: '2026-06-01',
              description: 'Start date (YYYY-MM-DD) - include events from this date',
            },
            {
              name: 'to',
              in: 'query',
              schema: { type: 'string', format: 'date' },
              example: '2026-06-30',
              description: 'End date (YYYY-MM-DD) - include events until this date',
            },
            {
              name: 'event_type',
              in: 'query',
              schema: { type: 'string', enum: ['MEETING', 'FOLLOW_UP', 'RENEWAL', 'PREMIUM', 'PERSONAL', 'OTHER'] },
              description: 'Filter by event type',
            },
            {
              name: 'client_id',
              in: 'query',
              schema: { type: 'string', format: 'uuid' },
              description: 'Filter events by client',
            },
            {
              name: 'page',
              in: 'query',
              schema: { type: 'integer', default: 1 },
              description: 'Page number for pagination',
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 50 },
              description: 'Number of results per page',
            },
          ],
          responses: {
            200: {
              description: 'Events retrieved successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/EventsListResponse' },
                },
              },
            },
            401: { description: 'Unauthorized' },
            500: { description: 'Server error' },
          },
        },
        post: {
          summary: 'Create New Event',
          description: 'Create a new calendar event for the authenticated agent',
          tags: ['Calendar Management'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateEventRequest' },
                examples: {
                  simple: {
                    value: {
                      title: 'Client Meeting',
                      event_date: '2026-06-15',
                      event_type: 'MEETING',
                    },
                  },
                  complete: {
                    value: {
                      title: 'Policy Renewal Meeting',
                      description: 'Discuss renewal options with client',
                      event_type: 'RENEWAL',
                      event_date: '2026-06-15',
                      event_time: '14:30',
                      location: 'Office Room 201',
                      color_label: 'indigo',
                      client_id: 'client-uuid-123',
                      reminder_minutes: 30,
                    },
                  },
                  recurring: {
                    value: {
                      title: 'Weekly Team Meeting',
                      event_date: '2026-06-01',
                      event_time: '10:00',
                      is_recurring: true,
                      recurrence_pattern: 'WEEKLY',
                      recurrence_end_date: '2026-12-31',
                    },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'Event created successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Event' },
                },
              },
            },
            400: { description: 'Validation error' },
            401: { description: 'Unauthorized' },
            500: { description: 'Server error' },
          },
        },
      },

      '/api/calendar/{eventId}': {
        get: {
          summary: 'Get Single Event',
          tags: ['Calendar Management'],
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'eventId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Event ID',
            },
          ],
          responses: {
            200: {
              description: 'Event retrieved',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Event' },
                },
              },
            },
            404: { description: 'Event not found' },
            401: { description: 'Unauthorized' },
          },
        },
        patch: {
          summary: 'Update Event',
          description: 'Update an existing calendar event',
          tags: ['Calendar Management'],
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'eventId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Event ID',
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UpdateEventRequest' },
              },
            },
          },
          responses: {
            200: {
              description: 'Event updated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Event' },
                },
              },
            },
            400: { description: 'Validation error' },
            404: { description: 'Event not found' },
            401: { description: 'Unauthorized' },
          },
        },
        delete: {
          summary: 'Delete Event',
          description: 'Soft delete an event (marks with deleted_at timestamp)',
          tags: ['Calendar Management'],
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'eventId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Event ID',
            },
          ],
          responses: {
            200: { description: 'Event deleted' },
            404: { description: 'Event not found' },
            401: { description: 'Unauthorized' },
          },
        },
      },

      '/api/calendar/upcoming': {
        get: {
          summary: 'Get Upcoming Events',
          description: 'Get upcoming events for the next 7 days',
          tags: ['Calendar Management'],
          security: [{ BearerAuth: [] }],
          responses: {
            200: {
              description: 'Upcoming events retrieved',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      message: { type: 'string' },
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Event' },
                      },
                    },
                  },
                },
              },
            },
            401: { description: 'Unauthorized' },
          },
        },
      },
    },
    tags: [
      {
        name: 'Authentication',
        description: 'User login, logout, and auth management',
      },
      {
        name: 'Lapsed & Outdated Policies',
        description: 'Manage lapsed policies (6+ months without payment) and identify outdated policies for automatic processing',
      },
      {
        name: 'Policy Management',
        description: 'Create, retrieve, update, delete, and manage policies',
      },
      {
        name: 'Client Management',
        description: 'Manage client enrollment and information',
      },
      {
        name: 'Agent Management',
        description: 'Agent profile and configuration',
      },
      {
        name: 'Dashboard',
        description: 'Dashboard and overview endpoints',
      },
      {
        name: 'Notifications',
        description: 'Notification management',
      },
      {
        name: 'Analytics',
        description: 'Analytics and reporting endpoints',
      },
      {
        name: 'Calendar Management',
        description: 'Create, read, update, and manage calendar events with support for recurring events, reminders, and date range queries',
      },
      {
        name: 'Notes Management',
        description: 'Create, read, update, and delete personal notes with tagging, search, and statistics',
      },
    ],
  },
  apis: ["src/routes/**/*.ts", "src/routes/**/*.js"],
};

export default swaggerOptions;
