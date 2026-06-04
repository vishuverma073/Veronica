# syntax=docker/dockerfile:1
# Build + run @veronica/api from the pnpm monorepo root.
# Build context MUST be the repo root (needs the workspace + lockfile + contracts).

FROM node:20.11.1-slim AS build
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @veronica/contracts build \
 && pnpm --filter @veronica/api build

FROM node:20.11.1-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
# Carry over installed deps + built output (contracts dist + api dist).
COPY --from=build /app ./
EXPOSE 8787
CMD ["node", "apps/api/dist/entry/node.js"]
