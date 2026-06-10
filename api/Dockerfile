FROM node:22-alpine AS api

WORKDIR /repo

ENV HOST=0.0.0.0
ENV NODE_OPTIONS=--max-old-space-size=1024
ENV PORT=3200

COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY web/package.json web/package.json
RUN npm ci

COPY api api
RUN npm run build:api

EXPOSE 3200

CMD ["npm", "run", "start:api"]
