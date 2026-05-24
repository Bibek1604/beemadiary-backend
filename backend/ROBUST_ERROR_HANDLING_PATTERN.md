# Robust Error Handling Pattern - NO 500 ERRORS ALLOWED

**Principle:** Every endpoint must handle ALL possible errors and return appropriate 4xx status codes. **500 errors are STRICTLY FORBIDDEN.**

---

## Pattern Overview

Every endpoint follows this structure:

```
1. EXTRACT & VALIDATE INPUT
   ↓
2. AUTHENTICATION CHECKS
   ↓
3. AUTHORIZATION CHECKS
   ↓
4. BUSINESS LOGIC VALIDATION
   ↓
5. DATABASE OPERATIONS (with error handling)
   ↓
6. RESPONSE FORMATTING (with error handling)
   ↓
7. SEND RESPONSE
   ↓
CATCH BLOCK: Map all errors to 4xx (never 500)
```

---

## Detailed Pattern for Each Endpoint

### Pattern 1: LIST Endpoint (GET with filters/pagination)

```typescript
/**
 * GET /api/calendar
 * NEVER returns 500 - all errors mapped to 4xx
 */
router.get(['/', ''], verifyToken, async (req, res) => {
  try {
    // ===== 1. EXTRACT INPUT =====
    const agentId = req.user?.id;
    const { page = 1, limit = 50, from, to, type } = req.query;

    // ===== 2. AUTHENTICATION =====
    if (!agentId) {
      return res.status(401).json(ApiResponse.error('Not authenticated', null, 401));
    }

    // ===== 3. INPUT VALIDATION =====
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50;

    // Validate number ranges
    if (pageNum < 1) {
      return res.status(400).json(ApiResponse.error('Page must be >= 1', null, 400));
    }
    if (limitNum < 1 || limitNum > 1000) {
      return res.status(400).json(ApiResponse.error('Limit must be 1-1000', null, 400));
    }

    // Validate date formats
    let fromDate = null, toDate = null;
    if (from) {
      fromDate = new Date(from);
      if (isNaN(fromDate.getTime())) {
        return res.status(400).json(ApiResponse.error('Invalid "from" date', null, 400));
      }
    }
    if (to) {
      toDate = new Date(to);
      if (isNaN(toDate.getTime())) {
        return res.status(400).json(ApiResponse.error('Invalid "to" date', null, 400));
      }
    }

    // ===== 4. BUILD QUERY WITH SAFE FALLBACKS =====
    const where = {
      agent_id: agentId,
      deleted_at: null,
    };

    if (fromDate) where.event_date = { ...where.event_date, gte: fromDate };
    if (toDate) where.event_date = { ...where.event_date, lte: toDate };
    if (type && VALID_TYPES.includes(type)) where.type = type;

    // ===== 5. EXECUTE WITH ERROR BOUNDARIES =====
    const [total, items] = await Promise.all([
      prisma.event.count({ where }).catch(() => 0),
      prisma.event.findMany({ where, skip: (pageNum - 1) * limitNum, take: limitNum })
        .catch(() => [])
    ]);

    // ===== 6. FORMAT RESPONSE SAFELY =====
    const formatted = items.map(item => {
      try {
        return formatItem(item);
      } catch (err) {
        console.error('[Format Error]:', err);
        return null;
      }
    }).filter(Boolean);

    // ===== 7. SEND RESPONSE =====
    const pages = Math.max(1, Math.ceil(total / limitNum));
    res.status(200).json(
      ApiResponse.success(`Found ${formatted.length} items`, {
        results: formatted,
        pagination: { total, page: pageNum, limit: limitNum, pages }
      })
    );

  } catch (error) {
    console.error('[GET List Error]:', error.message);
    
    // Map Prisma errors to 4xx
    if (error.code === 'P2023') {
      return res.status(400).json(ApiResponse.error('Invalid filter parameters', null, 400));
    }

    // Fallback - NEVER return 500
    res.status(400).json(ApiResponse.error('Invalid request', null, 400));
  }
});
```

