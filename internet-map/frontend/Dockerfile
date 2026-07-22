FROM node:22-slim AS builder

RUN npm install -g pnpm@9.15.9
WORKDIR /build/frontend
COPY package.json pnpm-lock.yaml* .
RUN pnpm i
COPY . .
RUN pnpm run build
