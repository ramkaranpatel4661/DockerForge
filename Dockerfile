# Stage 1: Build the React Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Final runner image hosting backend and frontend statically
FROM node:20-alpine AS runner
WORKDIR /app

# Copy and install backend production dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Copy backend source code
COPY backend/src ./backend/src

# Copy built frontend assets from Stage 1 into the backend static search directory
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Expose standard production port
EXPOSE 3000

# Set production environment flags
ENV PORT=3000
ENV NODE_ENV=production

# Run backend Express server
CMD ["node", "backend/src/server.js"]
