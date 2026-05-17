ARG NODE_IMAGE=node:22-alpine
ARG ARTIFACTS_STAGE=build

FROM scratch AS prebuilt

WORKDIR /app

COPY package.json package-lock.json ./
COPY node_modules ./node_modules
COPY dist ./dist

FROM ${NODE_IMAGE} AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY stubs ./stubs
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM ${ARTIFACTS_STAGE} AS artifacts

FROM ${NODE_IMAGE}

WORKDIR /app

ENV NODE_ENV=production
ENV WEIXIN_API_HOST=0.0.0.0
ENV WEIXIN_API_PORT=8787
ENV WEIXIN_BRIDGE_STATE=/data/state

COPY --from=artifacts /app/package.json ./package.json
COPY --from=artifacts /app/package-lock.json ./package-lock.json
COPY --from=artifacts /app/node_modules ./node_modules
COPY --from=artifacts /app/dist ./dist

RUN mkdir -p /data/state && chown -R node:node /app /data

USER node

VOLUME ["/data/state"]
EXPOSE 8787

CMD ["node", "dist/index.js", "server"]
