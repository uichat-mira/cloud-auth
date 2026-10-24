FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
RUN pnpm install --frozen-lockfile --filter @uichat-mira/cloud-auth-api...
COPY packages/contracts ./packages/contracts
RUN pnpm --filter @uichat-mira/cloud-auth-contracts run build
COPY apps/api ./apps/api
RUN pnpm --filter @uichat-mira/cloud-auth-api run build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
RUN pnpm install --frozen-lockfile --prod --filter @uichat-mira/cloud-auth-api...
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
COPY apps/api/migrations ./apps/api/migrations
COPY apps/api/scripts ./apps/api/scripts
WORKDIR /app/apps/api
RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 8788
ENV HOST=0.0.0.0 PORT=8788 MIRA_AUTH_DB_PATH=/data/auth.sqlite
CMD ["node", "dist/server.js"]
