# Inkcast render/push server.
#
# The server renders with headless Chromium (Playwright), so the image bundles a
# Chromium build. It runs the TypeScript entrypoint directly via `tsx` — the
# render engine loads font assets by path, which a bundler would relocate, so
# running source is the simplest correct option. Slimming this to a bundled
# runtime is a future optimization.

FROM node:24-slim AS base
WORKDIR /app

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

# --- Source ---
COPY . .

# HTTP API port (override with PORT).
EXPOSE 8788

# Config comes from the environment (see .env.example). Mount a .env or pass
# -e vars; nothing house-specific is baked into the image.
CMD ["yarn", "workspace", "@inkcast/server", "start:prod"]
