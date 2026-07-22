FROM node:22-slim AS frontend-builder

RUN npm install -g pnpm@9.15.9
WORKDIR /build/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml* ./
RUN pnpm i
COPY frontend ./
COPY tmp /build/tmp
RUN pnpm run build

FROM node:22-slim AS backend-builder

WORKDIR /build/backend
COPY backend/package*.json ./
RUN npm i
COPY backend ./
RUN ./node_modules/.bin/tsc

FROM node:22-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx iproute2 \
    && rm -f /etc/nginx/sites-enabled/default \
    && rm -rf /var/lib/apt/lists/*

COPY tmp /usr/src/app/tmp

WORKDIR /usr/src/app/backend
COPY --from=backend-builder /build/backend/package*.json ./
COPY --from=backend-builder /build/backend/node_modules ./node_modules
COPY --from=backend-builder /build/backend/bin ./bin
COPY --from=backend-builder /build/backend/src ./src
COPY --from=frontend-builder /build/frontend/dist/frontend /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

EXPOSE 80 8080

ENTRYPOINT ["sh", "/entrypoint.sh"]
