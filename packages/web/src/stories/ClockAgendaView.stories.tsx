import { ClockAgendaView } from "@inkcast/views/ClockAgendaView"
import type { Meta, StoryObj } from "@storybook/react-vite"

/**
 * The agenda clock at both panel sizes. Time/date/weather and each event's
 * `timeText` are pre-formatted strings (the server formats them per panel size
 * in the configured timezone), so the story passes sample strings. The
 * empty-day stories show the degrade-to-Clock(Weather) fallback.
 */
const meta = {
  title: "Views/ClockAgendaView",
  component: ClockAgendaView,
  argTypes: {
    colourMode: {
      control: "inline-radio",
      options: ["mono", "e6"],
    },
  },
} satisfies Meta<typeof ClockAgendaView>

export default meta
type Story = StoryObj<typeof meta>

export const PhatMono: Story = {
  name: "pHAT mono (1 event)",
  args: {
    width: 250,
    height: 122,
    colourMode: "mono",
    time: "1:34p",
    date: "We-02",
    temperatureText: "79°",
    conditionText: "Partly cloudy",
    events: [{ timeText: "2:30p", summary: "Dentist" }],
  },
}

export const PhatMonoEmpty: Story = {
  name: "pHAT mono (no events)",
  args: {
    width: 250,
    height: 122,
    colourMode: "mono",
    time: "1:34p",
    date: "We-02",
    temperatureText: "79°",
    conditionText: "Partly cloudy",
    events: [],
  },
}

export const ImpressionE6: Story = {
  name: "Impression E6 (4 events)",
  args: {
    width: 800,
    height: 480,
    colourMode: "e6",
    time: "1:34 PM",
    date: "Wednesday, July 2",
    temperatureText: "79°",
    conditionText: "Partly cloudy",
    events: [
      {
        timeText: "2:30 PM",
        summary: "Dentist appointment",
      },
      { timeText: "4:00 PM", summary: "Pick up kids" },
      {
        timeText: "6:30 PM",
        summary: "Dinner with the Parkers",
      },
      { timeText: "All day", summary: "Ashlee's birthday" },
    ],
  },
}

export const ImpressionE6Empty: Story = {
  name: "Impression E6 (no events)",
  args: {
    width: 800,
    height: 480,
    colourMode: "e6",
    time: "1:34 PM",
    date: "Wednesday, July 2",
    temperatureText: "79°",
    conditionText: "Partly cloudy",
    events: [],
  },
}