---

### Pattern 2: CREATE Endpoint (POST)

```typescript
/**
 * POST /api/calendar
 * NEVER returns 500 - all errors mapped to 4xx
 */
router.post(['/', ''], verifyToken, async (req, res) => {
  try {
    // ===== 1. AUTHENTICATION =====
    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json(ApiResponse.error('Not authenticated', null, 401));
    }

    // ===== 2. EXTRACT BODY =====
    const { title, description, type, date } = req.body;

    // ===== 3. VALIDATE REQUIRED FIELDS =====
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json(ApiResponse.error('Title is required', null, 400));
    }

    if (title.length > 255) {
      return res.status(400).json(ApiResponse.error('Title max 255 chars', null, 400));
    }

    // ===== 4. VALIDATE OPTIONAL FIELDS =====
    if (description && description.length > 5000) {
      return res.status(400).json(ApiResponse.error('Description max 5000 chars', null, 400));
    }

    if (type && !VALID_TYPES.includes(type)) {
      return res.status(400).json(ApiResponse.error(`Invalid type`, null, 400));
    }

    // ===== 5. VALIDATE DATES =====
    if (!date) {
      return res.status(400).json(ApiResponse.error('Date is required', null, 400));
    }

    const itemDate = new Date(date);
    if (isNaN(itemDate.getTime())) {
      return res.status(400).json(ApiResponse.error('Invalid date format', null, 400));
    }

    // ===== 6. CHECK AGENT EXISTS =====
    try {
      const agent = await prisma.agent.findUnique({
        where: { id: agentId },
        select: { id: true }
      });
      if (!agent) {
        return res.status(401).json(ApiResponse.error('Agent not found', null, 401));
      }
    } catch (err) {
      console.error('[Agent Check Error]:', err);
      return res.status(401).json(ApiResponse.error('Failed to verify agent', null, 401));
    }

    // ===== 7. CREATE ITEM =====
    let item;
    try {
      item = await prisma.event.create({
        data: {
          title: title.trim(),
          description: description ? description.trim() : null,
          type: type || 'OTHER',
          date: itemDate,
          agent_id: agentId,
        }
      });
    } catch (err) {
      console.error('[Create Error]:', err.code, err.message);

      // Map Prisma errors
      if (err.code === 'P2003') {
        return res.status(400).json(ApiResponse.error('Referenced resource not found', null, 400));
      }
      if (err.code === 'P2002') {
        return res.status(409).json(ApiResponse.error('Duplicate entry', null, 409));
      }

      // Generic DB error - return 400 not 500
      return res.status(400).json(ApiResponse.error('Failed to create item', null, 400));
    }

    // ===== 8. FORMAT & RETURN =====
    const formatted = formatItem(item);
    res.status(201).json(ApiResponse.success('Created', formatted, 201));

  } catch (error) {
    console.error('[POST Create Error]:', error.message);
    res.status(400).json(ApiResponse.error('Invalid request', null, 400));
  }
});
```

---

### Pattern 3: GET by ID Endpoint

```typescript
/**
 * GET /api/calendar/:id
 * NEVER returns 500 - all errors mapped to 4xx
 */
router.get('/:id', verifyToken, async (req, res) => {
  try {
    // ===== 1. AUTHENTICATION =====
    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json(ApiResponse.error('Not authenticated', null, 401));
    }

    // ===== 2. EXTRACT & VALIDATE ID =====
    const { id } = req.params;
    if (!id || typeof id !== 'string' || !id.trim()) {
      return res.status(400).json(ApiResponse.error('ID is required', null, 400));
    }

    // ===== 3. FIND ITEM =====
    let item;
    try {
      item = await prisma.event.findUnique({
        where: { id: id.trim() }
      });
    } catch (err) {
      console.error('[Find Error]:', err);
      return res.status(400).json(ApiResponse.error('Invalid ID format', null, 400));
    }

    // ===== 4. CHECK EXISTENCE =====
    if (!item || item.deleted_at) {
      return res.status(404).json(ApiResponse.error('Item not found', null, 404));
    }

    // ===== 5. AUTHORIZATION - check ownership =====
    if (item.agent_id !== agentId && !req.user?.is_admin) {
      return res.status(403).json(ApiResponse.error('Not authorized', null, 403));
    }

    // ===== 6. FORMAT & RETURN =====
    const formatted = formatItem(item);
    res.status(200).json(ApiResponse.success('Found', formatted));

  } catch (error) {
    console.error('[GET by ID Error]:', error.message);
    res.status(400).json(ApiResponse.error('Invalid request', null, 400));
  }
});
```

