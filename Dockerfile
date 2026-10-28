# Stage 1: Build Frontend Shell
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Production Runtime
FROM node:20-slim
ENV NODE_ENV=production
ENV PORT=3001
ENV CHROME_BIN=/usr/bin/chromium

# Install Chromium and headless rendering dependencies for browser tools
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-freefont-ttf \
    curl \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy engine core and server runtime
COPY src/ ./src/
COPY server/ ./server/

# Copy built frontend shell from builder
COPY --from=builder /app/dist ./dist

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

EXPOSE 3001

CMD ["node", "server/index.js"]
