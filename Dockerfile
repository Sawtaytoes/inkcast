# Inkcast render/push server.
#
# The server renders with headless Chromium (Playwright), so the image bundles a
# Chromium build. Runtime is the esbuild bundle run with plain `node` (never tsx
# in prod — locked decision); `yarn build` also copies the font TTFs next to the
# bundle, where the render engine resolves them by path.

FROM node:24-slim AS base
WORKDIR /app

# Link the GHCR package to the repo.
LABEL org.opencontainers.image.source="https://github.com/Sawtaytoes/castkit"

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV NODE_ENV=production
ENV TZ=America/Chicago

RUN npm install -g corepack@latest && corepack enable yarn

# --- Dependency layer (only manifests, so source edits don't bust the install) ---
COPY .yarnrc.yml package.json yarn.lock ./
COPY .yarn .yarn
COPY packages/core/package.json packages/core/package.json
COPY packages/views/package.json packages/views/package.json
COPY packages/render/package.json packages/render/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/web/package.json packages/web/package.json

RUN yarn install --immutable

# Chromium + its system libraries for the render engine.
RUN yarn playwright install --with-deps chromium

# --- Source + bundle ---
COPY . .
RUN yarn build

# HTTP API port (override with PORT).
EXPOSE 8788

# Config comes from the environment (see .env.example). Mount a .env or pass
# -e vars; nothing house-specific is baked into the image.
CMD ["yarn", "workspace", "@castkit/server", "start:prod"]
