# Inkcast device client (Pi-side MQTT receiver)

A tiny resident Python client for a Raspberry Pi driving a Pimoroni **Inky**
panel. It subscribes to the Inkcast server's per-device image topic and draws
each received PNG to the panel.

> **Not a Pi?** A self-contained ESP32 touch-e-ink panel (M5Paper) joins the
> fleet without a Pi — it pulls its render over HTTP and reports touch over the
> ESPHome API. Its firmware lives in [`esphome/`](esphome/README.md).

The Inkcast **server** does all the work — it renders the view, dithers and
sizes the image for the exact panel, and (for panels mounted upside-down)
rotates it — then publishes the finished PNG to MQTT with `retain=true`, QoS 1.
This receiver is a *dumb sink*: decode the bytes, `set_image()`, `show()`. No
extra image processing, and **no extra rotation** (the server already applied
it — adding rotation here would double it).

## Files

| File | Purpose |
| --- | --- |
| `inkcast_receiver.py` | The resident MQTT subscriber → Inky drawer. |
| `inkcast-receiver.service` | systemd unit (template — reads creds from a drop-in). |

## Requirements on the Pi

- The Pimoroni `inky` library and `Pillow` (already present on these devices,
  installed in a virtualenv, e.g. `~/inky-venv`).
- `paho-mqtt` (installed below).
- SPI enabled. The Inky pHAT additionally needs `dtoverlay=spi0-0cs` in
  `/boot/firmware/config.txt` (already set on the target device).
- **Only one process may own SPI/GPIO at a time** — the old fetcher must be
  stopped before this one starts (see below).

## Install

Run from your workstation (adjust `pi@<host>` and the venv path to match).

```bash
# 1. Copy the receiver and unit to the Pi.
scp device-client/inkcast_receiver.py       pi@<host>:/home/pi/inkcast_receiver.py
scp device-client/inkcast-receiver.service  pi@<host>:/tmp/inkcast-receiver.service

# 2. Install paho-mqtt into the existing venv (inky + Pillow already present).
ssh pi@<host> '~/inky-venv/bin/pip install paho-mqtt'

# 3. Install the systemd unit.
ssh pi@<host> 'sudo mv /tmp/inkcast-receiver.service /etc/systemd/system/inkcast-receiver.service'

# 4. Create the ROOT-OWNED, mode-600 credentials drop-in (NOT in git).
#    Replace the placeholders with your broker host + Inkcast MQTT login.
ssh pi@<host> 'sudo install -d -m 755 /etc/systemd/system/inkcast-receiver.service.d && \
  printf "%s\n" \
    "[Service]" \
    "Environment=MQTT_HOST=<ha-host>" \
    "Environment=MQTT_PORT=8883" \
    "Environment=MQTT_USERNAME=<mqtt-username>" \
    "Environment=MQTT_PASSWORD=<mqtt-password>" \
    "Environment=INKCAST_IMAGE_TOPIC=inkcast/inky-phat/image" \
  | sudo tee /etc/systemd/system/inkcast-receiver.service.d/mqtt.conf >/dev/null && \
  sudo chown root:root /etc/systemd/system/inkcast-receiver.service.d/mqtt.conf && \
  sudo chmod 600 /etc/systemd/system/inkcast-receiver.service.d/mqtt.conf'

# 5. Stop + DISABLE the old fetcher (keep the unit file for rollback), then
#    enable + start the receiver. Only one process may own SPI at a time.
ssh pi@<host> 'sudo systemctl disable --now inky-phat-fetcher && \
  sudo systemctl daemon-reload && \
  sudo systemctl enable --now inkcast-receiver'

# 6. Confirm it connected and drew a frame.
ssh pi@<host> 'journalctl -u inkcast-receiver -n 40 --no-pager'
```

## Configuration (environment variables)

Set these in the drop-in (`.../inkcast-receiver.service.d/mqtt.conf`).

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `MQTT_HOST` | yes* | — | Broker hostname/IP. |
| `MQTT_PORT` | no | `1883` | Broker port. `8883` = TLS (auto-enables `tls_set`). |
| `MQTT_TLS` | no | auto | Force TLS on/off; default auto (on when port `8883`). Broker's Let's Encrypt cert verifies against the system trust store. |
| `MQTT_CA_FILE` | no | — | CA bundle path; only for a private CA (LE needs none). |
| `MQTT_USERNAME` | no | — | Broker username. |
| `MQTT_PASSWORD` | no | — | Broker password. |
| `MQTT_URL` | no | — | Alternative to `MQTT_HOST`/`MQTT_PORT`: `mqtt://host:port`. |
| `INKCAST_IMAGE_TOPIC` | no | `inkcast/inky-phat/image` | Retained image topic to subscribe. |
| `INKCAST_AVAIL_TOPIC` | no | `<prefix>/receiver/availability` | Where the client publishes `online`/`offline`. |
| `INKCAST_ROTATE` | no | `0` | Extra rotation (deg). Leave `0` — the server already rotates. Only set if the panel shows upside-down. |
| `INKCAST_CLIENT_ID` | no | `inkcast-receiver-<panel>` | MQTT client id. |

\* Either `MQTT_HOST` or `MQTT_URL` must be set.

**Never commit real credentials.** They live only in the root-owned, mode-600
drop-in on the device.

## Rollback

Revert to the old fetcher in one step (keeps the unit files around either way):

```bash
ssh pi@<host> 'sudo systemctl disable --now inkcast-receiver && \
  sudo systemctl enable --now inky-phat-fetcher'
```

## Buttons (optional) — `inkcast_buttons.py`

Wires the Inky Impression's 4 side buttons to the server's image-change MQTT
commands, so a press advances/steps/refreshes the photo without touching HA.

`inkcast_buttons.py` reads the buttons over `gpiod` and publishes `PRESS` to
`inkcast/<device>/{photo_next,photo_previous,refresh}/set` (the same command
topics the HA buttons use). It's independent of the receiver — different GPIO
lines — so both services run together.

**Button GPIO differs by panel** (the 13.3" display driver claims GPIO16/26, so
its buttons moved):

| Label | Impression 7.3" | Impression 13.3" | Default action |
| --- | --- | --- | --- |
| A | GPIO5  | GPIO5  | Next photo |
| B | GPIO6  | GPIO6  | Previous photo |
| C | GPIO16 | GPIO25 | Refresh (new photo) |
| D | GPIO24 | GPIO24 | Next photo |

Edit `BUTTON_ACTIONS` at the top of `inkcast_buttons.py` to remap. Install:

```bash
scp device-client/inkcast_buttons.py       pi@<host>:/home/pi/inkcast_buttons.py
scp device-client/inkcast-buttons.service  pi@<host>:/tmp/inkcast-buttons.service
ssh pi@<host> 'sudo mv /tmp/inkcast-buttons.service /etc/systemd/system/ && \
  sudo install -d -m 755 /etc/systemd/system/inkcast-buttons.service.d && \
  sudo cp /etc/systemd/system/inkcast-receiver.service.d/mqtt.conf \
          /etc/systemd/system/inkcast-buttons.service.d/mqtt.conf && \
  sudo chmod 600 /etc/systemd/system/inkcast-buttons.service.d/mqtt.conf && \
  sudo systemctl daemon-reload && sudo systemctl enable --now inkcast-buttons'
```

The drop-in is the receiver's — broker host/creds + `INKCAST_IMAGE_TOPIC` (the
device id is derived from it). To confirm a press: `journalctl -u inkcast-buttons -f`.
