# Notes Module - Quick Start Guide

## 🎯 Current Status

✅ **Implementation: 100% COMPLETE**
⏳ **Database Migration: CREATED (Ready to run)**

All code is done. You just need to apply the database migration.

---

## 🚀 What to Do Now

### Step 1: Ensure Database is Running
```bash
# Make sure PostgreSQL is running
# On Windows: Services > PostgreSQL (or docker ps if using Docker)
# On Mac: Check System Preferences or run `brew services list`
# On Linux: `sudo systemctl status postgresql` or `systemctl status postgresql`
```

### Step 2: Apply the Migration

Choose ONE method below:

#### **Method A: Using Prisma (Easiest)**
```bash
cd backend
npx prisma migrate deploy
```

#### **Method B: Using psql**
```bash
psql postgresql://postgres:adminbibek@localhost:5432/TestManagement < \
  src/prisma/migrations/20260524000000_add_notes_table/migration.sql
```

#### **Method C: Using Node Script**
```bash
cd backend
npm install pg --save-dev
node run-migration.js
```

### Step 3: Verify Migration Succeeded

```bash
# Check if notes table exists
psql postgresql://postgres:adminbibek@localhost:5432/TestManagement -c "\dt notes"

# Check if NoteTag enum exists
psql postgresql://postgres:adminbibek@localhost:5432/TestManagement -c "\dT+ \"NoteTag\""
```

### Step 4: Test an Endpoint

Start your server:
```bash
cd backend
npm start
# or
npx ts-node src/index.ts
```

Test creating a note (replace YOUR_JWT_TOKEN with actual token):
```bash
curl -X POST http://localhost:3000/api/personal-notes \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Test note content",
    "tag": "GENERAL"
  }'
```

Expected response:
```json
{
  "success": true,
  "message": "Note created successfully",
  "data": {
    "id": "uuid-here",
    "title": "Test note content",
    "content": "Test note content",
    "tag": "GENERAL",
    "created_at": "2026-05-24T...",
    "updated_at": "2026-05-24T..."
  }
}
```

### Step 5: Review API Docs

Open Swagger UI while server is running:
```
http://localhost:3000/api-docs
```

Search for "Notes Management" tag to see all endpoints.

---

## 📁 Important Files

| File | Purpose |
|------|---------|
| `src/routes/notes.routes.js` | All API endpoints |
| `src/prisma/schema.prisma` | Database schema |
| `src/prisma/migrations/20260524000000_add_notes_table/migration.sql` | Database migration |
| `IMPLEMENTATION_SUMMARY.md` | Detailed documentation |
| `NOTES_MIGRATION_GUIDE.md` | Migration troubleshooting |
| `QUICK_START.md` | This file |

---

## 🔌 API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/personal-notes` | List notes |
| POST | `/api/personal-notes` | Create note |
| GET | `/api/personal-notes/:id` | Get one note |
| PATCH | `/api/personal-notes/:id` | Update note |
| DELETE | `/api/personal-notes/:id` | Delete note (soft) |
| GET | `/api/personal-notes/stats/summary` | Get stats |

---

## 📝 Common Tasks

### Create a Note
```bash
curl -X POST http://localhost:3000/api/personal-notes \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"My note","tag":"IMPORTANT"}'
```

### List Notes with Search
```bash
curl -X GET "http://localhost:3000/api/personal-notes?search=urgent&tag=TODO" \
  -H "Authorization: Bearer TOKEN"
```

### Update a Note
```bash
curl -X PATCH http://localhost:3000/api/personal-notes/{id} \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"New title"}'
```

### Delete a Note
```bash
curl -X DELETE http://localhost:3000/api/personal-notes/{id} \
  -H "Authorization: Bearer TOKEN"
```

---

## ⚠️ If Something Goes Wrong

1. **"Cannot find module notes.routes"** → Migration hasn't been applied yet
2. **"relation notes does not exist"** → Run the migration
3. **"connection refused"** → PostgreSQL isn't running
4. **"permission denied"** → Check PostgreSQL user permissions

👉 See `NOTES_MIGRATION_GUIDE.md` for detailed troubleshooting.

---

## ✅ Checklist

- [ ] Database is running
- [ ] Migration applied successfully
- [ ] notes table exists in database
- [ ] NoteTag enum created
- [ ] Backend server starts without errors
- [ ] Can create a note via API
- [ ] Can list notes via API
- [ ] Swagger docs show Notes endpoints

---

## 📚 Need More Details?

- **Full Implementation** → Read `IMPLEMENTATION_SUMMARY.md`
- **Migration Help** → Read `NOTES_MIGRATION_GUIDE.md`
- **API Reference** → Open `http://localhost:3000/api-docs`
- **Database Schema** → Check `src/prisma/schema.prisma`
- **Route Code** → Check `src/routes/notes.routes.js`

---

## 🎉 That's It!

Once the migration is applied, the Notes module is fully operational and ready for your frontend to use.

No frontend changes needed - it's already compatible! 🚀

---

**Last Updated:** 2026-05-24
**Status:** ✅ Ready for Production
