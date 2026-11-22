import logging
import os
import threading
import time
from collections import deque
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/iot", tags=["IoT"])


def _read_float_setting(name: str, default: str, minimum: float, maximum: float) -> float:
    try:
        value = float(os.getenv(name, default))
    except ValueError as error:
        raise RuntimeError(f"{name} must be a number") from error

    if not minimum <= value <= maximum:
        raise RuntimeError(f"{name} must be between {minimum} and {maximum}")

    return value


BUZZER_CONFIDENCE_THRESHOLD = _read_float_setting(
    "BIRDNET_ALERT_CONFIDENCE_THRESHOLD", "0.80", 0.0, 1.0
)
MIN_BUZZER_CONFIDENCE_THRESHOLD = 0.80
BUZZER_COOLDOWN_SECONDS = _read_float_setting(
    "BUZZER_ALERT_COOLDOWN_SECONDS", "60", 0.0, 86400.0
)
BUZZER_DURATION_SECONDS = _read_float_setting(
    "BUZZER_ON_DURATION_SECONDS", "1.5", 0.1, 5.0
)
BRIDGE_STALE_SECONDS = 8.0
COMMAND_MAX_AGE_SECONDS = 5.0


class SensorReading(BaseModel):
    sensor: str
    sound_level: int
    threshold: int
    status: str


class BridgeStatus(BaseModel):
    connected: bool
    serial_port: str
    buzzer_status: Literal["ACTIVE", "READY", "OFFLINE"]


latest_reading = None
bridge_state = {
    "connected": False,
    "serial_port": None,
    "buzzer_status": "OFFLINE",
    "last_seen": None,
}
_state_lock = threading.Lock()
_command_queue = deque()
_last_buzzer_alert = 0.0


def _bridge_is_online(now: float | None = None) -> bool:
    current_time = time.time() if now is None else now
    last_seen = bridge_state["last_seen"]
    return bool(
        bridge_state["connected"]
        and last_seen is not None
        and current_time - last_seen <= BRIDGE_STALE_SECONDS
    )


def enqueue_bridge_command(command: str, expires_at: float | None = None) -> None:
    if command not in {"BUZZER_ON", "BUZZER_OFF"}:
        raise ValueError(f"Unsupported Arduino command: {command}")

    with _state_lock:
        _enqueue_bridge_command_locked(command, expires_at)


def _enqueue_bridge_command_locked(
    command: str, expires_at: float | None = None
) -> None:
    _command_queue.append({"command": command, "expires_at": expires_at})


