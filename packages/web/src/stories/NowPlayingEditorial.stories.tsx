import { NowPlayingEditorial } from "@inkcast/views/NowPlayingEditorial"
import type { Meta, StoryObj } from "@storybook/react-vite"

/**
 * The now-playing view at both real panel sizes, in playing/idle states, plus a
 * long-text case. This is the "see + test the views" surface — what renders here
 * (in a browser) is what the Chromium engine gives the device, pre-dither.
 */
const meta = {
  title: "Views/NowPlayingEditorial",
  component: NowPlayingEditorial,
  argTypes: {
    colourMode: {
      control: "inline-radio",
      options: ["mono", "e6"],
    },
    isPlaying: { control: "boolean" },
  },
} satisfies Meta<typeof NowPlayingEditorial>

export default meta
type Story = StoryObj<typeof meta>

const MONO = {
  width: 250,
  height: 122,
  colourMode: "mono",
} as const
const E6 = {
  width: 800,
  height: 480,
  colourMode: "e6",
} as const

export const PhatMonoPlaying: Story = {
  name: "pHAT mono — playing",
  args: {
    ...MONO,
    artist: "Twilight Force",
    title: "Dawn of the Dragonstar",
    isPlaying: true,
  },
}

export const PhatMonoIdle: Story = {
  name: "pHAT mono — idle",
  args: {
    ...MONO,
    artist: "Twilight Force",
    title: "Dawn of the Dragonstar",
    isPlaying: false,
  },
}

export const ImpressionE6Playing: Story = {
  name: "Impression E6 — playing",
  args: {
    ...E6,
    artist: "Twilight Force",
    title: "Dawn of the Dragonstar",
    isPlaying: true,
  },
}

export const LongTextMono: Story = {
  name: "pHAT mono — long text",
  args: {
    ...MONO,
    artist: "The Chemical Brothers & Friends",
    title: "Believe (Extended Instrumental Mix)",
    isPlaying: true,
  },
}
