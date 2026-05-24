# Comprehensive Error Handling Guide

## Overview

This backend implements enterprise-grade error handling across four critical areas:

1. **Error Handling** - Standardized error responses with detailed messages
2. **Exception Handling** - Catching and properly handling runtime errors
3. **Connection Handling** - Database connectivity with retry logic and health checks
4. **Empty State Handling** - Graceful responses when no data is found

---

## 1. Error Handling Architecture

### Error Classes Hierarchy

```
AppError (Base)
├── ValidationError (400)
├── NotFoundError (404)
├── UnauthorizedError (401)
├── ForbiddenError (403)
├── DatabaseError (500)
├── ConnectionError (503)
└── ConflictError (409)
```

### Error Response Format

All error responses follow a standardized format:

```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "Validation failed",
  "details": {
    "errors": {
      "title": "Title is required",
      "event_date": "Invalid date format"
    }
  },
  "timestamp": "2026-05-24T10:30:00Z",
  "requestId": "req_1716550200000_abc123def"
}
```

### Error Codes

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `VALIDATION_ERROR` | 400 | Input validation failed |
| `BAD_REQUEST` | 400 | Malformed request |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Access denied |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource conflict (duplicate) |
| `DATABASE_ERROR` | 500 | Database operation failed |
| `CONNECTION_ERROR` | 503 | Database unavailable |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily down |

---

## 2. Exception Handling

### Middleware Integration

The error handling middleware is registered **last** in the middleware chain:

```typescript
// app.ts
app.use(express.json());
app.use(responseMiddleware);        // Response helpers
app.use(connectionHealthMiddleware); // Connection checks
app.use(authRoutes);                // Routes
app.use(calendarRoutes);
app.use(notesRoutes);

// Error handlers LAST
app.use(notFoundHandler);           // 404 handler
app.use(errorHandler);              // Main error handler
```

### Catching Exceptions

All route handlers wrap async operations in try-catch blocks:

```typescript
router.get('/api/calendar', verifyToken, async (req, res) => {
  try {
    const agentId = req.user?.id;
    
    // Validate input
    if (!agentId) {
      throw new UnauthorizedError('Agent ID not found');
    }

    // Database operations
    const events = await prisma.event.findMany({
      where: {
        agent_id: agentId,
        deleted_at: null,
      },
    });

    // Handle empty state
    if (!events || events.length === 0) {
      return res.apiEmpty('No events found');
    }

    // Return success
    return res.apiPaginated(
      events.map(formatEvent),
      calculatePagination(events.length, 1, 50),
      'Events retrieved successfully'
    );

  } catch (error) {
    // Errors automatically caught by middleware
    next(error);
  }
});
```

### Async Handler Wrapper

For cleaner error handling, use the `asyncHandler` wrapper:

```typescript
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((error) => {
    ErrorLogger.log(error, { path: req.path, method: req.method });
    next(error);
  });
};

// Usage
router.get('/api/calendar', asyncHandler(async (req, res) => {
  // Any error thrown here is automatically caught
  // No need for manual try-catch
}));
```

---

## 3. Connection Handling

### Connection Manager

The `ConnectionManager` is a singleton that handles:
- Connection initialization with retry logic
- Health checks at regular intervals
- Automatic recovery
- Graceful disconnection

```typescript
// Initialize on app start
import { ConnectionManager } from './utils/connectionHandler';

async function startServer() {
  try {
    // Initialize database connection with retries
    const connectionManager = ConnectionManager.getInstance({
      maxRetries: 3,
      retryDelayMs: 1000,
      connectionTimeoutMs: 10000,
      healthCheckIntervalMs: 60000,
    });

    await connectionManager.initialize();
    console.log('Database connected');

    // Start server...
    app.listen(3000);

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  await connectionManager.disconnect();
  process.exit(0);
});
```

### Connection Health Middleware

Automatic health checks on every request:

```typescript
export const connectionHealthMiddleware = (req, res, next) => {
  const connectionManager = ConnectionManager.getInstance();

  // Return 503 if database is down
  if (!connectionManager.isHealthy()) {
    return res.status(503).json({
      success: false,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database connection unavailable',
      timestamp: new Date().toISOString(),
    });
  }

  next();
};
```

