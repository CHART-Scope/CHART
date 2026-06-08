FROM node:22-alpine AS solution-repository

WORKDIR /repo

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=1536

WORKDIR /repo/solution-repository
COPY solution-repository/package.json solution-repository/package-lock.json ./
RUN npm ci

COPY solution-repository .
RUN npm run build

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3300

EXPOSE 3300

CMD ["npm", "run", "start"]
