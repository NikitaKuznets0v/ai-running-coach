# Stage 1: build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: runtime
FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/docs/coach-knowledge ./docs/coach-knowledge
RUN apk add --no-cache tesseract-ocr tesseract-ocr-data-eng tesseract-ocr-data-rus \
  && npm ci --only=production
ENV TZ=Europe/Moscow
CMD ["node", "dist/index.js"]
