FROM node:22-alpine AS web

WORKDIR /repo

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=1536

COPY package.json package-lock.json ./
COPY web/package.json web/package.json
RUN npm ci

COPY web web
RUN npm run build:web

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3100

EXPOSE 3100

CMD ["npm", "run", "start:web"]
