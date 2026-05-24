# How to Apply Robust Error Handling to All Routes

**Goal:** Update `calendar.routes.js` and `notes.routes.js` to NEVER return 500 errors.

---

## What Needs to Be Fixed

### Current State
All catch blocks return generic 500 errors:
```javascript
} catch (error) {
  console.error('[Error]:', error);
  res.status(500).json(
    ApiResponse.error('Failed to do operation', null, 500)  // ❌ WRONG
  );
}
```

### New State
All catch blocks map to specific 4xx errors:
```javascript
} catch (error) {
  console.error('[Error]:', error.code);
  
  if (error.code === 'P2025') return res.status(404).json(...);
  if (error.code === 'P2003') return res.status(400).json(...);
  if (error.code === 'P2002') return res.status(409).json(...);
  
  res.status(400).json(ApiResponse.error('Invalid request', null, 400));
}
```

---

## Files to Update

### 1. `/src/routes/calendar.routes.js`

**Endpoints to fix:**

1. ✅ `GET /api/calendar` - ALREADY FIXED (see line 123-267)
2. ⏳ `POST /api/calendar` - NEEDS UPDATE (line 273-330)
3. ⏳ `GET /api/calendar/:eventId` - NEEDS UPDATE (line 336-381)
4. ⏳ `PATCH /api/calendar/:eventId` - NEEDS UPDATE (line 387-451)
5. ⏳ `DELETE /api/calendar/:eventId` - NEEDS UPDATE (line 457-503)
6. ⏳ `GET /api/calendar/upcoming` - NEEDS UPDATE (line 509-562)

**Pattern for each endpoint:**
- Start with validation
- Check authentication
- Check authorization (ownership)
- Validate all inputs
- Catch database errors specifically
- Map Prisma codes to 4xx
- Return 4xx as fallback

---

### 2. `/src/routes/notes.routes.js`

**Endpoints to fix:**

1. ⏳ `GET /api/personal-notes` - NEEDS UPDATE
2. ⏳ `POST /api/personal-notes` - NEEDS UPDATE
3. ⏳ `GET /api/personal-notes/:noteId` - NEEDS UPDATE
4. ⏳ `PATCH /api/personal-notes/:noteId` - NEEDS UPDATE
5. ⏳ `DELETE /api/personal-notes/:noteId` - NEEDS UPDATE
6. ⏳ `DELETE /api/personal-notes/:noteId/permanent` - NEEDS UPDATE
7. ⏳ `GET /api/personal-notes/stats/summary` - NEEDS UPDATE

**Same pattern as calendar routes**

---

## Template for Each Endpoint

### GET LIST (with filters/pagination)

```javascript
router.get('/path', verifyToken, async (req, res) => {
  try {
    // === AUTH ===
    const agentId = req.user?.id;
    if (!agentId) return res.status(401).json(ApiResponse.error('Not authenticated', null, 401));

    // === EXTRACT INPUT ===
    const { page = 1, limit = 50, ...filters } = req.query;

    // === VALIDATE PAGINATION ===
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50;
    if (pageNum < 1) return res.status(400).json(ApiResponse.error('Page >= 1', null, 400));
    if (limitNum < 1 || limitNum > 1000) return res.status(400).json(ApiResponse.error('Limit 1-1000', null, 400));

    // === VALIDATE FILTERS ===
    // ... validate each filter ...

    // === BUILD QUERY ===
    const where = { agent_id: agentId, deleted_at: null, ...filterWhere };

    // === EXECUTE ===
    const [total, items] = await Promise.all([
      prisma.table.count({ where }).catch(() => 0),
      prisma.table.findMany({ where, skip: (pageNum - 1) * limitNum, take: limitNum }).catch(() => [])
    ]);

    // === FORMAT ===
    const formatted = items.map(item => {
      try {
        return formatItem(item);
      } catch (err) {
        console.error('[Format Error]:', err);
        return null;
      }
    }).filter(Boolean);

    // === RESPONSE ===
    res.status(200).json(ApiResponse.success(
      `Found ${formatted.length} items`,
      {
        results: formatted,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.max(1, Math.ceil(total / limitNum))
        }
      }
    ));

  } catch (error) {
    console.error('[GET /path Error]:', error.message);
    
    if (error.code === 'P2023') return res.status(400).json(ApiResponse.error('Invalid filters', null, 400));
    
    res.status(400).json(ApiResponse.error('Invalid request', null, 400));
  }
});
```

### POST CREATE

