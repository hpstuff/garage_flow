# Deployment Guide

## Self-hosted (Coolify)

GarageFlow ships as a single Dockerfile with a multi-stage build. Deploy on Coolify by pointing it at this repo and letting it use the default `Dockerfile` in the root.

### Steps

1. **Add your app to Coolify** — select this Git repository and pick the root directory (`/`).
2. **Build settings**: leave Dockerfile path as `/Dockerfile` (auto-detected). The build uses a Node 24 Alpine base, standalone Next.js output, and runs ~80 MB.
3. **Set required environment variables** in Coolify's "Environment Variables" tab:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Your managed Postgres connection string (see below). |
| `BETTER_AUTH_SECRET` | Yes | Generate a strong random value (`openssl rand -hex 32`). Never reuse the dev placeholder. |
| `BETTER_AUTH_URL` | Yes | Your public app URL, e.g. `https://garageflow.example.com`. Used by Better Auth for cookie domains and callback URLs. |

No other env vars are needed at startup.

### Postgres options

You need a running PostgreSQL 17+ instance. Recommended providers:

- **Neon** (`neon.app`) — free tier available, serverless Postgres
- **Supabase** (`supabase.com`) — includes managed PG + Auth, but you only use the database here
- **Railway** (`railway.app`) — one-click PostgreSQL
- **Your own container** — run a Postgres container alongside GarageFlow in Coolify; set `DATABASE_URL=postgres://garageflow:garageflow@your-pg-container:5432/garageflow`

### Migrations

Run Drizzle migrations after connecting your database. Add the `DATABASE_URL` env var in Coolify, then either:

- Use **Coolify's "Deploy Command"** field with `npm run db:migrate`
- Or SSH into the container and run it manually

### Health checks

The Dockerfile includes a built-in healthcheck (`HEALTHCHECK`) that curls `/`. Coolify uses this for deployment readiness. If you use a different platform, adjust the healthcheck URL accordingly.

---

## Environment Variable Reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string with pool sizing (e.g., `postgres://user:pass@host:5432/db?pool=20&ssl=false`). |
| `BETTER_AUTH_SECRET` | Yes | Secret key for signing auth cookies. Generate a strong random value in production. |
| `BETTER_AUTH_URL` | Yes | Base URL of the running app (used for cookie domains, callback URLs). |

## Local Development

```bash
# Start local Postgres via docker compose
npm run db:up

# Run migrations against it
npm run db:migrate

# Seed demo data
npm run db:seed

# Start the dev server
npm run dev
```
