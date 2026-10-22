FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY src ./src
COPY migrations ./migrations
RUN npm run build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY scripts ./scripts
RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 8788
ENV HOST=0.0.0.0 PORT=8788 MIRA_AUTH_DB_PATH=/data/auth.sqlite
CMD ["node", "dist/server.js"]
