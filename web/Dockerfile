FROM node:22-alpine AS dependencies

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
COPY web/package.json ./web/package.json
RUN npm ci

FROM dependencies AS builder

ARG CHART_BUILD_ID=development
ENV CHART_BUILD_ID=$CHART_BUILD_ID

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
