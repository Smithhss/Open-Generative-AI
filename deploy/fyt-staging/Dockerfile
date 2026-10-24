FROM node:24-bookworm-slim AS deps
WORKDIR /app
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY packages/studio/package.json ./packages/studio/
COPY packages/Vibe-Workflow/packages/workflow-builder/package.json ./packages/Vibe-Workflow/packages/workflow-builder/
COPY packages/Open-Poe-AI/packages/agents/package.json ./packages/Open-Poe-AI/packages/agents/
COPY packages/Open-AI-Design-Agent/packages/design-agent/package.json ./packages/Open-AI-Design-Agent/packages/design-agent/
RUN npm ci --no-audit --no-fund

FROM deps AS builder
COPY . .
ENV NEXT_PUBLIC_STUDIO_MODE=fyt FYT_LOCAL_API=false
RUN npm run build:packages && npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_PUBLIC_STUDIO_MODE=fyt NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder /app/LICENSE ./LICENSE
# 画布 AI 的会话落盘目录，必须归 node 所有，否则命名卷里写不进去
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "server.js"]