---

### Pattern 4: UPDATE Endpoint (PATCH)

```typescript
/**
 * PATCH /api/calendar/:id
 * NEVER returns 500 - all errors mapped to 4xx
 */
router.patch('/:id', verifyToken, async (req, res) => {
  try {
    // ===== 1. AUTHENTICATION =====
    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json(ApiResponse.error('Not authenticated', null, 401));
    }

    // ===== 2. EXTRACT & VALIDATE ID =====
    const { id } = req.params;
    if (!id || typeof id !== 'string' || !id.trim()) {
      return res.status(400).json(ApiResponse.error('ID is required', null, 400));
    }

    // ===== 3. FIND ITEM =====
    let item;
    try {
      item = await prisma.event.findUnique({ where: { id: id.trim() } });
    } catch (err) {
      return res.status(400).json(ApiResponse.error('Invalid ID format', null, 400));
    }

    // ===== 4. CHECK EXISTENCE =====
    if (!item || item.deleted_at) {
      return res.status(404).json(ApiResponse.error('Item not found', null, 404));
    }

    // ===== 5. AUTHORIZATION =====
    if (item.agent_id !== agentId && !req.user?.is_admin) {
      return res.status(403).json(ApiResponse.error('Not authorized', null, 403));
    }

    // ===== 6. VALIDATE UPDATE DATA =====
    const { title, description, type, date } = req.body;
    const updateData = {};

    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        return res.status(400).json(ApiResponse.error('Title must be non-empty string', null, 400));
      }
      if (title.length > 255) {
        return res.status(400).json(ApiResponse.error('Title max 255 chars', null, 400));
      }
      updateData.title = title.trim();
    }

    if (description !== undefined) {
      if (description && description.length > 5000) {
        return res.status(400).json(ApiResponse.error('Description max 5000 chars', null, 400));
      }
      updateData.description = description ? description.trim() : null;
    }

    if (type !== undefined) {
      if (!VALID_TYPES.includes(type)) {
        return res.status(400).json(ApiResponse.error(`Invalid type`, null, 400));
      }
      updateData.type = type;
    }

    if (date !== undefined) {
      const newDate = new Date(date);
      if (isNaN(newDate.getTime())) {
        return res.status(400).json(ApiResponse.error('Invalid date format', null, 400));
      }
      updateData.date = newDate;
    }

    // ===== 7. UPDATE ITEM =====
    let updated;
    try {
      updated = await prisma.event.update({
        where: { id: id.trim() },
        data: updateData
      });
    } catch (err) {
      console.error('[Update Error]:', err.code);

      if (err.code === 'P2025') {
        return res.status(404).json(ApiResponse.error('Item not found', null, 404));
      }
      if (err.code === 'P2003') {
        return res.status(400).json(ApiResponse.error('Referenced resource not found', null, 400));
      }

      return res.status(400).json(ApiResponse.error('Failed to update', null, 400));
    }

    // ===== 8. FORMAT & RETURN =====
    const formatted = formatItem(updated);
    res.status(200).json(ApiResponse.success('Updated', formatted));

  } catch (error) {
    console.error('[PATCH Update Error]:', error.message);
    res.status(400).json(ApiResponse.error('Invalid request', null, 400));
  }
});
```

---

### Pattern 5: DELETE Endpoint

