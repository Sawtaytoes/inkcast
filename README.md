# CastKit

A self-hostable **home display platform**: one server drives every screen in the
house over MQTT, and every screen shows up in Home Assistant automatically via
MQTT discovery. Home Assistant is the brain — it pushes each screen's data and
decides which view is active; CastKit turns that into pixels.

There are two **client modes**, named after the products they started as:

| Mode | Name | Who renders | Devices |
| --- | --- | --- | --- |
| `image` | **Inkcast** | The **server** renders a React view → PNG, dithers it per panel, and pushes it over MQTT. | Dumb e-ink receivers (Pi Zero W + Inky panels); ESP32 e-ink (planned). |
| `browser` | **Slatecast** | The **device** renders: a kiosk browser (Chromium/WPE) loads a per-device page and a tiny Preact SPA draws live, optionally touch-interactive views. | Touch kiosks and display-only web screens (Pi 4 / Pi Zero 2 W). |

The line between the modes is *who renders*, not touch: a touchless round screen
runs browser mode, and a future ESP32 touch e-ink panel runs image mode with a
tap uplink. Each device declares **capabilities** (`renderer`, `touch`, `colour`,
resolution, `shape`) that decide which views it can show and how they render.

## Why

- **E-ink (Inkcast mode):** rendering on-device needs a beefy Pi. The server does
  all the work (render + dither) and the device just draws a PNG — a 512 MB
  Pi Zero W is enough. Pushes happen on data change, so clocks stay accurate.
- **Touch screens (Slatecast mode):** full dashboard SPAs (e.g. Music Assistant's)
  eat hundreds of MB of browser memory on a kiosk Pi. Slatecast serves a purpose-built
  page with a <60 KB bundle: album art, live seek bar, transport controls — and
  nothing else. Commands go back over MQTT so Home Assistant decides what they do.

## Architecture

```
Home Assistant (data + view selection + command execution — all over MQTT)
        │ retained data pushes            ▲ castkit/<id>/command
        ▼                                 │
CastKit server (Docker)
  • device registry: static capabilities (renderer, touch, colour, size, shape)
  • HA MQTT discovery: every screen = an HA device with a View select + config knobs
  • retained-MQTT state = persistence (no database)
  • image mode: React view → render (Chromium/Satori) → dither → retained PNG topic
  • browser mode: serves /d/<id> (Preact SPA) + one WebSocket per device
        │ MQTT push (PNG)                      │ HTTP + WS
        ▼                                      ▼
e-ink Pi (dumb receiver)                kiosk browser (Chromium/WPE)
```

**No credentials for anything live in CastKit.** Home Assistant pushes view data
in (now-playing, weather, agenda, queue) and executes device commands out — the
"CastKit ↔ house" contract is MQTT and nothing else.

## Packages

| Package | What it does |
| --- | --- |
| `@castkit/core` | Panels, palettes, device registry types, the supersample/downscale/dither pipeline (image mode). |
| `@castkit/views` | React view components for server rendering (inline styles + flexbox so both render engines agree). |
| `@castkit/render` | Render engines — headless Chromium (Playwright) and Satori (SVG→resvg) (image mode). |
| `@castkit/shared` | The MQTT/HA layer both modes share: client wrapper, discovery builders, payload schemas, config-knob framework. |
| `@castkit/server` | The one server: registry, discovery, knobs, render+push for image devices, pages+WebSocket for browser devices. |
| `@castkit/slatecast` | The browser-mode Preact SPA (now-playing controller, queue, ambient views). |

## Quick start

Requires Node 24+ and Yarn 4 (bundled via `.yarn/releases`).

```bash
yarn install
yarn playwright install chromium   # the Chromium render engine needs a browser

yarn lint        # Biome + ESLint (auto-fix)
yarn typecheck   # full monorepo type check
yarn test        # Vitest
```

Image-mode render/dither bake-offs: `yarn bakeoff:render`, `yarn bakeoff:dither`
(→ `render-output/`). E-ink can't be screenshotted, so these contact sheets are
how you judge output before it hits a panel.

Code conventions live in [AGENTS.md](AGENTS.md); settled design decisions in
[docs/decisions/](docs/decisions/README.md).

## History

CastKit began life as **Inkcast** (the e-ink platform) — the repo was renamed
when the interactive-browser sibling (**Slatecast**) merged in as a second client
mode of the same server. Old `github.com/Sawtaytoes/inkcast` links redirect here.

## License

[MIT](LICENSE) © Kevin Ghadyani
