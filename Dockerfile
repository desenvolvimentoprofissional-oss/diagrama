FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium libreoffice-writer poppler-utils fontconfig fonts-liberation fonts-noto-core ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/public/fonts /usr/local/share/fonts/diagrama
RUN chmod -R a+rX /usr/local/share/fonts/diagrama && fc-cache -f && chown -R node:node /app
ENV NODE_ENV=production PORT=8080 CHROMIUM_PATH=/usr/bin/chromium LIBREOFFICE_PATH=/usr/bin/soffice
USER node
EXPOSE 8080
CMD ["node", "dist/server.mjs"]
