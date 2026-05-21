# Dashboard Overview API - Production Implementation

A comprehensive, production-level Dashboard Overview API built with **Node.js**, **Express.js**, **PostgreSQL**, **Prisma ORM**, and **JWT Authentication**. Features advanced analytics, role-based access control (RBAC), global error handling, validation, and comprehensive Swagger documentation.

## 📋 Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Installation & Setup](#installation--setup)
- [Configuration](#configuration)
- [Database Setup](#database-setup)
- [API Endpoints](#api-endpoints)
- [Authentication](#authentication)
- [Business Logic](#business-logic)
- [Error Handling](#error-handling)
- [Security](#security)
- [Swagger Documentation](#swagger-documentation)
- [Development](#development)

## 🎯 Features

### Core Features
- ✅ **Advanced Analytics Dashboard** - Comprehensive dashboard with multiple metrics
- ✅ **Role-Based Access Control (RBAC)** - Admin, Agent, User roles
- ✅ **JWT Authentication** - Secure token-based authentication
- ✅ **Real-time Calculations** - Overdue premiums, birthdays, target progress
- ✅ **Optimized Database Queries** - N+1 query prevention with joins & aggregations
- ✅ **Global Error Handling** - Centralized error middleware with Prisma error mapping
- ✅ **Request Validation** - Zod validation for all inputs
- ✅ **Security Hardening** - Helmet, CORS, rate limiting, XSS protection
- ✅ **Swagger/OpenAPI Docs** - Complete API documentation with examples
- ✅ **TypeScript** - Full type safety throughout

### Dashboard Analytics
- **Summary Statistics**: Total/Active/Inactive members, overdue premiums, lapsed policies
- **Birthday System**: Today's birthdays and monthly birthday tracking
- **Overdue Premiums**: Detailed payment tracking with days overdue
- **Targets**: Monthly targets with progress percentage calculation
- **Visualizations**: Gender breakdown and insurance buying reason analytics
- **Recent Alerts & Notifications**: User-specific alerts and notifications
- **Achievements**: Placeholder for future achievement system

## 🏗️ Architecture

```
Controller (API Endpoint)
    ↓
Service (Business Logic)
    ↓
Repository (Database Queries)
    ↓
Prisma ORM (Database Layer)
    ↓
PostgreSQL Database
```

### Middleware Stack
```
Request
  ↓
Helmet (Security Headers)
  ↓
CORS
  ↓
Rate Limiting
  ↓
Body Parser (JSON)
  ↓
Request Logger
  ↓
XSS Protection
  ↓
Request Sanitizer
  ↓
Route Handler
  ↓
Error Handler
```

## 📁 Project Structure

```
src/
├── config/
│   ├── database.ts          # Prisma client configuration
│   └── constants.ts         # Global constants & business rules
├── controllers/
│   └── dashboard.controller.ts      # Dashboard endpoint handler
├── services/
│   └── dashboard.service.ts         # Business logic layer
├── repositories/
│   └── dashboard.repository.ts      # Database queries layer
├── middleware/
│   ├── auth.ts              # JWT verification & token generation
│   ├── rbac.ts              # Role-based access control
│   ├── errorHandler.ts      # Global error handling
│   ├── asyncHandler.ts      # Async route wrapper
│   ├── validation.ts        # Request validation (Zod)
│   └── security.ts          # Helmet, CORS, rate limiting
├── routes/
│   └── dashboard.routes.ts  # API routes
├── types/
│   └── index.ts             # TypeScript interfaces
├── utils/
│   ├── dateUtils.ts         # Date calculations
│   ├── calculations.ts      # Math operations
│   └── errorResponse.ts     # Response formatting
├── docs/
│   └── swagger.ts           # OpenAPI 3.0 specification
├── app.ts                   # Express application setup
└── server.ts                # Server initialization

prisma/
└── schema.prisma            # Database schema definition

package.json
tsconfig.json
.env.example
README.md
```

## 🚀 Installation & Setup

### Prerequisites
- Node.js >= 18.0.0
- PostgreSQL >= 12
- npm or yarn

### Step 1: Clone & Install Dependencies
```bash
cd dashboard-api
npm install
# or
yarn install
```

### Step 2: Setup Environment Variables
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/dashboard_db"
NODE_ENV=development
PORT=3000
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRY=7d
CORS_ORIGIN=http://localhost:3000,http://localhost:3001
```

### Step 3: Setup Database
```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# (Optional) Seed database or view data
npm run prisma:studio
```

### Step 4: Start Development Server
```bash
npm run dev
```

Server will start at: `http://localhost:3000`

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `NODE_ENV` | Environment (development/production) | development |
| `PORT` | Server port | 3000 |
| `JWT_SECRET` | JWT signing secret | varies |
| `JWT_EXPIRY` | Token expiration time | 7d |
| `CORS_ORIGIN` | Allowed CORS origins | localhost:3000 |
| `RATE_LIMIT_WINDOW` | Rate limit window (ms) | 900000 |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | 100 |

### Business Constants (src/config/constants.ts)

```typescript
OVERDUE_THRESHOLD_DAYS: 0              // Days before premium is considered overdue
LAPSED_POLICY_THRESHOLD_DAYS: 30       // Days before policy is marked as lapsed
PAGINATION_LIMIT: 10                   // Default pagination limit
```

## 🗄️ Database Setup

### PostgreSQL Installation

**Ubuntu/Debian:**
```bash
sudo apt-get install postgresql postgresql-contrib
sudo service postgresql start
```

**macOS:**
```bash
brew install postgresql
brew services start postgresql
```

**Windows:**
- Download installer from [postgresql.org](https://www.postgresql.org/download/windows/)

### Create Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE dashboard_db;

# Create user (optional)
CREATE USER dashboard_user WITH PASSWORD 'secure_password';
ALTER ROLE dashboard_user SET client_encoding TO 'utf8';
ALTER ROLE dashboard_user SET default_transaction_isolation TO 'read committed';
ALTER ROLE dashboard_user SET default_transaction_deferrable TO on;
GRANT ALL PRIVILEGES ON DATABASE dashboard_db TO dashboard_user;
```

### Run Migrations

```bash
npm run prisma:migrate
```

## 📡 API Endpoints

### GET /api/user-panel/dashboard-overview

**Authentication Required:** ✅ (Bearer Token)

**Authorized Roles:** ADMIN, AGENT, USER

**Description:** Fetch comprehensive dashboard overview with analytics

**Request Headers:**
```json
{
  "Authorization": "Bearer <JWT_TOKEN>",
  "Content-Type": "application/json"
}
```

**Response (200 OK):**
```json
{
  "status": true,
  "message": "Dashboard overview fetched successfully",
  "data": {
    "summary": {
      "total_members": 150,
      "active_members": 120,
      "inactive_members": 30,
      "lapsed_policies": 5,
      "overdue_premiums": 12,
      "unread_alerts": 3
    },
    "birthdays": {
      "today": [],
      "this_month": [
        {
          "id": 1,
          "first_name": "Bibek",
          "last_name": "Pandey",
          "dob": "2000-05-13",
          "contact_number": "9800000000"
        }
      ],
      "this_month_count": 3
    },
    "recent_alerts": [],
    "recent_notifications": [],
    "achievements": [],
    "payments_due": [
      {
        "client_name": "Ram Bahadur",
        "policy_number": "POL123",
        "premium_amount": 5000,
        "premium_due_date": "2026-05-10",
        "days_overdue": 12,
        "contact_number": "9800000000",
        "policy_status": "ACTIVE"
      }
    ],
    "targets": [
      {
        "id": 1,
        "target_type": "NEW_POLICIES",
        "target_value": 50,
        "current_value": 35,
        "progress_percentage": 70.0,
        "target_month": "2026-05-01"
      }
    ],
    "visualizations": {
      "gender_breakdown": {
        "MALE": 3,
        "FEMALE": 1,
        "CHILD": 0,
        "OTHER": 0
      },
      "why_bought_breakdown": [
        {
          "why_bought": "PROTECTION",
          "count": 5
        }
      ]
    }
  },
  "code": 200
}
```

**Error Responses:**

401 Unauthorized:
```json
{
  "status": false,
  "message": "No token provided",
  "code": 401
}
```

403 Forbidden:
```json
{
  "status": false,
  "message": "Insufficient permissions",
  "code": 403
}
```

500 Internal Server Error:
```json
{
  "status": false,
  "message": "Internal server error",
  "code": 500
}
```

## 🔐 Authentication

### JWT Token Structure

```typescript
{
  id: number;           // User ID
  email: string;        // User email
  role: UserRole;       // ADMIN | AGENT | USER
  iat: number;          // Issued at timestamp
  exp: number;          // Expiration timestamp
}
```

### Token Usage

All authenticated endpoints require the token in the Authorization header:

```bash
curl -H "Authorization: Bearer <TOKEN>" \
  http://localhost:3000/api/user-panel/dashboard-overview
```

### Token Expiration & Refresh

- Default expiration: **7 days**
- Expired tokens return **401 Unauthorized**
- Implement token refresh logic on client-side

## 💼 Business Logic

### 1. Overdue Premiums Calculation

**Condition:**
```
IF premium_due_date < TODAY 
AND premium_due_paid = 'DUE'
AND policy_status = 'ACTIVE'
THEN include in overdue_premiums
```

**Fields Returned:**
- `days_overdue`: Calculated as `TODAY - premium_due_date`
- All policy and client details

### 2. Birthday System

**Categorization:**
- **Today**: `DOB.month == TODAY.month AND DOB.date == TODAY.date`
- **This Month**: `DOB.month == TODAY.month`

**Sorting:** By date (ascending)

### 3. Target Progress Calculation

**Formula:**
```
progress_percentage = (current_value / target_value) * 100
```

**Rounding:** 2 decimal places

### 4. Lapsed Policy Logic

**Condition:**
```
IF premium_overdue_days > LAPSED_THRESHOLD (30 days)
THEN mark policy as LAPSED
AND increment lapsed_policies count
```

### 5. Member Status Calculation

**Active Members:**
```
COUNT WHERE is_active = true
```

**Inactive Members:**
```
total_members - active_members
```

## ⚠️ Error Handling

### Global Error Middleware

Centralized error handler catches all errors:

1. **Prisma Errors**
   - `PrismaClientValidationError` → 400 Bad Request
   - `P2002` (Unique Constraint) → 400 Bad Request
   - `P2025` (Record Not Found) → 404 Not Found
   - `P2003` (Foreign Key) → 400 Bad Request

2. **JWT Errors**
   - `JsonWebTokenError` → 401 Unauthorized
   - `TokenExpiredError` → 401 Unauthorized

3. **Validation Errors**
   - Zod validation failures → 400 Bad Request

4. **Default**
   - Unhandled errors → 500 Internal Server Error

### Standard Error Response Format

```json
{
  "status": false,
  "message": "Error description",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ],
  "code": 400
}
```

## 🔒 Security

### Implemented Security Measures

1. **Helmet.js** - HTTP security headers
2. **CORS** - Cross-origin resource sharing control
3. **Rate Limiting** - Prevent brute force attacks
   - Global: 100 requests per 15 minutes
   - Auth: 5 requests per 15 minutes
4. **XSS Protection** - Input sanitization
5. **JWT Authentication** - Secure token-based auth
6. **SQL Injection Prevention** - Prisma parameterized queries
7. **RBAC** - Role-based access control
8. **Request Validation** - Zod schema validation
9. **Parameter Pollution Prevention** - Duplicate parameter handling

### Security Headers Set

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'
```

### Best Practices

- ✅ Never log sensitive data (passwords, tokens)
- ✅ Use environment variables for secrets
- ✅ Validate all inputs
- ✅ Use HTTPS in production
- ✅ Rotate JWT secrets periodically
- ✅ Implement request logging
- ✅ Monitor for suspicious activity

## 📚 Swagger Documentation

### Access Swagger UI

```
http://localhost:3000/api/docs
```

### Features

- ✅ Complete OpenAPI 3.0 specification
- ✅ Bearer token authentication
- ✅ All endpoints documented
- ✅ Request/response examples
- ✅ Error response documentation
- ✅ Schema definitions
- ✅ Try-it-out functionality

### Documentation Includes

- Endpoint summary and description
- Request parameters and body
- Response schemas with examples
- Security requirements
- HTTP status codes
- Error messages

## 🛠️ Development

### Available Scripts

```bash
# Start development server with hot reload
npm run dev

# Build TypeScript
npm run build

# Start production server
npm start

# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate

# Open Prisma Studio (GUI)
npm run prisma:studio

# Lint code
npm run lint

# Run tests
npm run test
```

### Code Structure Guidelines

**Controllers** - Handle HTTP requests/responses only
```typescript
async getDashboardOverview(req, res) {
  // Validate input
  // Call service
  // Return response
}
```

**Services** - Implement business logic
```typescript
async getDashboardOverview(user) {
  // Determine role-based filtering
  // Call repositories
  // Transform data
  // Return business objects
}
```

**Repositories** - Execute database queries
```typescript
async getSummary(agentId?) {
  // Build where clause
  // Execute optimized queries
  // Return raw data
}
```

### Performance Optimization

1. **Database Indexes** - Define on frequently queried columns
2. **Query Optimization** - Use joins instead of multiple queries
3. **Aggregation** - Use GROUP BY for statistics
4. **Pagination** - Limit result sets
5. **Caching** - Implement Redis for frequently accessed data
6. **Connection Pooling** - Prisma handles this automatically

## 🐛 Troubleshooting

### Common Issues

**1. Database Connection Error**
```
Error: P1000 - Can't reach database server
```
- Check `DATABASE_URL` is correct
- Verify PostgreSQL is running
- Check credentials

**2. JWT Verification Failed**
```
Error: Invalid token
```
- Ensure `JWT_SECRET` matches across all instances
- Check token hasn't expired
- Verify token format: `Bearer <token>`

**3. Port Already in Use**
```
Error: listen EADDRINUSE: address already in use :::3000
```
- Change `PORT` in `.env`
- Or kill process: `lsof -i :3000 | kill -9`

**4. N+1 Query Problem**
```
Slow queries with many database calls
```
- Use Prisma `include()` or `select()` for eager loading
- Batch queries with `findMany()` with filters
- Check repository for optimizations

## 📦 Dependencies

### Core
- `express` - Web framework
- `@prisma/client` - ORM
- `jsonwebtoken` - JWT authentication
- `zod` - Schema validation

### Security
- `helmet` - Security headers
- `cors` - Cross-origin support
- `express-rate-limit` - Rate limiting
- `xss-clean` - XSS protection

### Documentation
- `swagger-ui-express` - Swagger UI
- `swagger-jsdoc` - OpenAPI spec generation

### Development
- `typescript` - Type safety
- `ts-node` - TypeScript runtime
- `@types/*` - Type definitions

## 📝 License

MIT

## 🤝 Support

For issues or questions, please contact: support@example.com

---

**Last Updated:** May 2026  
**Version:** 1.0.0
