# Error Handling Quick Reference

## Quick Start: 5-Minute Integration

### 1. Register Middleware in app.ts

```typescript
import { errorHandler, notFoundHandler, connectionHealthMiddleware } from './middleware/errorMiddleware';
import { responseMiddleware } from './utils/responseHandler';

app.use(express.json());
app.use(responseMiddleware);           // First
app.use(connectionHealthMiddleware);   // Second

// ... your routes ...

app.use(notFoundHandler);              // Before errorHandler
app.use(errorHandler);                 // Last
```

### 2. Initialize Connection on Startup

```typescript
import { ConnectionManager } from './utils/connectionHandler';

async function startServer() {
  try {
    const connectionManager = ConnectionManager.getInstance();
    await connectionManager.initialize();
    
    app.listen(3000);
    console.log('Server started');
  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }
}

startServer();
```

---

## Error Classes Reference

### Throwing Errors

```typescript
import {
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  DatabaseError,
  ConnectionError,
} from './utils/errorHandler';

// 400: Validation error
throw new ValidationError('Title is required', { field: 'title' });

// 401: Authentication required
throw new UnauthorizedError('Token expired');

// 403: Access denied
throw new ForbiddenError('You cannot access this resource');

// 404: Not found
throw new NotFoundError('Event', eventId);

// 500: Database error
throw new DatabaseError('Failed to create event', { query: '...' });

// 503: Connection error (with retry info)
throw new ConnectionError('Database connection lost', true, 2);
```

---

## Response Methods Reference

### Success Responses

```typescript
// Basic success
res.apiSuccess(data, 'Operation successful', 'SUCCESS');

// Created response (201)
res.apiCreated(newEvent, 'Event created');

// Updated response (200)
res.apiUpdated(updatedEvent, 'Event updated');

// Deleted response (200)
res.apiDeleted('Event deleted');

// Paginated response
res.apiPaginated(
  results,
  { total: 100, page: 1, limit: 50, pages: 2 },
  'Found 100 events'
);

// Empty response
res.apiEmpty('No events found', 'NO_RESULTS');
res.apiEmpty('No results', 'NO_RESULTS', pagination);
```

### Error Responses

```typescript
// Generic error
res.apiError('Operation failed', 'ERROR', 400);

// Validation error
res.apiValidationError({ title: 'Title required', date: 'Invalid date' });

// Not found
res.apiNotFound('Event', eventId);

// Unauthorized
res.apiUnauthorized('Authentication required');

// Forbidden
res.apiForbidden('Access denied');

// Server error
res.apiServerError('Internal error');

// Service unavailable
res.apiUnavailable('Database temporarily unavailable');
```

---

## Common Patterns

### Pattern 1: Create with Validation

```typescript
router.post('/api/calendar', verifyToken, asyncHandler(async (req, res) => {
  // Validate
  const { title, event_date } = req.body;
  if (!title) throw new ValidationError('Title required');
  if (!event_date) throw new ValidationError('Event date required');

  // Create
  const event = await prisma.event.create({
    data: { title, event_date, agent_id: req.user.id },
  });

  // Respond
  res.apiCreated(event, 'Event created');
}));
```

### Pattern 2: Get with Authorization

```typescript
router.get('/api/calendar/:id', verifyToken, asyncHandler(async (req, res) => {
  // Find
  const event = await prisma.event.findUnique({
    where: { id: req.params.id },
  });
  if (!event) throw new NotFoundError('Event', req.params.id);

  // Authorize
  if (event.agent_id !== req.user.id && !req.user.is_admin) {
    throw new ForbiddenError('Cannot access this event');
  }

  // Respond
  res.apiSuccess(event, 'Event retrieved');
}));
```

### Pattern 3: List with Empty State

```typescript
router.get('/api/calendar', verifyToken, asyncHandler(async (req, res) => {
  // Query
  const events = await prisma.event.findMany({
    where: { agent_id: req.user.id, deleted_at: null },
  });

  // Check empty
  if (events.length === 0) {
    return res.apiEmpty('No events found', 'NO_RESULTS');
  }

  // Respond
  res.apiSuccess(events, `Found ${events.length} events`);
}));
```

### Pattern 4: Update with Ownership Check

```typescript
router.patch('/api/calendar/:id', verifyToken, asyncHandler(async (req, res) => {
  // Find
  const event = await prisma.event.findUnique({
    where: { id: req.params.id },
  });
  if (!event) throw new NotFoundError('Event', req.params.id);

  // Check ownership
  if (event.agent_id !== req.user.id && !req.user.is_admin) {
    throw new ForbiddenError('Cannot update this event');
  }

  // Update
  const updated = await prisma.event.update({
    where: { id: req.params.id },
    data: req.body,
  });

  // Respond
  res.apiUpdated(updated, 'Event updated');
}));
```

### Pattern 5: Delete with Soft Delete

```typescript
router.delete('/api/calendar/:id', verifyToken, asyncHandler(async (req, res) => {
  // Find
  const event = await prisma.event.findUnique({
    where: { id: req.params.id },
  });
  if (!event) throw new NotFoundError('Event', req.params.id);

  // Check ownership
  if (event.agent_id !== req.user.id && !req.user.is_admin) {
    throw new ForbiddenError('Cannot delete this event');
  }

  // Soft delete
  await prisma.event.update({
    where: { id: req.params.id },
    data: { deleted_at: new Date() },
  });

  // Respond
  res.apiDeleted('Event deleted');
}));
```