### Retry Logic

Automatic retries with exponential backoff for transient errors:

```typescript
import { RetryHandler } from './utils/errorHandler';

// Retry operation up to 3 times with exponential backoff
const result = await RetryHandler.retry(
  async () => {
    return await prisma.event.findMany({ ... });
  },
  maxRetries: 3,      // Retry up to 3 times
  delayMs: 1000,      // Start with 1 second delay
  exponentialBackoff: true  // Double delay each attempt
);

// Attempts: 1st (1s), 2nd (2s), 3rd (4s)
```

---

## 4. Empty State Handling

### Empty Response Format

When no results are found, return explicit empty state:

```json
{
  "success": true,
  "code": "NO_RESULTS",
  "message": "No events found",
  "data": {
    "results": [],
    "pagination": {
      "total": 0,
      "page": 1,
      "limit": 50,
      "pages": 0
    }
  },
  "timestamp": "2026-05-24T10:30:00Z"
}
```

### Response Helper Methods

```typescript
// Empty list with pagination
res.apiEmpty(
  'No events found',
  'NO_RESULTS',
  {
    total: 0,
    page: 1,
    limit: 50,
    pages: 0
  }
);

// Empty list without pagination
res.apiEmpty('No notes found');

// Empty success with custom message
res.apiEmpty('No events for this date range');
```

### Checking for Empty Data

```typescript
import { isEmpty, calculatePagination } from './utils/responseHandler';

router.get('/api/calendar', verifyToken, async (req, res) => {
  try {
    const events = await prisma.event.findMany({...});

    // Explicit empty state check
    if (isEmpty(events)) {
      return res.apiEmpty(
        'No events found for the requested date range',
        'NO_RESULTS'
      );
    }

    // Return paginated results
    return res.apiPaginated(
      events.map(formatEvent),
      calculatePagination(events.length, page, limit)
    );

  } catch (error) {
    next(error);
  }
});
```

---

## 5. Validation Error Handling

### Input Validation

Validate all inputs before database operations:

```typescript
// Validation helper
const validateEventData = (data, isUpdate = false) => {
  const errors = {};

  if (!isUpdate || data.title !== undefined) {
    if (!data.title || typeof data.title !== 'string') {
      errors.title = 'Title is required and must be a string';
    } else if (data.title.length > 255) {
      errors.title = 'Title must be less than 255 characters';
    }
  }

  if (!isUpdate || data.event_date !== undefined) {
    if (!data.event_date) {
      errors.event_date = 'Event date is required';
    } else {
      const date = new Date(data.event_date);
      if (isNaN(date.getTime())) {
        errors.event_date = 'Invalid date format';
      }
    }
  }

  return Object.keys(errors).length > 0 ? errors : null;
};

// Usage
router.post('/api/calendar', verifyToken, async (req, res) => {
  try {
    const validationErrors = validateEventData(req.body);

    if (validationErrors) {
      return res.apiValidationError(validationErrors);
    }

    // Proceed with creation...

  } catch (error) {
    next(error);
  }
});
```

---

## 6. Database-Specific Error Handling

### Prisma Errors

The error middleware automatically handles Prisma errors:

```typescript
// P2025: Record not found
// Returns: 404 NOT_FOUND

// P2002: Unique constraint violation
// Returns: 409 CONFLICT with field information

// P2003: Foreign key constraint
// Returns: 400 VALIDATION_ERROR with relation info

// P2023: Inconsistent column data
// Returns: 400 VALIDATION_ERROR

// PrismaClientValidationError
// Returns: 400 BAD_REQUEST

// PrismaClientInitializationError
// Returns: 503 SERVICE_UNAVAILABLE
```

---

## 7. Ownership Authorization

### Ownership Checks

Ensure users only access their own data:

