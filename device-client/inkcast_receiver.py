#!/usr/bin/env python3
"""
Inkcast device-side MQTT receiver
=================================
A tiny resident client for a Raspberry Pi driving a Pimoroni Inky panel. It
subscribes to the Inkcast server's per-device image topic and draws each
received frame to the panel. The Inkcast server has ALREADY dithered, sized, and
rotated the image for this exact panel before publishing, so the receiver is a
"dumb" sink: decode the bytes and push them, no extra image processing.

The payload is usually a palette PNG (dithered views), but the photo frame with
dithering off ships a lossy JPEG instead (much smaller on the wire; the panel
re-dithers it). PIL sniffs the format from the bytes, so both just work — but
note WebP is deliberately NOT used on ARMv6 Pis (Zero W): piwheels' libwebp
SIGILLs there even though PIL reports webp support. See the server's
docs/decisions/2026-07-03-photo-frame-jpeg-not-webp-on-armv6.md.

Design notes (Pi Zero W / ARMv6 / 512 MB):
  * Keep the process RESIDENT. Importing PIL/inky costs a few seconds on ARMv6;
    the e-ink refresh itself is ~2-3 s. Import once, then react to messages.
  * The image topic is RETAINED (QoS 1) on the broker, so on every (re)connect
    the last frame is delivered immediately — the panel is correct after a
    reboot or a network blip without waiting for a fresh server push.
  * Redraw only when the PNG bytes actually change, so we don't wear/ghost the
    e-ink panel on duplicate deliveries.
  * Only one process may own the SPI/GPIO bus at a time, so the OLD fetcher
    (inky-phat-fetcher.service) MUST be stopped before this runs.

Environment / config (all optional except the broker host):
  MQTT_HOST             broker hostname/IP (required; e.g. <ha-host>)
  MQTT_PORT             broker port (default 1883 plain; 8883 = TLS)
  MQTT_USERNAME         broker username
  MQTT_PASSWORD         broker password
  MQTT_URL              alternative to MQTT_HOST/PORT: mqtt(s)://host:port (parsed)
  MQTT_TLS              force TLS on/off ("1"/"true"/"0"/"false"); default: auto
                        (TLS when port is 8883 or MQTT_URL scheme is mqtts).
                        The broker presents a publicly-trusted (Let's Encrypt)
                        cert, so no CA file is needed — the system trust store
                        verifies it. Set MQTT_CA_FILE only for a private CA.
  MQTT_CA_FILE          optional CA bundle path (default: system trust store)
  INKCAST_IMAGE_TOPIC   image topic to subscribe (default inkcast/inky-phat/image)
  INKCAST_AVAIL_TOPIC   availability topic to publish online/offline
                        (default <image-topic-prefix>/receiver/availability)
  INKCAST_ROTATE        extra rotation in degrees (default 0 — the server
                        already rotates; only set this if the panel is upside
                        down, which would mean the rotation is doubled)
  INKCAST_CLIENT_ID     MQTT client id (default inkcast-receiver-<panel>)

Run: /home/pi/inky-venv/bin/python3 inkcast_receiver.py
"""
import hashlib
import io
import os
import sys
import time
from urllib.parse import urlparse

import paho.mqtt.client as mqtt
from PIL import Image


DEFAULT_IMAGE_TOPIC = "inkcast/inky-phat/image"
RECONNECT_DELAY_SECONDS = 5


def read_broker_config():
    """Resolve broker host/port/credentials from the environment.

    Prefers explicit MQTT_HOST/MQTT_PORT; falls back to parsing MQTT_URL
    (mqtt://host:port) so the same env used by the server also works here.
    """
    mqtt_url = os.environ.get("MQTT_URL", "").strip()
    parsed_url = urlparse(mqtt_url) if mqtt_url else None

    host = os.environ.get("MQTT_HOST", "").strip() or (
        parsed_url.hostname if parsed_url else None
    )
    if not host:
        raise RuntimeError(
            "no broker host: set MQTT_HOST (or MQTT_URL=mqtt://host:port)"
        )

    port_from_env = os.environ.get("MQTT_PORT", "").strip()
    port = int(port_from_env) if port_from_env else (
        (parsed_url.port if parsed_url and parsed_url.port else 1883)
    )

    username = os.environ.get("MQTT_USERNAME", "").strip() or None
    password = os.environ.get("MQTT_PASSWORD", "").strip() or None

    # TLS: explicit MQTT_TLS wins; otherwise auto-detect from port 8883 or an
    # mqtts:// URL scheme. The broker uses a publicly-trusted (Let's Encrypt)
    # cert, so the default (no CA file) verifies against the system trust store.
    tls_override = os.environ.get("MQTT_TLS", "").strip().lower()
    if tls_override in ("1", "true", "yes", "on"):
        use_tls = True
    elif tls_override in ("0", "false", "no", "off"):
        use_tls = False
    else:
        use_tls = port == 8883 or (parsed_url.scheme == "mqtts" if parsed_url else False)
    ca_file = os.environ.get("MQTT_CA_FILE", "").strip() or None

    return {
        "host": host,
        "port": port,
        "username": username,
        "password": password,
        "tls": use_tls,
        "ca_file": ca_file,
    }


