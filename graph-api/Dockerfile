FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV ECO_GRAPH_DEPLOY_TARGET=cloudbase
ENV PORT=8787
ENV ECO_GRAPH_STAGING_PATH=/data/field-events.jsonl
ENV ECO_GRAPH_CONTEXT_GRAPH_PATH=/app/data/exports/shared_product_v1/graph.json
ENV ECO_GRAPH_CONTEXT_PUBLICATION_PATH=/app/data/knowledge-governance/publications/ecocheck.json

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src
COPY scripts ./scripts
COPY pnpm ./pnpm
COPY data ./data

RUN chmod +x /app/pnpm && mkdir -p /data && chown -R node:node /app /data

USER node

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null || exit 1

CMD ["sh", "-c", "npm run db:init && node src/server.js"]
