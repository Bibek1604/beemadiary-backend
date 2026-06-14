# Local seed — admin + user (agent)

Creates login-able accounts for local deployment. Self-registration is disabled
in this app, so seeding is the only way to get accounts you can log in with.

## 1. Make sure MongoDB is running locally

The seed reads `MONGODB_URI` from `backend/.env` (default
`mongodb://localhost:27017/beema_local`). Start your local MongoDB first.

## 2. Run the seed

```bash
cd backend            # the inner backend folder (where package.json is)
npm install           # first time only
npm run seed:local
```

This is idempotent — running it again updates the same accounts instead of
creating duplicates.

## 3. Default credentials

Read from `.env` (override there if you want):

| Account | Login endpoint                              | Email                 | Password       |
|---------|---------------------------------------------|-----------------------|----------------|
| Admin   | `POST /api/admin/login`                     | `admin@localhost.com` | `Admin@123456` |
| User    | `POST /api/agent/login` (`/api/users/login`)| `agent@localhost.com` | `Agent@123456` |

Override via env vars (in `.env` / `.env.development`):

```
ADMIN_EMAIL=...            # admin email
SEED_ADMIN_PASSWORD=...    # admin password
SEED_AGENT_EMAIL=...       # user/agent email   (defaults to agent@localhost.com)
SEED_AGENT_PASSWORD=...    # user/agent password
```

## 4. Quick login check

```bash
# Admin
curl -X POST http://localhost:3001/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@localhost.com","password":"Admin@123456"}'

# User (agent)
curl -X POST http://localhost:3001/api/agent/login \
  -H "Content-Type: application/json" \
  -d '{"email":"agent@localhost.com","password":"Agent@123456"}'
```

## Notes

- The command uses `ts-node` (not plain `node`) because `config/db` imports a
  TypeScript adapter — plain `node` cannot load it.
- `npm run seed` is the larger original seed (also adds a sample company,
  client and policy). `npm run seed:local` is the focused admin + user seed.
- The seed refuses to run when `NODE_ENV=production` unless
  `ALLOW_SEED_IN_PRODUCTION=true`.