def request_buzzer_for_detection(
    predictions: list[dict],
    alert_output: str = "arduino",
    confidence_threshold: float | None = None,
) -> dict:
    """Queue one buzzer alert for the strongest valid verified-bird prediction."""
    global _last_buzzer_alert

    if alert_output not in {"arduino", "laptop"}:
        raise ValueError(f"Unsupported alert output: {alert_output}")

    if confidence_threshold is not None and (
        isinstance(confidence_threshold, bool)
        or not isinstance(confidence_threshold, (int, float))
        or not 0.0 <= confidence_threshold <= 1.0
    ):
        raise ValueError("Confidence threshold must be between 0 and 1.")
    threshold = max(
        MIN_BUZZER_CONFIDENCE_THRESHOLD,
        BUZZER_CONFIDENCE_THRESHOLD,
        confidence_threshold if confidence_threshold is not None else 0.0,
    )

    candidates = []
    for prediction in predictions:
        confidence = prediction.get("confidence")
        species_name = prediction.get("scientific_name")
        start_time = prediction.get("start_time")
        end_time = prediction.get("end_time")

        if (
            not isinstance(species_name, str)
            or not species_name.strip()
            or isinstance(confidence, bool)
            or not isinstance(confidence, (int, float))
            or not 0.0 <= confidence <= 1.0
            or confidence < threshold
            or not isinstance(start_time, (int, float))
            or not isinstance(end_time, (int, float))
            or start_time < 0
            or end_time <= start_time
        ):
            continue

        candidates.append(prediction)

    if not candidates:
        return {
            "status": "not_qualified",
            "confidence_threshold": threshold,
        }

    best = max(candidates, key=lambda item: item["confidence"])
    if alert_output == "laptop":
        logger.info(
            "Physical buzzer skipped because laptop audio is selected "
            "(species=%s confidence=%.3f)",
            best["scientific_name"],
            best["confidence"],
        )
        return {
            "status": "laptop_sound",
            "species": best["scientific_name"],
            "confidence": best["confidence"],
            "confidence_threshold": threshold,
        }

    now = time.time()
    monotonic_now = time.monotonic()

    with _state_lock:
        if (
            not _bridge_is_online(now)
            or bridge_state["buzzer_status"] == "OFFLINE"
        ):
            logger.warning(
                "Buzzer alert skipped: Arduino bridge is offline "
                "(species=%s confidence=%.3f)",
                best["scientific_name"],
                best["confidence"],
            )
            return {
                "status": "offline",
                "species": best["scientific_name"],
                "confidence": best["confidence"],
                "confidence_threshold": threshold,
            }

        remaining_cooldown = (
            BUZZER_COOLDOWN_SECONDS - (monotonic_now - _last_buzzer_alert)
        )
        if _last_buzzer_alert and remaining_cooldown > 0:
            logger.info(
                "Buzzer alert suppressed by cooldown "
                "(species=%s confidence=%.3f remaining=%.1fs)",
                best["scientific_name"],
                best["confidence"],
                remaining_cooldown,
            )
            return {
                "status": "cooldown",
                "species": best["scientific_name"],
                "confidence": best["confidence"],
                "confidence_threshold": threshold,
                "cooldown_remaining_seconds": round(remaining_cooldown, 1),
            }

        _last_buzzer_alert = monotonic_now
        _enqueue_bridge_command_locked(
            "BUZZER_ON", expires_at=now + COMMAND_MAX_AGE_SECONDS
        )

    off_timer = threading.Timer(
        BUZZER_DURATION_SECONDS,
        enqueue_bridge_command,
        args=("BUZZER_OFF",),
    )
    off_timer.daemon = True
    off_timer.start()

    logger.info(
        "Buzzer alert queued: BUZZER_ON then BUZZER_OFF "
        "(species=%s confidence=%.3f threshold=%.3f duration=%.1fs)",
        best["scientific_name"],
        best["confidence"],
        threshold,
        BUZZER_DURATION_SECONDS,
    )
    return {
        "status": "queued",
        "species": best["scientific_name"],
        "confidence": best["confidence"],
        "confidence_threshold": threshold,
        "duration_seconds": BUZZER_DURATION_SECONDS,
        "cooldown_seconds": BUZZER_COOLDOWN_SECONDS,
    }


@router.post("/sensor")
def receive_sensor_data(data: SensorReading):
    global latest_reading

    reading = {
        **data.model_dump(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    with _state_lock:
        latest_reading = reading

    return {
        "success": True,
        "message": "Sensor reading received",
        "data": reading,
    }


@router.get("/sensor")
def get_sensor_data():
    with _state_lock:
        reading = latest_reading
    return {
        "success": True,
        "data": reading,
    }


@router.post("/bridge/status")
def receive_bridge_status(data: BridgeStatus):
    with _state_lock:
        bridge_state.update(
            connected=data.connected,
            serial_port=data.serial_port,
            buzzer_status=(
                data.buzzer_status if data.connected else "OFFLINE"
            ),
            last_seen=time.time(),
        )

    return {"success": True}


@router.get("/status")
def get_iot_status():
    now = time.time()
    with _state_lock:
        connected = _bridge_is_online(now)
        port = bridge_state["serial_port"]
        buzzer_status = (
            bridge_state["buzzer_status"] if connected else "OFFLINE"
        )
        reading = latest_reading

    return {
        "success": True,
        "arduino_status": "CONNECTED" if connected else "OFFLINE",
        "com_port": port or "Not reported",
        "sensor_status": (
            reading["status"] if reading else "UNKNOWN"
        ),
        "buzzer_status": buzzer_status,
        "buzzer_confidence_threshold": max(
            MIN_BUZZER_CONFIDENCE_THRESHOLD,
            BUZZER_CONFIDENCE_THRESHOLD,
        ),
        "buzzer_cooldown_seconds": BUZZER_COOLDOWN_SECONDS,
        "data": reading,
    }


@router.get("/commands/next")
def get_next_bridge_command():
    now = time.time()
    with _state_lock:
        if not _bridge_is_online(now):
            return {"command": None}

        while _command_queue:
            queued = _command_queue.popleft()
            expires_at = queued["expires_at"]
            if expires_at is None or expires_at >= now:
                return {"command": queued["command"]}

    return {"command": None}
