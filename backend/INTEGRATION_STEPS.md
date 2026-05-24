# Error Handling Integration Steps

## Files Created

1. **src/utils/errorHandler.ts** (271 lines)
   - Custom error classes (AppError, ValidationError, NotFoundError, etc.)
   - Error codes enumeration
   - Error logging utilities
   - Async handler wrapper
   - Retry logic with exponential backoff

2. **src/utils/connectionHandler.ts** (199 lines)
   - ConnectionManager singleton
   - Connection initialization with retries
   - Health check implementation
   - Graceful disconnect

3. **src/utils/responseHandler.ts** (283 lines)
   - ResponseHandler class with standardized methods
   - Pagination helper
   - Empty state handling
   - Response middleware for dependency injection

4. **src/middleware/errorMiddleware.ts** (246 lines)
   - Main error handler middleware
   - 404 Not Found handler
   - Prisma error mapping
   - Process-level error handlers

5. **ERROR_HANDLING_GUIDE.md** (Complete documentation)
   - Architecture overview
   - Error handling patterns
   - Connection handling
   - Empty state handling
   - Integration checklist

---

## Integration into app.ts

### Step 1: Update Imports

```typescript
// Add to top of src/app.ts
import { errorHandler, notFoundHandler, connectionHealthMiddleware } from './middleware/errorMiddleware';
import { responseMiddleware } from './utils/responseHandler';
import { ConnectionManager } from './utils/connectionHandler';
```

### Step 2: Register Response Middleware

```typescript
// After express() initialization, add:
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(responseMiddleware); // IMPORTANT: Before routes
```

### Step 3: Register Connection Health Middleware

```typescript
// Before route handlers:
app.use(connectionHealthMiddleware);
```

### Step 4: Register Routes

```typescript
// Existing routes
app.use('/api', authRoutes);
app.use('/api/policy', policyRoutes);
// ... other routes
app.use('/api/calendar', calendarRoutes);
app.use('/api', notesRoutes);
```

### Step 5: Register Error Handlers

```typescript
// LAST in middleware chain, before listen:
app.use(notFoundHandler);  // 404 handler
app.use(errorHandler);     // Main error handler
```

### Step 6: Initialize Connection on Startup

```typescript
// In your startup code:
async function startServer() {
  try {
    // Initialize database connection with retry logic
    const connectionManager = ConnectionManager.getInstance({
      maxRetries: 3,
      retryDelayMs: 1000,
      connectionTimeoutMs: 10000,
      healthCheckIntervalMs: 60000,
    });

    await connectionManager.initialize();
    console.log('[Server] Database connection established');

    // Start express server
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`[Server] Running on port ${PORT}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('[Server] SIGTERM signal received: closing HTTP server');
      await connectionManager.disconnect();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('[Server] SIGINT signal received: closing HTTP server');
      await connectionManager.disconnect();
      process.exit(0);
    });

  } catch (error) {
    console.error('[Server] Failed to start:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

startServer();
```

---

## Updating Route Handlers

### Before: Basic Error Handling

```typescript
router.post('/api/calendar', verifyToken, async (req, res) => {
  const agentId = req.user?.id;
  const { title, event_date } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Title required' });
  }

  const event = await prisma.event.create({
    data: { title, event_date, agent_id: agentId },
  });

  res.json(event);
});
```

### After: Comprehensive Error Handling

```typescript
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  DatabaseError,
  asyncHandler,
} from '../utils/errorHandler';
import { calculatePagination } from '../utils/responseHandler';

router.post('/api/calendar', verifyToken, asyncHandler(async (req, res, next) => {
  const agentId = req.user?.id;
  const { title, event_date, description } = req.body;

  // Validation
  if (!agentId) {
    throw new ValidationError('Agent ID not found in token');
  }

  if (!title || !event_date) {
    throw new ValidationError('Title and event_date are required');
  }

  if (title.length > 255) {
    throw new ValidationError('Title must be less than 255 characters');
  }

  // Create event
  try {
    const event = await prisma.event.create({
      data: {
        title,
        event_date: new Date(event_date),
        description,
        agent_id: agentId,
      },
    });

    return res.apiCreated(formatEvent(event), 'Event created successfully');

  } catch (error) {
    if (error.code === 'P2003') {
      throw new ValidationError('Referenced agent or client not found');
    }
    throw new DatabaseError('Failed to create event', { error: error.message });
  }
}));
```

---

## Validation Helper Pattern

### Create Validation Utilities

```typescript
// src/utils/validators.ts

export const validateEventData = (data, isUpdate = false) => {
  const errors = {};

  // Title validation
  if (!isUpdate || data.title !== undefined) {
    if (!data.title || typeof data.title !== 'string' || !data.title.trim()) {
      errors.title = 'Title is required and must be a non-empty string';
    } else if (data.title.length > 255) {
      errors.title = 'Title must be less than 255 characters';
    }
  }

  // Event date validation
  if (!isUpdate || data.event_date !== undefined) {
    if (!data.event_date) {
      errors.event_date = 'Event date is required';
    } else {
      const date = new Date(data.event_date);
      if (isNaN(date.getTime())) {
        errors.event_date = 'Invalid ISO 8601 date format';
      }
    }
  }

  // Add more validations...

  return Object.keys(errors).length > 0 ? errors : null;
};

export const validateNoteData = (data, isUpdate = false) => {
  const errors = {};

  if (!isUpdate || data.content !== undefined) {
    if (!data.content || typeof data.content !== 'string' || !data.content.trim()) {
      errors.content = 'Content is required and must be a non-empty string';
    } else if (data.content.length > 10000) {
      errors.content = 'Content must be less than 10000 characters';
    }
  }

  // Add more validations...

  return Object.keys(errors).length > 0 ? errors : null;
};
```

### Use in Route Handler

```typescript
import { validateEventData } from '../utils/validators';
import { ValidationError } from '../utils/errorHandler';