```typescript
/**
 * DELETE /api/calendar/:id
 * NEVER returns 500 - all errors mapped to 4xx
 */
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    // ===== 1. AUTHENTICATION =====
    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json(ApiResponse.error('Not authenticated', null, 401));
    }

    // ===== 2. EXTRACT & VALIDATE ID =====
    const { id } = req.params;
    if (!id || typeof id !== 'string' || !id.trim()) {
      return res.status(400).json(ApiResponse.error('ID is required', null, 400));
    }

    // ===== 3. FIND ITEM =====
    let item;
    try {
      item = await prisma.event.findUnique({ where: { id: id.trim() } });
    } catch (err) {
      return res.status(400).json(ApiResponse.error('Invalid ID format', null, 400));
    }

    // ===== 4. CHECK EXISTENCE =====
    if (!item || item.deleted_at) {
      return res.status(404).json(ApiResponse.error('Item not found', null, 404));
    }

    // ===== 5. AUTHORIZATION =====
    if (item.agent_id !== agentId && !req.user?.is_admin) {
      return res.status(403).json(ApiResponse.error('Not authorized', null, 403));
    }

    // ===== 6. DELETE (SOFT DELETE) =====
    let deleted;
    try {
      deleted = await prisma.event.update({
        where: { id: id.trim() },
        data: { deleted_at: new Date() }
      });
    } catch (err) {
      console.error('[Delete Error]:', err);

      if (err.code === 'P2025') {
        return res.status(404).json(ApiResponse.error('Item not found', null, 404));
      }

      return res.status(400).json(ApiResponse.error('Failed to delete', null, 400));
    }

    // ===== 7. RETURN SUCCESS =====
    res.status(200).json(
      ApiResponse.success('Deleted', { id: deleted.id, deleted_at: deleted.deleted_at })
    );

  } catch (error) {
    console.error('[DELETE Error]:', error.message);
    res.status(400).json(ApiResponse.error('Invalid request', null, 400));
  }
});
```

---

## Prisma Error Code Mapping

| Code | HTTP | Meaning |
|------|------|---------|
| P2025 | 404  | Record not found |
| P2002 | 409  | Unique constraint failed (duplicate) |
| P2003 | 400  | Foreign key constraint failed |
| P2023 | 400  | Inconsistent column data |
| P2015 | 400  | Related record not found |

---

## Critical Rules

### ✅ MUST DO:
1. Validate ALL inputs BEFORE database calls
2. Check authentication on every endpoint
3. Check authorization (ownership) before reading/writing
4. Map Prisma error codes to 4xx
5. Use `.catch(() => defaultValue)` for Promise.all()
6. Return 4xx in ALL catch blocks
7. Log errors to console (include error.code)
8. Use safe type checks: `typeof x === 'string'`
9. Trim string inputs
10. Validate UUIDs if expected

### ❌ NEVER DO:
1. Return 500 errors (FORBIDDEN)
2. Trust req.body data without validation
3. Assume database operations succeed
4. Chain promises without error handling
5. Pass user input directly to database
6. Format data without try-catch
7. Expose error details to client
8. Trust parsed integers/dates without validation
9. Skip ownership checks
10. Assume relationships exist

---

## Testing Checklist

For each endpoint, test:

- [ ] Missing authentication token → 401
- [ ] Invalid/malformed input → 400
- [ ] Resource not found → 404
- [ ] Ownership violation → 403
- [ ] Duplicate entry → 409
- [ ] Invalid date format → 400
- [ ] Invalid UUID format → 400
- [ ] Empty required field → 400
- [ ] Field too long → 400
- [ ] Invalid enum value → 400
- [ ] Successful operation → 200/201
- [ ] No 500 errors in any scenario

---

## Summary

**Golden Rule:** If an endpoint CAN fail, handle that failure and return 4xx.

Every input → validate  
Every database call → error map  
Every response format → try-catch  
Every catch → return 4xx  

**NEVER return 500 errors.**