```javascript
router.post('/path', verifyToken, async (req, res) => {
  try {
    // === AUTH ===
    const agentId = req.user?.id;
    if (!agentId) return res.status(401).json(ApiResponse.error('Not authenticated', null, 401));

    // === EXTRACT & VALIDATE ===
    const { field1, field2, ... } = req.body;

    if (!field1 || typeof field1 !== 'string' || !field1.trim()) {
      return res.status(400).json(ApiResponse.error('field1 is required', null, 400));
    }
    if (field1.length > 255) {
      return res.status(400).json(ApiResponse.error('field1 max 255 chars', null, 400));
    }

    // ... validate all other fields ...

    // === CHECK REFERENCES ===
    try {
      const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { id: true } });
      if (!agent) return res.status(401).json(ApiResponse.error('Agent not found', null, 401));
    } catch (err) {
      return res.status(401).json(ApiResponse.error('Failed to verify agent', null, 401));
    }

    // === CREATE ===
    let item;
    try {
      item = await prisma.table.create({
        data: {
          field1: field1.trim(),
          field2: field2 || null,
          agent_id: agentId,
        }
      });
    } catch (err) {
      console.error('[Create Error]:', err.code);

      if (err.code === 'P2003') return res.status(400).json(ApiResponse.error('Referenced resource not found', null, 400));
      if (err.code === 'P2002') return res.status(409).json(ApiResponse.error('Duplicate entry', null, 409));

      return res.status(400).json(ApiResponse.error('Failed to create', null, 400));
    }

    // === FORMAT & RETURN ===
    const formatted = formatItem(item);
    res.status(201).json(ApiResponse.success('Created', formatted, 201));

  } catch (error) {
    console.error('[POST /path Error]:', error.message);
    res.status(400).json(ApiResponse.error('Invalid request', null, 400));
  }
});
```

### GET by ID

```javascript
router.get('/:id', verifyToken, async (req, res) => {
  try {
    // === AUTH ===
    const agentId = req.user?.id;
    if (!agentId) return res.status(401).json(ApiResponse.error('Not authenticated', null, 401));

    // === VALIDATE ID ===
    const { id } = req.params;
    if (!id || typeof id !== 'string' || !id.trim()) {
      return res.status(400).json(ApiResponse.error('ID is required', null, 400));
    }

    // === FIND ===
    let item;
    try {
      item = await prisma.table.findUnique({ where: { id: id.trim() } });
    } catch (err) {
      console.error('[Find Error]:', err);
      return res.status(400).json(ApiResponse.error('Invalid ID format', null, 400));
    }

    // === CHECK EXISTENCE ===
    if (!item || item.deleted_at) {
      return res.status(404).json(ApiResponse.error('Item not found', null, 404));
    }

    // === AUTHORIZE ===
    if (item.agent_id !== agentId && !req.user?.is_admin) {
      return res.status(403).json(ApiResponse.error('Not authorized', null, 403));
    }

    // === FORMAT & RETURN ===
    const formatted = formatItem(item);
    res.status(200).json(ApiResponse.success('Found', formatted));

  } catch (error) {
    console.error('[GET /:id Error]:', error.message);
    res.status(400).json(ApiResponse.error('Invalid request', null, 400));
  }
});
```

### PATCH UPDATE

```javascript
router.patch('/:id', verifyToken, async (req, res) => {
  try {
    // === AUTH ===
    const agentId = req.user?.id;
    if (!agentId) return res.status(401).json(ApiResponse.error('Not authenticated', null, 401));

    // === VALIDATE ID ===
    const { id } = req.params;
    if (!id || typeof id !== 'string' || !id.trim()) {
      return res.status(400).json(ApiResponse.error('ID is required', null, 400));
    }

    // === FIND ===
    let item;
    try {
      item = await prisma.table.findUnique({ where: { id: id.trim() } });
    } catch (err) {
      return res.status(400).json(ApiResponse.error('Invalid ID format', null, 400));
    }

    // === CHECK EXISTENCE ===
    if (!item || item.deleted_at) {
      return res.status(404).json(ApiResponse.error('Item not found', null, 404));
    }

    // === AUTHORIZE ===
    if (item.agent_id !== agentId && !req.user?.is_admin) {
      return res.status(403).json(ApiResponse.error('Not authorized', null, 403));
    }

    // === VALIDATE UPDATE DATA ===
    const { field1, field2 } = req.body;
    const updateData = {};

    if (field1 !== undefined) {
      if (typeof field1 !== 'string' || !field1.trim()) {
        return res.status(400).json(ApiResponse.error('field1 must be non-empty string', null, 400));
      }
      if (field1.length > 255) {
        return res.status(400).json(ApiResponse.error('field1 max 255 chars', null, 400));
      }
      updateData.field1 = field1.trim();
    }

    // ... validate other fields ...

    // === UPDATE ===
    let updated;
    try {
      updated = await prisma.table.update({ where: { id: id.trim() }, data: updateData });
    } catch (err) {
      console.error('[Update Error]:', err.code);

      if (err.code === 'P2025') return res.status(404).json(ApiResponse.error('Item not found', null, 404));
      if (err.code === 'P2003') return res.status(400).json(ApiResponse.error('Referenced resource not found', null, 400));

      return res.status(400).json(ApiResponse.error('Failed to update', null, 400));
    }

    // === FORMAT & RETURN ===
    const formatted = formatItem(updated);
    res.status(200).json(ApiResponse.success('Updated', formatted));

  } catch (error) {
    console.error('[PATCH /:id Error]:', error.message);
    res.status(400).json(ApiResponse.error('Invalid request', null, 400));
  }
});
```

