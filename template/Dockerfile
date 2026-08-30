FROM node:24.19.0-bookworm-slim AS build

RUN npm install --global npm@11.17.0

WORKDIR /app

COPY .npmrc package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:24.19.0-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=8002

WORKDIR /app

COPY --from=build --chown=node:node /app/dist ./dist

USER node

EXPOSE 8002

HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/healthz').then(response => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node", "dist/server/index.cjs"]