def derive_availability_topic(image_topic):
    """Default availability topic sits under the same device prefix.

    e.g. "inkcast/inky-phat/image" -> "inkcast/inky-phat/receiver/availability".
    """
    explicit_topic = os.environ.get("INKCAST_AVAIL_TOPIC", "").strip()
    if explicit_topic:
        return explicit_topic

    prefix = image_topic.rsplit("/", 1)[0] if "/" in image_topic else image_topic
    return f"{prefix}/receiver/availability"


def draw_png_to_panel(panel, png_bytes, rotate_degrees):
    """Decode a PNG and push it to the Inky panel.

    The server already dithered/sized/rotated for this panel, so the default
    path draws the image as-is. `rotate_degrees` is an escape hatch for a
    remounted panel; it defaults to 0.
    """
    image = Image.open(io.BytesIO(png_bytes))
    has_rotation = rotate_degrees % 360 != 0
    oriented_image = image.rotate(rotate_degrees, expand=False) if has_rotation else image

    panel.set_image(oriented_image)
    panel.show()


def main():
    image_topic = os.environ.get("INKCAST_IMAGE_TOPIC", DEFAULT_IMAGE_TOPIC).strip()
    availability_topic = derive_availability_topic(image_topic)
    rotate_degrees = int(os.environ.get("INKCAST_ROTATE", "0"))
    broker = read_broker_config()

    # Import the heavy stack ONCE, then auto-detect the attached panel.
    import_started_at = time.time()
    from inky.auto import auto

    panel = auto(ask_user=False)
    print(
        f"[init] {type(panel).__name__} {panel.resolution} "
        f"colour={panel.colour} (import+detect {time.time() - import_started_at:.1f}s)",
        flush=True,
    )
    print(
        f"[init] subscribing to '{image_topic}' on "
        f"{broker['host']}:{broker['port']} (rotate={rotate_degrees})",
        flush=True,
    )

    # Track the last drawn PNG so duplicate retained/republished frames don't
    # needlessly refresh (and ghost) the e-ink panel. `const`-style: reassigned
    # only inside the message callback via a one-element holder to avoid a
    # module-global.
    last_drawn_hash = {"value": None}

    def on_connect(client, userdata, flags, reason_code, properties=None):
        if reason_code == 0:
            print("[mqtt] connected", flush=True)
            client.publish(availability_topic, "online", qos=1, retain=True)
            client.subscribe(image_topic, qos=1)
            print(f"[mqtt] subscribed to {image_topic}", flush=True)
        else:
            print(f"[mqtt] connect failed: reason_code={reason_code}", flush=True)

    def on_disconnect(client, userdata, flags, reason_code, properties=None):
        print(f"[mqtt] disconnected (reason_code={reason_code}); will retry", flush=True)

    def on_message(client, userdata, message):
        png_bytes = message.payload
        if not png_bytes:
            print("[msg] empty payload; ignoring", flush=True)
            return

        message_hash = hashlib.sha256(png_bytes).hexdigest()
        if message_hash == last_drawn_hash["value"]:
            print(f"[msg] {len(png_bytes)}B unchanged; skip redraw", flush=True)
            return

        drawing_started_at = time.time()
        try:
            draw_png_to_panel(panel, png_bytes, rotate_degrees)
            last_drawn_hash["value"] = message_hash
            print(
                f"[draw] {len(png_bytes)}B pushed in "
                f"{time.time() - drawing_started_at:.1f}s",
                flush=True,
            )
        except Exception as draw_error:
            print(f"[err] draw failed: {draw_error}", flush=True)

    client = mqtt.Client(
        mqtt.CallbackAPIVersion.VERSION2,
        client_id=os.environ.get(
            "INKCAST_CLIENT_ID",
            # Default from the topic's DEVICE id (unique per screen), not the
            # panel TYPE: two identical panels (e.g. two Impression 13.3") both
            # detect as `Inky`, so a type-based id collides and the broker keeps
            # kicking one off (session takeover → reconnect flapping).
            f"inkcast-receiver-{image_topic.split('/')[1] if image_topic.count('/') >= 2 else 'device'}",
        ),
    )
    if broker["username"]:
        client.username_pw_set(broker["username"], broker["password"])

    # Enable TLS before connect when targeting the encrypted listener (8883).
    # No args → verify the broker cert against the OS trust store (works for the
    # publicly-trusted Let's Encrypt cert); MQTT_CA_FILE overrides for a private CA.
    if broker["tls"]:
        client.tls_set(ca_certs=broker["ca_file"])
        print(
            f"[mqtt] TLS enabled (ca={'system' if not broker['ca_file'] else broker['ca_file']})",
            flush=True,
        )

    # Last Will: if we drop off ungracefully, the broker marks us offline.
    client.will_set(availability_topic, "offline", qos=1, retain=True)
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.on_message = on_message

    # Built-in exponential backoff reconnect keeps us resilient to broker/network
    # blips without a hand-rolled loop.
    client.reconnect_delay_set(min_delay=1, max_delay=RECONNECT_DELAY_SECONDS)
    client.connect(broker["host"], broker["port"], keepalive=60)

    try:
        client.loop_forever()
    except KeyboardInterrupt:
        print("[exit] interrupted; publishing offline", flush=True)
        client.publish(availability_topic, "offline", qos=1, retain=True)
        client.disconnect()

    return 0


if __name__ == "__main__":
    sys.exit(main())
