# syntax=docker/dockerfile:1
# Deployable image for Kamal → Hetzner (ADR-0012). Node pinned to LTS 24 to
# match .nvmrc / engines so dev, CI, and prod run the same runtime (ADR-0010).

FROM node:24-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1

# --- install dependencies ---
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- build ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Placeholder so build-time module init is clean; the real secret is injected at runtime.
ENV BETTER_AUTH_SECRET=build-time-placeholder
RUN npm run build

# --- run ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