router.post('/api/calendar', verifyToken, asyncHandler(async (req, res) => {
  // Validate input
  const validationErrors = validateEventData(req.body);
  if (validationErrors) {
    throw new ValidationError(
      'Validation failed',
      { errors: validationErrors }
    );
  }

  // Proceed with creation...
  const event = await prisma.event.create({...});
  return res.apiCreated(formatEvent(event));
}));
```

---

## Empty State Handling Pattern

```typescript
import { isEmpty, calculatePagination } from '../utils/responseHandler';

router.get('/api/calendar', verifyToken, asyncHandler(async (req, res) => {
  const agentId = req.user?.id;
  const { from, to, page = 1, limit = 50 } = req.query;

  // Fetch events
  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where: {
        agent_id: agentId,
        deleted_at: null,
        ...(from && { event_date: { gte: new Date(from) } }),
        ...(to && { event_date: { lte: new Date(to) } }),
      },
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.event.count({
      where: {
        agent_id: agentId,
        deleted_at: null,
        ...(from && { event_date: { gte: new Date(from) } }),
        ...(to && { event_date: { lte: new Date(to) } }),
      },
    }),
  ]);

  // Explicit empty state check
  if (isEmpty(events)) {
    return res.apiEmpty(
      'No events found for the requested date range',
      'NO_RESULTS',
      calculatePagination(total, page, limit)
    );
  }

  // Return paginated results
  return res.apiPaginated(
    events.map(formatEvent),
    calculatePagination(total, page, limit),
    `Found ${events.length} events`
  );
}));
```

---

## Ownership Authorization Pattern

```typescript
import { NotFoundError, ForbiddenError } from '../utils/errorHandler';

router.get('/api/calendar/:eventId', verifyToken, asyncHandler(async (req, res) => {
  const agentId = req.user?.id;
  const isAdmin = req.user?.is_admin;
  const { eventId } = req.params;

  // Fetch event
  const event = await prisma.event.findUnique({
    where: { id: eventId },
  });

  // Check existence
  if (!event || event.deleted_at) {
    throw new NotFoundError('Event', eventId);
  }

  // Check authorization
  if (event.agent_id !== agentId && !isAdmin) {
    throw new ForbiddenError('You do not have access to this event');
  }

  return res.apiSuccess(formatEvent(event), 'Event retrieved');
}));
```

---

## Connection Error Handling Example

```typescript
import { ConnectionError, RetryHandler } from '../utils/errorHandler';

router.get('/api/calendar/stats', verifyToken, asyncHandler(async (req, res) => {
  try {
    // Retry operation with exponential backoff
    const stats = await RetryHandler.retry(
      async () => {
        return await prisma.event.aggregate({
          _count: true,
          where: {
            agent_id: req.user?.id,
            deleted_at: null,
          },
        });
      },
      maxRetries: 3,
      delayMs: 1000,
      exponentialBackoff: true
    );

    return res.apiSuccess(stats, 'Stats retrieved');

  } catch (error) {
    if (error instanceof ConnectionError && error.retryable) {
      // Attempt to retry with fresh connection
      // or return 503 service unavailable
      return res.apiUnavailable('Database temporarily unavailable. Please try again.');
    }
    throw error;
  }
}));
```

---

## Testing Error Handling

### Test Script

```bash
#!/bin/bash

BASE_URL="http://localhost:3000"
TOKEN="your-jwt-token-here"

echo "Testing Error Handling..."

# Test 1: Validation Error
echo -e "\n1. Testing Validation Error (missing title):"
curl -X POST $BASE_URL/api/calendar \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"event_date":"2026-06-15"}'

# Test 2: Not Found Error
echo -e "\n2. Testing Not Found Error:"
curl -X GET $BASE_URL/api/calendar/invalid-id \
  -H "Authorization: Bearer $TOKEN"

# Test 3: Unauthorized Error
echo -e "\n3. Testing Unauthorized Error:"
curl -X GET $BASE_URL/api/calendar

# Test 4: Empty State
echo -e "\n4. Testing Empty State (future date):"
curl -X GET "$BASE_URL/api/calendar?from=2099-01-01&to=2099-12-31" \
  -H "Authorization: Bearer $TOKEN"

# Test 5: Successful Creation
echo -e "\n5. Testing Successful Creation:"
curl -X POST $BASE_URL/api/calendar \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title":"Test Event",
    "event_date":"2026-06-15",
    "event_type":"MEETING"
  }'

echo -e "\n\nTests complete!"
```

---

## Verification Checklist

- [ ] All utility files created (errorHandler, connectionHandler, responseHandler)
- [ ] Error middleware created and registered in app.ts
- [ ] Response middleware registered before routes
- [ ] Connection health middleware registered
- [ ] ConnectionManager initialized on startup
- [ ] Graceful shutdown handlers configured
- [ ] All route handlers wrapped in asyncHandler or try-catch
- [ ] Input validation implemented for all routes
- [ ] Empty state handling implemented
- [ ] Ownership authorization checks in place
- [ ] Error logging verified
- [ ] Prisma error codes mapped
- [ ] Process-level error handlers configured
- [ ] Test cases executed and passing

---

## Next Steps

1. **Copy utility files** to your src directory
2. **Update app.ts** with the integration steps above
3. **Update route handlers** to use new error classes
4. **Test error scenarios** using the test script
5. **Monitor logs** to verify error handling is working
6. **Update documentation** for your team

---

## Support

For detailed information on each component, see **ERROR_HANDLING_GUIDE.md**