### DELETE

```javascript
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    // === AUTH ===
    const agentId = req.user?.id;
    if (!agentId) return res.status(401).json(ApiResponse.error('Not authenticated', null, 401));

    // === VALIDATE ID ===
    const { id } = req.params;
    if (!id || typeof id !== 'string' || !id.trim()) {
      return res.status(400).json(ApiResponse.error('ID is required', null, 400));
    }

    // === FIND ===
    let item;
    try {
      item = await prisma.table.findUnique({ where: { id: id.trim() } });
    } catch (err) {
      return res.status(400).json(ApiResponse.error('Invalid ID format', null, 400));
    }

    // === CHECK EXISTENCE ===
    if (!item || item.deleted_at) {
      return res.status(404).json(ApiResponse.error('Item not found', null, 404));
    }

    // === AUTHORIZE ===
    if (item.agent_id !== agentId && !req.user?.is_admin) {
      return res.status(403).json(ApiResponse.error('Not authorized', null, 403));
    }

    // === DELETE (SOFT) ===
    let deleted;
    try {
      deleted = await prisma.table.update({
        where: { id: id.trim() },
        data: { deleted_at: new Date() }
      });
    } catch (err) {
      console.error('[Delete Error]:', err);

      if (err.code === 'P2025') return res.status(404).json(ApiResponse.error('Item not found', null, 404));

      return res.status(400).json(ApiResponse.error('Failed to delete', null, 400));
    }

    // === RETURN SUCCESS ===
    res.status(200).json(ApiResponse.success('Deleted', { id: deleted.id, deleted_at: deleted.deleted_at }));

  } catch (error) {
    console.error('[DELETE /:id Error]:', error.message);
    res.status(400).json(ApiResponse.error('Invalid request', null, 400));
  }
});
```

---

## Checklist for Updating Each Endpoint

- [ ] Replace all 500 errors with 4xx
- [ ] Add input validation
- [ ] Add authentication check
- [ ] Add authorization check (if applicable)
- [ ] Map Prisma error codes
- [ ] Use .catch() for Promise.all()
- [ ] Add try-catch for formatting
- [ ] Validate all date/UUID/enum fields
- [ ] Check field lengths
- [ ] Check required vs optional fields
- [ ] Test with invalid inputs
- [ ] Test with missing auth
- [ ] Test with authorization violations
- [ ] Confirm NO 500 errors returned

---

## Testing Commands

```bash
# Test validation error (400)
curl -X POST http://localhost:3000/api/calendar \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' 2>&1 | jq '.code'
# Should return: VALIDATION_ERROR (400 status)

# Test not found (404)
curl -X GET http://localhost:3000/api/calendar/invalid-id \
  -H "Authorization: Bearer TOKEN" 2>&1 | jq '.code'
# Should return: NOT_FOUND (404 status)

# Test unauthorized (401)
curl -X GET http://localhost:3000/api/calendar 2>&1 | jq '.code'
# Should return: UNAUTHORIZED (401 status)

# Check NO 500 errors in any response
curl -X <METHOD> http://localhost:3000/api/... 2>&1 | grep -i "500\|INTERNAL_SERVER_ERROR"
# Should return: NOTHING
```

---

## Summary

Every endpoint must follow this flow:

```
1. Authenticate (401 if missing)
2. Validate Input (400 if invalid)
3. Authorize (403 if denied)
4. Execute DB (catch Prisma codes)
5. Format Response (catch formatting)
6. Return 2xx or 4xx (NEVER 5xx)
```

**No exceptions. No 500 errors. Ever.**

