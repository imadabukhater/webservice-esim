# 👇 1
FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
# 👇 1.1
RUN apk add --no-cache libc6-compat

# 👇 1
FROM base AS dev-deps

WORKDIR /app

# 👇 2
COPY package.json pnpm*.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# 👇 1
FROM base AS prod-deps

WORKDIR /app

# 👇 3
COPY package.json pnpm*.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

# 👇 1
FROM base AS builder
WORKDIR /app

# 👇 4
COPY --from=dev-deps /app/node_modules ./node_modules
COPY . .

RUN pnpm build

# 👇 1
FROM base AS runner

WORKDIR /app

# 👇 5
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./dist/migrations

EXPOSE 9000

CMD ["node", "dist/src/main"]
