FROM node:22-alpine AS dependencies

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
COPY web/package.json ./web/package.json
RUN npm ci

FROM dependencies AS builder

ARG CHART_BUILD_ID=development
ENV CHART_BUILD_ID=$CHART_BUILD_ID

# Next resolves `rewrites()` at build time and writes the result into
# routes-manifest.json, so the runtime value of this variable is never
# consulted for them. Without it here the manifest baked
# `/api/chart/:path* -> http://127.0.0.1:3210/:path*` - the fallback in
# next.config.ts - and every endpoint without a route handler of its own
# (the risk map and monthly cards among them) proxied to localhost inside
# the web container and failed with ECONNREFUSED.
ARG CHART_PYTHON_API_INTERNAL_URL=http://chart-core:3210
ENV CHART_PYTHON_API_INTERNAL_URL=$CHART_PYTHON_API_INTERNAL_URL

COPY web ./web
RUN npm run build:web

FROM node:22-alpine AS runtime

WORKDIR /app

ARG CHART_BUILD_ID=development
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV CHART_BUILD_ID=$CHART_BUILD_ID
ENV HOSTNAME=0.0.0.0
ENV PORT=3100

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/web/.next/static ./web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/web/public ./web/public

USER nextjs

EXPOSE 3100

CMD ["node", "web/server.js"]
