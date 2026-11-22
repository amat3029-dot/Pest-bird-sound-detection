
import logging
import os
import time

import requests
import serial


logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("bird_guard.arduino_bridge")

SERIAL_PORT = os.getenv("ARDUINO_SERIAL_PORT", "COM6")
BAUD_RATE = int(os.getenv("ARDUINO_BAUD_RATE", "115200"))
API_BASE_URL = os.getenv("BIRD_GUARD_API_URL", "http://127.0.0.1:8010").rstrip("/")
SENSOR_API_URL = f"{API_BASE_URL}/api/iot/sensor"
BRIDGE_STATUS_URL = f"{API_BASE_URL}/api/iot/bridge/status"
NEXT_COMMAND_URL = f"{API_BASE_URL}/api/iot/commands/next"
HEARTBEAT_SECONDS = 2.0
COMMAND_POLL_SECONDS = 0.25
RECONNECT_SECONDS = 3.0


def parse_serial_message(line: str) -> dict | None:
    parts = line.strip().split(",")

    if len(parts) == 4 and parts[0] == "SOUND":
        try:
            return {
                "type": "sensor",
                "sensor": "DIGITAL_SOUND",
                "sound_level": int(parts[1]),
                "threshold": int(parts[2]),
                "status": parts[3].upper(),
            }
        except ValueError:
            return None

    if len(parts) == 2 and parts[0] == "BUZZER":
        buzzer_status = parts[1].upper()
        if buzzer_status in {"ACTIVE", "OFF"}:
            return {
                "type": "buzzer",
                "status": "ACTIVE" if buzzer_status == "ACTIVE" else "READY",
            }

    return None


def encode_buzzer_command(command: str) -> bytes:
    if command not in {"BUZZER_ON", "BUZZER_OFF"}:
        raise ValueError(f"Unsupported Arduino command: {command}")
    return f"{command}\n".encode("ascii")


def post_bridge_status(session: requests.Session, connected: bool, buzzer_status: str) -> None:
    try:
        response = session.post(
            BRIDGE_STATUS_URL,
            json={
                "connected": connected,
                "serial_port": SERIAL_PORT,
                "buzzer_status": buzzer_status,
            },
            timeout=1.0,
        )
        response.raise_for_status()
    except requests.RequestException as error:
        logger.warning("Could not update Arduino bridge status: %s", error)


def post_sensor_reading(session: requests.Session, message: dict) -> None:
    try:
        response = session.post(
            SENSOR_API_URL,
            json={
                "sensor": message["sensor"],
                "sound_level": message["sound_level"],
                "threshold": message["threshold"],
                "status": message["status"],
            },
            timeout=1.0,
        )
        response.raise_for_status()
    except requests.RequestException as error:
        logger.warning("Could not send Arduino sensor reading: %s", error)


def poll_buzzer_command(session: requests.Session, arduino: serial.Serial) -> None:
    try:
        response = session.get(NEXT_COMMAND_URL, timeout=0.75)
        response.raise_for_status()
    except requests.RequestException as error:
        logger.warning("Could not poll buzzer commands: %s", error)
        return

    try:
        command = response.json().get("command")
    except (ValueError, AttributeError) as error:
        logger.error("Arduino command API returned an invalid response: %s", error)
        return
    if command is None:
        return

    try:
        payload = encode_buzzer_command(command)
    except (TypeError, ValueError) as error:
        logger.error("Arduino command API returned an unsupported command: %s", error)
        return
    arduino.write(payload)
    arduino.flush()
    logger.info("Sent Arduino command %s on %s", command, SERIAL_PORT)


def run_bridge() -> None:
    session = requests.Session()
    buzzer_status = "OFFLINE"

    while True:
        try:
            post_bridge_status(session, False, "OFFLINE")
            logger.info("Connecting to Arduino on %s", SERIAL_PORT)

            with serial.Serial(
                SERIAL_PORT,
                BAUD_RATE,
                timeout=0.2,
                write_timeout=1.0,
            ) as arduino:
                time.sleep(2.0)
                buzzer_status = "OFFLINE"
                post_bridge_status(session, True, buzzer_status)
                logger.info("Arduino connected on %s", SERIAL_PORT)
                next_heartbeat = time.monotonic() + HEARTBEAT_SECONDS
                next_command_poll = 0.0

                while True:
                    line = arduino.readline().decode(
                        "utf-8", errors="ignore"
                    ).strip()
                    message = parse_serial_message(line) if line else None

                    if message and message["type"] == "sensor":
                        post_sensor_reading(session, message)
                        logger.debug(
                            "Sensor reading: %s raw=%s",
                            message["status"],
                            message["sound_level"],
                        )
                    elif message and message["type"] == "buzzer":
                        buzzer_status = message["status"]
                        logger.info("Arduino buzzer status: %s", buzzer_status)

                    now = time.monotonic()
                    if now >= next_command_poll:
                        poll_buzzer_command(session, arduino)
                        next_command_poll = now + COMMAND_POLL_SECONDS

                    if now >= next_heartbeat:
                        post_bridge_status(session, True, buzzer_status)
                        next_heartbeat = now + HEARTBEAT_SECONDS

        except KeyboardInterrupt:
            logger.info("Arduino bridge stopped")
            return
        except (serial.SerialException, OSError) as error:
            buzzer_status = "OFFLINE"
            logger.error("Arduino connection lost on %s: %s", SERIAL_PORT, error)
            post_bridge_status(session, False, buzzer_status)
            time.sleep(RECONNECT_SECONDS)


if __name__ == "__main__":
    run_bridge()
