#!/usr/bin/env python3
"""Inkcast device-side button handler.

Reads the Inky Impression 13.3" side buttons and publishes the matching Inkcast
MQTT image-change command to the server (which re-renders and pushes a new frame
to this device's inkcast-receiver). Independent of the receiver — separate GPIO
pins (buttons: 5/6/24/25; the EL133UF1 display driver owns 16/17/22/26/27).

Buttons (BCM). 13.3" is portrait, so A/B match the 7.3"; C moved off GPIO16
(now used by the 13.3" display driver) to GPIO25:
    A = GPIO5   Next photo
    B = GPIO6   Previous photo
    C = GPIO25  Refresh (re-render / new photo)
    D = GPIO24  Next photo
Broker + device topic come from the same root-owned drop-in the receiver uses
(MQTT_HOST/PORT/USERNAME/PASSWORD + INKCAST_IMAGE_TOPIC).
"""
import os
import time

import gpiod
from gpiod.line import Bias, Direction, Value
import paho.mqtt.client as mqtt

BUTTON_ACTIONS = {
    5: "photo_next",
    6: "photo_previous",
    25: "refresh",
    24: "photo_next",
}
CHIP = "/dev/gpiochip0"
DEBOUNCE_SECONDS = 0.4


def env(name, default=None):
    value = os.environ.get(name, "").strip()
    return value or default


def main():
    image_topic = env("INKCAST_IMAGE_TOPIC", "inkcast/inky-phat/image")
    device_id = env("INKCAST_DEVICE_ID") or image_topic.split("/")[1]
    base_topic = f"inkcast/{device_id}"
    host = env("MQTT_HOST")
    port = int(env("MQTT_PORT", "1883"))
    username = env("MQTT_USERNAME")
    password = env("MQTT_PASSWORD")
    if not host:
        raise RuntimeError("no broker host: set MQTT_HOST in the drop-in")

    # TLS: explicit MQTT_TLS wins, else auto-detect from port 8883. The broker's
    # Let's Encrypt cert verifies against the system trust store (no CA file).
    tls_override = env("MQTT_TLS", "").lower()
    if tls_override in ("1", "true", "yes", "on"):
        use_tls = True
    elif tls_override in ("0", "false", "no", "off"):
        use_tls = False
    else:
        use_tls = port == 8883
    ca_file = env("MQTT_CA_FILE")

    client = mqtt.Client(
        mqtt.CallbackAPIVersion.VERSION2,
        client_id=f"inkcast-buttons-{device_id}",
    )
    if username:
        client.username_pw_set(username, password)
    if use_tls:
        client.tls_set(ca_certs=ca_file)
        print(f"[buttons] TLS enabled (ca={'system' if not ca_file else ca_file})", flush=True)
    client.connect_async(host, port)
    client.loop_start()

    requests = {}
    for pin in BUTTON_ACTIONS:
        requests[pin] = gpiod.request_lines(
            CHIP,
            consumer=f"inkcast-btn-{pin}",
            config={pin: gpiod.LineSettings(direction=Direction.INPUT, bias=Bias.PULL_UP)},
        )
    print(
        f"[buttons] {device_id}: watching {sorted(BUTTON_ACTIONS)} "
        f"-> {base_topic}/<cmd>/set on {host}:{port}",
        flush=True,
    )

    last_level = {pin: Value.ACTIVE for pin in BUTTON_ACTIONS}
    last_fire = {pin: 0.0 for pin in BUTTON_ACTIONS}
    try:
        while True:
            now = time.time()
            for pin, action in BUTTON_ACTIONS.items():
                level = requests[pin].get_value(pin)
                pressed = level == Value.INACTIVE and last_level[pin] == Value.ACTIVE
                if pressed and (now - last_fire[pin]) > DEBOUNCE_SECONDS:
                    topic = f"{base_topic}/{action}/set"
                    client.publish(topic, "PRESS", qos=1)
                    last_fire[pin] = now
                    print(f"[press] BCM{pin} -> {topic}", flush=True)
                last_level[pin] = level
            time.sleep(0.01)
    finally:
        for request in requests.values():
            try:
                request.release()
            except Exception:
                pass
        client.loop_stop()


if __name__ == "__main__":
    main()
