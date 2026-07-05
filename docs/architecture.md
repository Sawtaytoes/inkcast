# Inkcast architecture (data flow)

Everything is **MQTT pub/sub through one broker** — no actor opens a direct connection to
another. Three roles:

- **Home Assistant** — the brain. Pushes each screen's view data, drives the View
  select / Refresh / config knobs, and auto-creates the entities it's told about.
- **Inkcast server (container)** — renders pixels and **owns the device list**
  (each device's geometry + colour mode). At boot it publishes the retained HA
  MQTT-discovery configs; that publish is what makes the entities appear in HA.
- **Device (Pi receiver)** — a dumb sink: subscribes to one image topic, decodes the
  PNG, draws it.

```mermaid
flowchart TB
  BROKER{{"MQTT broker"}}

  subgraph HA["Home Assistant — the brain"]
    direction TB
    A1["Pushes view data:<br/>inkcast/&lt;id&gt;/{now_playing,weather,agenda}/set"]
    A2["Drives View / Refresh / config knobs:<br/>inkcast/&lt;id&gt;/{view,refresh,dither,…}/set"]
    A3["Auto-creates entities from discovery"]
  end

  subgraph SRV["Inkcast server — container (renders pixels)"]
    direction TB
    S1["Owns device list: id, width, height, colourMode"]
    S2["render → dither → size → PNG"]
    S3["Publishes retained HA discovery:<br/>homeassistant/&lt;component&gt;/inkcast/&lt;id&gt;_&lt;entity&gt;/config"]
  end

  subgraph DEV["Pi receiver — dumb sink"]
    direction TB
    D1["Subscribes inkcast/&lt;id&gt;/image (retained PNG)"]
    D2["decode → set_image → show"]
  end

  HA <-->|MQTT| BROKER
  SRV <-->|"finished PNG → inkcast/&lt;id&gt;/image (retained)"| BROKER
  BROKER <-->|"retained PNG"| DEV
  DEV -->|"availability (Last-Will)"| BROKER
```

## Two things MQTT gives us that make this work

- **Retained messages.** The broker keeps the last message on a topic and replays it to
  any new subscriber. That's why a rebooted Pi instantly redraws (the PNG on
  `inkcast/<id>/image` is retained), and why *stale* retained configs show up as ghost HA
  entities until explicitly cleared with an empty retained payload.
- **Wildcards (subscribe side).** `+` matches one topic level, `#` matches the rest — so a
  process can watch `inkcast/+/image` or `inkcast/<id>/#` without knowing every topic
  ahead of time.

## Alternative considered: device self-registration (not adopted)

Instead of Inkcast holding the device list, each device could **announce itself** with a
retained "birth" message carrying its geometry, and Inkcast would discover the fleet by
subscribing with a wildcard:

```mermaid
flowchart TB
  BROKER{{"MQTT broker"}}
  DEV["Device"] -->|"retained birth:<br/>inkcast/&lt;id&gt;/register = {width,height,colourMode,mac}"| BROKER
  BROKER -->|"replays all retained births<br/>(even ones sent while server was down)"| SRV["Inkcast server<br/>subscribes inkcast/+/register"]
  SRV -->|"build render-registry + publish HA discovery"| BROKER
```

This answers "how would Inkcast know to look for them?" — a device's retained `register`
message persists on the broker, so a server that (re)connects later still receives every
device's registration the moment it subscribes to `inkcast/+/register`.

| | Central config (today) | Device self-registration |
| --- | --- | --- |
| Device firmware | truly dumb (one image topic) | must publish its own geometry (heavier) |
| Add/remove a screen | edit config file + restart | plug in / clear its retained `register` |
| Source of truth for geometry | one reviewable file | the device itself |
| Rogue/duplicate devices | impossible (server-owned) | must validate incoming registrations |
| Dead-device cleanup | delete a config line | clear a retained topic (same ghost risk) |
| ESPHome dumb-fetcher fit | good | poor (can't self-register richly) |

**Verdict:** for a small, stable home fleet and the dumb-sink/ESPHome direction, central
config is simpler and keeps the device dumb. Self-registration is the idiomatic MQTT answer
for large or plug-and-play fleets. Kept central config; revisit if the fleet grows.
