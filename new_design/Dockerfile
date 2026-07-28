FROM node:22-alpine AS dependencies

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
COPY web/package.json ./web/package.json
COPY new_design/package.json ./new_design/package.json
RUN npm ci

FROM dependencies AS builder

ARG CHART_BUILD_ID=development
ENV CHART_BUILD_ID=$CHART_BUILD_ID

COPY new_design ./new_design
RUN npm run build:new-design

FROM node:22-alpine AS runtime

WORKDIR /app

ARG CHART_BUILD_ID=development
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV CHART_BUILD_ID=$CHART_BUILD_ID
ENV HOSTNAME=0.0.0.0
ENV PORT=3200

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/new_design/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/new_design/.next/static ./new_design/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/new_design/public ./new_design/public

USER nextjs

EXPOSE 3200

CMD ["node", "new_design/server.js"]
