import { type Browser, chromium } from "playwright"
import { renderToStaticMarkup } from "react-dom/server"
import type {
  RenderEngine,
  RenderRequest,
} from "./engine.ts"
import { FONT_FAMILY, loadFontBytes } from "./fonts.ts"

/**
 * The headless-Chromium render engine (the handoff's recommended default). It
 * SSRs the view to static HTML, loads it in a real browser at the native CSS
 * size with `deviceScaleFactor = supersampleFactor`, and screenshots it — so
 * the supersampled PNG comes out at `width × supersampleFactor`.
 *
 * Because it is a real browser, the Vite dev-preview renders the identical
 * engine: what you see in the editor is what the device gets (pre-dither).
 * The trade-off is weight (bundled Chromium) and per-render latency.
 */

/**
 * Wrap SSR'd view markup in a minimal, zero-margin full-bleed document. The
 * panel font is embedded as base64 `@font-face` so rendering is identical
 * everywhere — dev machine, CI, and the fontless container image.
 */
const buildHtmlDocument = ({
  width,
  height,
  bodyMarkup,
  fontFaceCss,
}: {
  width: number
  height: number
  bodyMarkup: string
  fontFaceCss: string
}) => `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  ${fontFaceCss}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${width}px; height: ${height}px; }
  body { overflow: hidden; }
</style>
</head>
<body>${bodyMarkup}</body>
</html>`

const buildFontFaceCss = async () => {
  const { regularData, boldData } = await loadFontBytes()
  const toFontFace = ({
    data,
    weight,
  }: {
    data: Buffer
    weight: number
  }) => `@font-face {
    font-family: "${FONT_FAMILY}";
    font-weight: ${weight};
    src: url(data:font/ttf;base64,${data.toString("base64")}) format("truetype");
  }`

  return [
    toFontFace({ data: regularData, weight: 400 }),
    toFontFace({ data: boldData, weight: 700 }),
  ].join("\n")
}

/**
 * Create a Chromium engine backed by one long-lived browser process. Call
 * `close()` when the batch is done. Reusing the browser across renders keeps
 * the expensive launch cost off the per-render path.
 */
export const createChromiumEngine = async (): Promise<
  RenderEngine & { close: () => Promise<void> }
> => {
  // Container-safe flags: Chromium refuses to run as root in Docker without
  // --no-sandbox, and /dev/shm defaults to 64MB there. The sandbox guards
  // against untrusted web content; this engine only ever loads our own SSR'd
  // markup, so dropping it is safe.
  const browser: Browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  })
  const fontFaceCss = await buildFontFaceCss()

  const render = async ({
    element,
    width,
    height,
    supersampleFactor,
  }: RenderRequest) => {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: supersampleFactor,
    })

    // Always tear the context down, even if rendering throws — a leaked context
    // keeps the browser (and the Node event loop) alive and looks like a hang.
    try {
      const page = await context.newPage()

      await page.setContent(
        buildHtmlDocument({
          width,
          height,
          bodyMarkup: renderToStaticMarkup(element),
          fontFaceCss,
        }),
        { waitUntil: "load" },
      )

      // Ensure fonts are laid out before snapshotting, else text metrics/screenshot
      // can race. (Avoids `networkidle`, which Playwright warns can hang.)
      await page.evaluate(() => document.fonts.ready)

      return await page.screenshot({
        type: "png",
        clip: { x: 0, y: 0, width, height },
      })
    } finally {
      await context.close()
    }
  }

  return {
    name: "chromium",
    render,
    close: () => browser.close(),
  }
}
