FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production WEB_HOST=0.0.0.0 PORT=3000 API_PORT=4000 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps ./apps
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/migrations ./migrations
COPY --from=build --chown=node:node /app/package.json ./package.json
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=12 CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/start-release.mjs"]
