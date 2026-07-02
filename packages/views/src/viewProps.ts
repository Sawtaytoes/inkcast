/**
 * Shared shape passed to every Inkcast view. A view is a pure function of its
 * data plus the target panel's size and colour mode, so the same component can
 * be rendered for the 250×122 mono pHAT and the 800×480 E6 Impression.
 */
export type ViewColourMode = "mono" | "e6"

export type PanelViewProps = {
  width: number
  height: number
  colourMode: ViewColourMode
}

/** The data every now-playing view variant renders. */
export type NowPlayingViewProps = PanelViewProps & {
  artist: string
  title: string
  isPlaying: boolean
  /** Album art / Plex poster as a data: URI, pre-fetched server-side. */
  artworkDataUri?: string
}
