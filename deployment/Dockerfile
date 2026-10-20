FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install --global pnpm@11.25.0 \
    && pnpm install --prod --frozen-lockfile --ignore-scripts

FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321 \
    ASTRO_TELEMETRY_DISABLED=1
WORKDIR /app
RUN mkdir -p /app/.data /data \
    && chown -R node:node /app/.data /data
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY --chown=node:node dist/ ./dist/
COPY scripts/backup-guestbook.mjs ./scripts/backup-guestbook.mjs
USER node
EXPOSE 4321
CMD ["node", "dist/server/entry.mjs"]
