# syntax=docker/dockerfile:1
#
# ─────────────────────────────────────────────────────────────────────────────
# Multi-stage build for the tRPC + GraphQL playground
# ─────────────────────────────────────────────────────────────────────────────
#
# WHY MULTI-STAGE
#
# Building needs far more than running does: the TypeScript compiler, the
# GraphQL codegen CLI, Tailwind, every @types package, the whole npm cache. None
# of that is needed to serve a request, and all of it would otherwise sit in the
# shipped image — as attack surface, as bytes every node pulls on every rollout,
# and as things a scanner will file CVEs against.
#
# So we build in one image and copy only the artefacts into a second. The build
# tools never reach production because they were never in the final layer.
#
# WHY NOT `output: "standalone"`
#
# Next.js can emit a self-contained `server.js` with a traced, minimal
# node_modules — normally the right answer, and it is not the right answer here.
# This app does not use Next's server: it runs its own (`server.ts`), because
# GraphQL subscriptions need a WebSocket held open across requests and a Next
# route handler cannot do that. Standalone's dependency tracing starts from
# Next's entry point, so it would not see what our custom server imports.
#
# The honest alternative is what this file does: install production
# dependencies properly, and ship those. The image is larger than a standalone
# build; it is also correct, which matters more.

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — dependencies
# ─────────────────────────────────────────────────────────────────────────────
# Split from the build stage so that Docker's layer cache can keep it. Source
# code changes on every commit; package-lock.json changes rarely. Copying only
# the manifests first means `npm ci` — the slow step — is re-run only when a
# dependency actually changed.
FROM node:22-alpine AS deps
WORKDIR /app

# The Prisma schema must be present before `npm ci`: the postinstall script runs
# `prisma generate`, which reads it. Without this the install fails.
COPY package.json package-lock.json ./
COPY prisma ./prisma

RUN npm ci

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — build
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# `next build` compiles the app into .next/. The custom server reads that
# directory at runtime; it is not bundled into a single file.
#
# NEXT_TELEMETRY_DISABLED keeps the build from phoning home — a build should not
# depend on network access it does not need.
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

# Reinstall with dev dependencies pruned. Doing it here rather than in a fresh
# stage keeps the exact resolved versions from package-lock.json that the build
# was verified against.
RUN npm ci --omit=dev && npm cache clean --force

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3 — runtime
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# WHY A NON-ROOT USER
#
# Containers are not a security boundary on their own: root inside the container
# is uid 0 on the host kernel too. If the process is compromised, a root process
# can exploit a kernel bug or a loose mount far more easily than an unprivileged
# one, and it can write anywhere in the filesystem it can reach.
#
# Running as an ordinary user costs nothing and removes that whole class of
# escalation. Kubernetes can enforce it independently (`runAsNonRoot: true` in
# k8s/app-deployment.yaml) — belt and braces, because the manifest and the image
# are maintained by different people at different times.
#
# node:alpine already ships a `node` user (uid 1000); we reuse it rather than
# inventing another.
RUN mkdir -p /app/public/uploads && chown -R node:node /app

# Copy only what the runtime needs. Note `src/` is included: the production
# start command is `tsx server.ts`, and tsx transpiles the TypeScript sources on
# demand, so the server's own imports must be present. `.next/` is the compiled
# Next.js app; `prisma/` carries the schema and migrations the migration Job
# runs.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/src ./src
COPY --from=builder --chown=node:node /app/server.ts ./server.ts
COPY --from=builder --chown=node:node /app/next.config.mjs ./next.config.mjs
COPY --from=builder --chown=node:node /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=node:node /app/package.json ./package.json

USER node

# ONE PORT, TWO PROTOCOLS.
#
# There is no separate WebSocket port. server.ts creates a single HTTP server on
# $PORT and intercepts the `upgrade` event for the path /api/graphql/ws, handing
# that socket to the graphql-ws server; everything else goes to Next.js. A
# WebSocket handshake begins life as an ordinary HTTP GET carrying
# `Upgrade: websocket`, so one listener serves both.
#
# The practical consequence for Kubernetes: the Service and Ingress need exactly
# one port, and nothing needs a second backend — but any proxy in front must be
# configured to pass the upgrade through rather than buffer it. See the notes in
# k8s/ingress.yaml.
EXPOSE 3000

# EXPOSE is documentation, not enforcement — it publishes nothing by itself.
# The binding that matters is server.ts listening on 0.0.0.0:$PORT; a process
# bound to 127.0.0.1 is unreachable from outside its own network namespace and
# every probe would fail with connection refused.

# Migrations are NOT run here. See k8s/README.md — they belong in a Job that
# runs once, not in a command that runs on every pod of every replica.
CMD ["npm", "run", "start:container"]
