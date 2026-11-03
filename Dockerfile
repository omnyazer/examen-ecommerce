FROM node:22.23.1-bookworm-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22.23.1-bookworm-slim
ENV NODE_ENV=production SERVE_FRONTEND=true
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY backend/ ./
COPY --from=frontend-build /app/frontend/build /app/frontend/build
USER node
EXPOSE 5000
CMD ["node", "server.js"]
