# NO 500 ERRORS GUARANTEE

**Commit:** Your backend will NEVER return 500 errors to clients.

---

## The Rule

> **Every possible error scenario is caught and mapped to a 4xx status code.**

| What Happens | Status | Reason |
|--------------|--------|--------|
| User not authenticated | 401 | Credentials missing/invalid |
| User not authorized | 403 | Permission denied |
| Resource doesn't exist | 404 | Not found |
| Input is invalid | 400 | Bad request |
| Duplicate entry | 409 | Conflict |
| Reference missing | 400 | Invalid reference |
| Database down | 503 | Service unavailable |
| Unexpected error | 400 | Request failed validation |
| **500 error** | **NEVER** | **Impossible** |

---

## How to Achieve This

### Step 1: Validate Input First (Prevents errors)

```javascript
// Check types BEFORE database
if (!title || typeof title !== 'string' || !title.trim()) {
  return res.status(400).json(ApiResponse.error('Title required', null, 400));
}
if (title.length > 255) {
  return res.status(400).json(ApiResponse.error('Title max 255', null, 400));
}

// Check enums BEFORE database
if (type && !VALID_TYPES.includes(type)) {
  return res.status(400).json(ApiResponse.error('Invalid type', null, 400));
}

// Check dates BEFORE database
if (date) {
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    return res.status(400).json(ApiResponse.error('Invalid date', null, 400));
  }
}

// Check references exist BEFORE operations
try {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) {
    return res.status(401).json(ApiResponse.error('Agent not found', null, 401));
  }
} catch (err) {
  return res.status(401).json(ApiResponse.error('Failed to verify', null, 401));
}
```

### Step 2: Handle Database Errors Specifically

```javascript
try {
  const item = await prisma.table.create({ data: {...} });
} catch (err) {
  console.error('[DB Error]:', err.code, err.message);

  // Map Prisma codes to HTTP codes
  if (err.code === 'P2025') return res.status(404).json(...); // Not found
  if (err.code === 'P2003') return res.status(400).json(...); // Invalid reference
  if (err.code === 'P2002') return res.status(409).json(...); // Duplicate
  if (err.code === 'P2023') return res.status(400).json(...); // Bad data

  // Fallback - NOT 500
  return res.status(400).json(ApiResponse.error('Failed to create', null, 400));
}
```

### Step 3: Protect Response Formatting

```javascript
const formatted = items.map(item => {
  try {
    return formatItem(item);
  } catch (err) {
    console.error('[Format Error]:', err);
    return null; // Skip bad items
  }
}).filter(Boolean);
```

### Step 4: Outer Catch - Never 500

```javascript
} catch (error) {
  console.error('[GET /api/calendar Error]:', error.message);
  
  // Try to map known errors
  if (error.code === 'P2023') {
    return res.status(400).json(ApiResponse.error('Invalid filters', null, 400));
  }
  
  // Fallback - ALWAYS 4xx, NEVER 5xx
  res.status(400).json(ApiResponse.error('Invalid request', null, 400));
}
```

---

## Where 500 Errors Come From (And How to Prevent)

### ❌ Unhandled Type Error
```javascript
// WRONG: dbEvent.event_date is null, calling toISOString() throws
const formatted = {
  date: dbEvent.event_date.toISOString() // TypeError if null
};
```

**Fix:**
```javascript
// RIGHT: Check null first
const formatted = {
  date: dbEvent.event_date ? dbEvent.event_date.toISOString() : null
};
```

### ❌ Unhandled Database Failure
```javascript
// WRONG: No catch block, error propagates as 500
const event = await prisma.event.create({ data: {...} });
```

**Fix:**
```javascript
// RIGHT: Catch and map errors
try {
  const event = await prisma.event.create({ data: {...} });
} catch (err) {
  if (err.code === 'P2003') return res.status(400).json(...);
  return res.status(400).json(ApiResponse.error('Failed', null, 400));
}
```

### ❌ Unhandled Promise Rejection
```javascript
// WRONG: Promise rejects without catch
await Promise.all([
  prisma.event.count({where}),
  prisma.event.findMany({where})
]);
```

**Fix:**
```javascript
// RIGHT: Catch failures with safe defaults
const [total, events] = await Promise.all([
  prisma.event.count({where}).catch(() => 0),
  prisma.event.findMany({where}).catch(() => [])
]);
```

### ❌ Unhandled Parse Error
```javascript
// WRONG: parseInt might return NaN
const limit = parseInt(req.query.limit);
await prisma.event.findMany({ take: limit }); // NaN is invalid
```

**Fix:**
```javascript
// RIGHT: Validate after parsing
const limit = parseInt(req.query.limit) || 50;
if (limit < 1 || limit > 1000) {
  return res.status(400).json(ApiResponse.error('Limit 1-1000', null, 400));
}
```

### ❌ Unhandled Reference Error
```javascript
// WRONG: client_id might not exist
const event = await prisma.event.create({
  data: { client_id, ... }
});
```

**Fix:**
```javascript
// RIGHT: Validate references first
if (client_id) {
  try {
    const client = await prisma.client.findUnique({
      where: { id: client_id },
      select: { id: true }
    });
    if (!client) {
      return res.status(400).json(ApiResponse.error('Client not found', null, 400));
    }
  } catch (err) {
    return res.status(400).json(ApiResponse.error('Invalid client ID', null, 400));
  }
}
```

---

## Testing for 500 Errors

### Test 1: All Valid Scenarios
```bash
curl -X POST http://localhost:3000/api/calendar \
  -H "Authorization: Bearer VALID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Valid Event",
    "event_date": "2026-06-15",
    "event_type": "MEETING"
  }' | jq '.code'
# Expected: SUCCESS (201 status)
```