### Pattern 6: Retry on Connection Error

```typescript
import { RetryHandler } from './utils/errorHandler';

router.get('/api/stats', asyncHandler(async (req, res) => {
  const stats = await RetryHandler.retry(
    () => prisma.event.count(),
    3,      // max retries
    1000,   // delay ms
    true    // exponential backoff
  );

  res.apiSuccess({ count: stats });
}));
```

---

## Error Response Examples

### Validation Error Response
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
  "requestId": "req_1716550200000_abc123"
}
```

### Not Found Response
```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Event with ID 'event-123' not found",
  "timestamp": "2026-05-24T10:30:00Z",
  "requestId": "req_1716550200000_abc123"
}
```

### Unauthorized Response
```json
{
  "success": false,
  "code": "UNAUTHORIZED",
  "message": "Authentication required",
  "timestamp": "2026-05-24T10:30:00Z",
  "requestId": "req_1716550200000_abc123"
}
```

### Forbidden Response
```json
{
  "success": false,
  "code": "FORBIDDEN",
  "message": "You do not have access to this event",
  "timestamp": "2026-05-24T10:30:00Z",
  "requestId": "req_1716550200000_abc123"
}
```

### Empty State Response
```json
{
  "success": true,
  "code": "NO_RESULTS",
  "message": "No events found for the requested date range",
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

### Success with Pagination
```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "Found 10 events",
  "data": {
    "results": [
      {
        "id": "event-123",
        "title": "Client Meeting",
        "event_date": "2026-06-15"
      }
    ],
    "pagination": {
      "total": 10,
      "page": 1,
      "limit": 50,
      "pages": 1
    }
  },
  "timestamp": "2026-05-24T10:30:00Z"
}
```

---

## HTTP Status Codes

| Code | Error Class | When to Use |
|------|-------------|------------|
| 200 | N/A | Successful GET, PATCH, DELETE |
| 201 | N/A | Successful POST (creation) |
| 400 | ValidationError | Invalid input data |
| 401 | UnauthorizedError | Missing/invalid authentication |
| 403 | ForbiddenError | Valid auth but no permission |
| 404 | NotFoundError | Resource doesn't exist |
| 409 | ConflictError | Duplicate resource |
| 500 | DatabaseError | Database operation failed |
| 503 | ConnectionError | Database unavailable |

---

## Helper Functions

### Check if Empty
```typescript
import { isEmpty } from './utils/responseHandler';

if (isEmpty(events)) {
  return res.apiEmpty('No events found');
}
```

### Calculate Pagination
```typescript
import { calculatePagination } from './utils/responseHandler';

const pagination = calculatePagination(total, page, limit);
// { total: 100, page: 1, limit: 50, pages: 2 }
```

### Async Handler Wrapper
```typescript
import { asyncHandler } from './utils/errorHandler';

router.get('/api/calendar/:id', asyncHandler(async (req, res) => {
  // Any thrown error is automatically caught by middleware
  throw new NotFoundError('Event');
}));
```

### Retry Handler
```typescript
import { RetryHandler } from './utils/errorHandler';

const result = await RetryHandler.retry(
  async () => await riskyOperation(),
  3,      // max retries
  1000,   // initial delay
  true    // exponential backoff
);
```

---

## Testing with Curl

```bash
# Set token
TOKEN="your-jwt-token"

# Test validation error
curl -X POST http://localhost:3000/api/calendar \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' 2>&1 | jq

# Test not found
curl -X GET http://localhost:3000/api/calendar/invalid \
  -H "Authorization: Bearer $TOKEN" 2>&1 | jq

# Test unauthorized
curl -X GET http://localhost:3000/api/calendar 2>&1 | jq

# Test empty state
curl -X GET "http://localhost:3000/api/calendar?from=2099-01-01&to=2099-12-31" \
  -H "Authorization: Bearer $TOKEN" 2>&1 | jq

# Test successful creation
curl -X POST http://localhost:3000/api/calendar \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Meeting",
    "event_date": "2026-06-15",
    "event_type": "MEETING"
  }' 2>&1 | jq
```

---

## Logging

### View Error Logs
```bash
# Recent errors
tail -f /var/log/app.log | grep "Error\|error"

# Database errors
tail -f /var/log/app.log | grep "DatabaseError"

# Connection errors
tail -f /var/log/app.log | grep "ConnectionError"
```

### Log Format
```
[Timestamp] [ErrorType] {
  "message": "...",
  "code": "...",
  "context": {...},
  "stack": "..."
}
```

---

## Checklist

Before deploying, ensure:

- [ ] All error middleware registered
- [ ] Connection manager initialized
- [ ] All route handlers have try-catch or asyncHandler
- [ ] All input validated
- [ ] Empty states handled
- [ ] Ownership checks in place
- [ ] Graceful shutdown configured
- [ ] Error logging verified
- [ ] Prisma errors mapped
- [ ] Process handlers configured
- [ ] Tests passing
- [ ] Team trained on patterns

---

## Summary

**4 Key Components:**

1. **errorHandler.ts** - Custom error classes
2. **connectionHandler.ts** - Database connection management
3. **responseHandler.ts** - Standardized responses
4. **errorMiddleware.ts** - Centralized error handling

**3 Key Patterns:**

1. Throw custom errors
2. Use res.api* methods
3. Always validate input

**Always:**

✅ Handle empty states
✅ Check ownership
✅ Log errors
✅ Retry on connection errors
✅ Use appropriate status codes

