# Angels Impilo Maintenance Backend

A dependency-free Node.js backend for `https://angelsimpilo.com/maintenance-app`. It provides authentication, asset inventory, user management, and work-order APIs for a maintenance application.

## Features

- JWT-style HMAC authentication with a seeded administrator account.
- Role-based access control for admins, managers, technicians, and requesters.
- Asset CRUD endpoints with duplicate-tag validation.
- Work-order creation, assignment, filtering, status updates, and comments.
- JSON-file persistence for a lightweight deployable starting point.
- Consistent JSON validation and error responses.
- No external npm packages required.

## Getting started

```bash
cp .env.example .env
npm start
```

The API listens on `http://localhost:3000` by default. Change `PORT`, `CORS_ORIGIN`, `JWT_SECRET`, and `DATA_FILE` in `.env` or your host environment for deployment.

## Default administrator

On first startup the server seeds an administrator account using:

- `SEED_ADMIN_EMAIL` (default: `admin@angelsimpilo.com`)
- `SEED_ADMIN_PASSWORD` (default: `ChangeMe123!`)
- `SEED_ADMIN_NAME` (default: `Angels Impilo Admin`)

Change these values before first production startup.

## API overview

All protected routes require `Authorization: Bearer <token>`.

### Health

- `GET /health`

### Authentication and users

- `POST /api/auth/login`
- `POST /api/auth/register` (admin/manager)
- `GET /api/auth/me`
- `GET /api/users` (admin/manager)

### Assets

- `GET /api/assets?q=`
- `POST /api/assets` (admin/manager)
- `GET /api/assets/:id`
- `PATCH /api/assets/:id` (admin/manager)
- `DELETE /api/assets/:id` (admin)

### Work orders

- `GET /api/work-orders?status=&priority=&assigneeId=&requesterId=&q=`
- `POST /api/work-orders`
- `GET /api/work-orders/:id`
- `PATCH /api/work-orders/:id`
- `POST /api/work-orders/:id/comments`
- `DELETE /api/work-orders/:id` (admin/manager)

## Example requests

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@angelsimpilo.com","password":"ChangeMe123!"}'
```

```bash
curl -X POST http://localhost:3000/api/work-orders \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"title":"Repair leaking tap","description":"Tap leaking in patient bathroom","location":"Ward 1","priority":"medium"}'
```

## Scripts

- `npm run dev` - run the API in watch mode.
- `npm start` - run the API.
- `npm test` - run the Node test suite.
- `npm run lint` - run JavaScript syntax checks.
