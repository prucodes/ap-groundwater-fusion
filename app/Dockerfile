# Groundwater dashboard — Next.js (standalone output) as an AI Living Labs Track-4 app.
# Multi-stage: install deps, build, then a tiny runtime image serving the standalone server.
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:20-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# Next.js "standalone" output: a minimal server + only the deps it needs.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# OpenShift runs containers as an arbitrary non-root UID in group 0.
RUN chgrp -R 0 /app && chmod -R g=u /app
EXPOSE 3000
CMD ["node", "server.js"]
