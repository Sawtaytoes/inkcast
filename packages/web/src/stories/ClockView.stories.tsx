import { ClockView } from "@castkit/views/ClockView"
import type { Meta, StoryObj } from "@storybook/react-vite"

/**
 * The clock view at both panel sizes. Time/date are pre-formatted strings (the
 * server formats them in the configured timezone), so the story just passes
 * sample strings.
 */
const meta = {
  title: "Views/ClockView",
  component: ClockView,
  argTypes: {
    colourMode: {
      control: "inline-radio",
      options: ["mono", "e6"],
    },
  },
} satisfies Meta<typeof ClockView>

export default meta
type Story = StoryObj<typeof meta>

export const PhatMono: Story = {
  name: "pHAT mono",
  args: {
    width: 250,
    height: 122,
    colourMode: "mono",
    time: "7:34 PM",
    date: "Wednesday, July 1",
  },
}

export const ImpressionE6: Story = {
  name: "Impression E6",
  args: {
    width: 800,
    height: 480,
    colourMode: "e6",
    time: "7:34 PM",
    date: "Wednesday, July 1",
  },
}