```typescript
router.get('/api/calendar/:eventId', verifyToken, async (req, res) => {
  try {
    const agentId = req.user?.id;
    const { eventId } = req.params;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    // Check if event exists
    if (!event || event.deleted_at) {
      throw new NotFoundError('Event', eventId);
    }

    // Check ownership
    if (event.agent_id !== agentId && !req.user?.is_admin) {
      throw new ForbiddenError('You do not have access to this event');
    }

    return res.apiSuccess(formatEvent(event), 'Event retrieved');

  } catch (error) {
    next(error);
  }
});
```

---

## 8. Error Logging

### Logging Strategy

Errors are logged with full context:

```typescript
ErrorLogger.log(error, {
  requestId: 'req_1716550200000_abc123def',
  path: '/api/calendar',
  method: 'POST',
  userId: 'agent-uuid-123',
  timestamp: '2026-05-24T10:30:00Z',
});

// Logs to console:
// [AppError] {
//   "timestamp": "2026-05-24T10:30:00Z",
//   "message": "Event title is required",
//   "stack": "...",
//   "context": {...}
// }
```

### Database Error Logging

```typescript
ErrorLogger.logDatabase(
  'SELECT * FROM events WHERE agent_id = $1',
  error,
  ['agent-uuid-123']
);

// [DatabaseError] {
//   "timestamp": "2026-05-24T10:30:00Z",
//   "query": "SELECT * FROM events WHERE agent_id = $1",
//   "params": ["agent-uuid-123"],
//   "error": "Connection timeout"
// }
```

### Connection Error Logging

```typescript
ErrorLogger.logConnection(error, retryable = true);

// [ConnectionError] {
//   "timestamp": "2026-05-24T10:30:00Z",
//   "error": "Connection refused",
//   "retryable": true,
//   "stack": "..."
// }
```

---

## 9. Integration Checklist

- [ ] `errorHandler.ts` created with all error classes
- [ ] `connectionHandler.ts` created with ConnectionManager
- [ ] `responseHandler.ts` created with response formatters
- [ ] `errorMiddleware.ts` created with error handling
- [ ] Both routes files (calendar, notes) updated with try-catch blocks
- [ ] app.ts updated to register error middleware
- [ ] Connection manager initialized on app startup
- [ ] Graceful shutdown configured
- [ ] Health check endpoints configured
- [ ] Error logging verified
- [ ] Empty state handling tested
- [ ] All error codes documented

---

## 10. Testing Error Scenarios

### Test Cases

```bash
# Test validation error
curl -X POST http://localhost:3000/api/calendar \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": ""}'
# Expected: 400 VALIDATION_ERROR

# Test not found
curl -X GET http://localhost:3000/api/calendar/invalid-id \
  -H "Authorization: Bearer TOKEN"
# Expected: 404 NOT_FOUND

# Test unauthorized
curl -X GET http://localhost:3000/api/calendar
# Expected: 401 UNAUTHORIZED

# Test empty state
curl -X GET "http://localhost:3000/api/calendar?from=2099-01-01&to=2099-12-31" \
  -H "Authorization: Bearer TOKEN"
# Expected: 200 with empty results array

# Test connection error
# (Stop PostgreSQL, then make request)
curl -X GET http://localhost:3000/api/calendar \
  -H "Authorization: Bearer TOKEN"
# Expected: 503 SERVICE_UNAVAILABLE
```

---

## 11. Best Practices

1. **Always throw custom errors** - Use AppError subclasses, not generic Error
2. **Provide context** - Include details about what failed and why
3. **Log everything** - Errors, database operations, connection issues
4. **Return appropriate status codes** - 400 for validation, 404 for missing, 500 for server errors
5. **Handle empty states** - Don't treat "no results" as an error
6. **Check ownership** - Verify users only access their own data
7. **Use retry logic** - For transient connection errors
8. **Validate input** - Before any database operations
9. **Close connections** - Gracefully on shutdown
10. **Monitor health** - Regular connection checks

---

## Summary

This comprehensive error handling system ensures:

✅ **Reliability** - Automatic retries for transient failures
✅ **Security** - Proper authorization checks
✅ **Clarity** - Detailed error messages for debugging
✅ **Consistency** - Standardized response formats
✅ **Observability** - Complete error logging
✅ **Resilience** - Graceful degradation and recovery

