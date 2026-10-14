# Multi-stage build for VoiceSplitting Frontend (PWA)
FROM node:20-alpine AS builder

WORKDIR /app

# Cache package dependencies
COPY package*.json ./
RUN npm ci

# Copy full frontend source code
COPY . .

# Build arguments for Vite environment variables
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_API_BASE_URL=""
ARG VITE_ONNX_MODEL_URL=""

ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_ONNX_MODEL_URL=$VITE_ONNX_MODEL_URL

# Build production bundle
RUN npm run build

# Stage 2: Production Nginx Server
FROM nginx:alpine

# Remove default static files
RUN rm -rf /usr/share/nginx/html/*

# Copy built production assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy internal Nginx configuration for SPA routing and API reverse proxy
COPY nginx.frontend.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