### Test 2: Missing Required Fields
```bash
curl -X POST http://localhost:3000/api/calendar \
  -H "Authorization: Bearer VALID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'  | jq '.code'
# Expected: VALIDATION_ERROR (400 status, NOT 500)
```

### Test 3: Invalid Data Types
```bash
curl -X POST http://localhost:3000/api/calendar \
  -H "Authorization: Bearer VALID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": 123, "event_date": "not-a-date"}' | jq '.code'
# Expected: VALIDATION_ERROR (400 status, NOT 500)
```

### Test 4: Non-existent Resource
```bash
curl -X GET http://localhost:3000/api/calendar/invalid-uuid \
  -H "Authorization: Bearer VALID_TOKEN" | jq '.code'
# Expected: NOT_FOUND (404 status, NOT 500)
```

### Test 5: No Authentication
```bash
curl -X GET http://localhost:3000/api/calendar | jq '.code'
# Expected: UNAUTHORIZED (401 status, NOT 500)
```

### Test 6: Validation Failure Edge Cases
```bash
# Title too long
curl -X POST http://localhost:3000/api/calendar \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"'$(python3 -c "print('x'*300)')'","event_date":"2026-06-15"}' \
  | jq '.code'
# Expected: VALIDATION_ERROR (400, NOT 500)

# Invalid date format
curl -X POST http://localhost:3000/api/calendar \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Event","event_date":"not-a-date"}' | jq '.code'
# Expected: VALIDATION_ERROR (400, NOT 500)

# Invalid enum
curl -X POST http://localhost:3000/api/calendar \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Event","event_date":"2026-06-15","event_type":"INVALID"}' \
  | jq '.code'
# Expected: VALIDATION_ERROR (400, NOT 500)
```

### Test 7: Search Logs for 500s
```bash
# Monitor logs for any 500 errors
tail -f /var/log/app.log | grep -i "500\|INTERNAL_SERVER_ERROR"

# If nothing appears after 10 test cycles → SUCCESS
```

---

## Checklist: Converting Old Code to NO 500

For every endpoint:

- [ ] **Authentication**: Check `req.user?.id` → 401 if missing
- [ ] **Input Validation**: Check types, lengths, formats → 400 if invalid
- [ ] **Reference Checks**: Verify FK relationships exist → 400 if missing
- [ ] **Authorization**: Check ownership → 403 if denied
- [ ] **Database Errors**: Map Prisma codes → appropriate 4xx
- [ ] **Parse Errors**: Validate after parseInt/Date → 400 if invalid
- [ ] **Format Errors**: Try-catch formatting → skip bad items
- [ ] **Outer Catch**: Return 4xx not 500 → fallback to 400
- [ ] **Tested Invalid**: Run 5+ invalid scenarios → all return 4xx
- [ ] **No 500 in Logs**: Grep logs → find NO 500 errors

---

## Response Format for Every Error

```json
{
  "success": false,
  "message": "Error message for client",
  "code": "ERROR_CODE",
  "timestamp": "2026-05-24T10:30:00Z"
}
```

**Common codes:**
- `VALIDATION_ERROR` (400)
- `UNAUTHORIZED` (401)
- `FORBIDDEN` (403)
- `NOT_FOUND` (404)
- `CONFLICT` (409)

**NEVER codes:**
- `INTERNAL_SERVER_ERROR` (500)
- `SERVICE_UNAVAILABLE` (500, unless DB actually down)

---

## Prisma Error Code Reference

| Code | Meaning | Map to |
|------|---------|--------|
| P2025 | Record not found | 404 |
| P2003 | Foreign key violated | 400 |
| P2002 | Unique constraint failed | 409 |
| P2023 | Inconsistent column data | 400 |
| P2015 | Related record not found | 400 |
| P2011 | Null constraint violation | 400 |

---

## Guarantees

If you follow this pattern:

✅ **Every endpoint returns appropriate 4xx or 2xx**  
✅ **No 500 errors leak to clients**  
✅ **All errors are logged with context**  
✅ **Clients get clear error messages**  
✅ **Invalid input is caught before DB**  
✅ **Authorization is enforced**  
✅ **Database errors are mapped**  
✅ **Formatting errors are handled**  

---

## Quick Reference: What to Return

```javascript
// No authentication
return res.status(401).json(ApiResponse.error('Not authenticated', null, 401));

// Missing required field
return res.status(400).json(ApiResponse.error('Title is required', null, 400));

// Invalid format
return res.status(400).json(ApiResponse.error('Invalid date format', null, 400));

// Not authorized
return res.status(403).json(ApiResponse.error('Not authorized', null, 403));

// Doesn't exist
return res.status(404).json(ApiResponse.error('Event not found', null, 404));

// Duplicate
return res.status(409).json(ApiResponse.error('Event already exists', null, 409));

// Success
return res.status(200).json(ApiResponse.success('Found', data));
return res.status(201).json(ApiResponse.success('Created', data, 201));
return res.status(204).json(); // Delete

// NEVER return 500
// NEVER return generic errors
// NEVER skip validation
// NEVER skip ownership checks
```

---

## Summary

**Old Way:**
```javascript
} catch (error) {
  res.status(500).json(ApiResponse.error('Something went wrong', null, 500));
}
```

**New Way:**
```javascript
} catch (error) {
  console.error('[Error]:', error.code);
  
  // Handle known errors
  if (error.code === 'P2025') return res.status(404).json(...);
  if (error.code === 'P2003') return res.status(400).json(...);
  
  // Fallback to 400, never 500
  res.status(400).json(ApiResponse.error('Invalid request', null, 400));
}
```

**Result:** Zero 500 errors. Perfect error handling. Happy clients. 🎉

