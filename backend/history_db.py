
import json
import math
import sqlite3
from datetime import datetime
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent.parent

DATABASE_DIR = ROOT_DIR / "recordings"
DATABASE_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_PATH = DATABASE_DIR / "bird_guard_history.sqlite3"


def make_safe(value):
    """Convert values into JSON-safe Python values."""
    if isinstance(value, float) and not math.isfinite(value):
        return None

    if isinstance(value, dict):
        return {
            str(key): make_safe(item)
            for key, item in value.items()
        }

    if isinstance(value, (list, tuple)):
        return [make_safe(item) for item in value]

    return value


def get_connection():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_history_db():
    with get_connection() as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS detection_history (
                recording_id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                selected_crop TEXT NOT NULL,
                growth_stage TEXT NOT NULL,
                bird_detected INTEGER NOT NULL,
                detection_segments INTEGER NOT NULL,
                predictions_json TEXT NOT NULL,
                audio_filename TEXT NOT NULL
            )
        """)

        # Safely migrate existing databases.
        columns = {
            row["name"]
            for row in connection.execute(
                "PRAGMA table_info(detection_history)"
            ).fetchall()
        }

        if "latitude" not in columns:
            connection.execute("""
                ALTER TABLE detection_history
                ADD COLUMN latitude REAL
            """)

        if "longitude" not in columns:
            connection.execute("""
                ALTER TABLE detection_history
                ADD COLUMN longitude REAL
            """)

        if "location_accuracy" not in columns:
            connection.execute("""
                ALTER TABLE detection_history
                ADD COLUMN location_accuracy REAL
            """)

        connection.commit()

    print("Bird Guard AI history database initialized.")


def save_history_record(
    recording_id,
    selected_crop,
    growth_stage,
    predictions,
    audio_filename,
    latitude=None,
    longitude=None,
    location_accuracy=None
):
    safe_predictions = make_safe(predictions)

    created_at = datetime.now().astimezone().isoformat(
        timespec="seconds"
    )

    with get_connection() as connection:
        connection.execute("""
            INSERT OR REPLACE INTO detection_history (
                recording_id,
                created_at,
                selected_crop,
                growth_stage,
                bird_detected,
                detection_segments,
                predictions_json,
                audio_filename,
                latitude,
                longitude,
                location_accuracy
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            recording_id,
            created_at,
            selected_crop,
            growth_stage,
            int(bool(safe_predictions)),
            len(safe_predictions),
            json.dumps(safe_predictions, ensure_ascii=False),
            audio_filename,
            latitude,
            longitude,
            location_accuracy
        ))

        connection.commit()


def row_to_record(row):
    if row is None:
        return None

    record = dict(row)

    record["bird_detected"] = bool(
        record["bird_detected"]
    )

    record["predictions"] = json.loads(
        record.pop("predictions_json")
    )

    record["audio_url"] = (
        f"/api/history/{record['recording_id']}/audio"
    )

    return record


def list_history_records(limit=100):
    limit = max(1, min(int(limit), 500))

    with get_connection() as connection:
        rows = connection.execute("""
            SELECT *
            FROM detection_history
            ORDER BY created_at DESC
            LIMIT ?
        """, (limit,)).fetchall()

    return [row_to_record(row) for row in rows]


def list_field_activity_records(limit=500):
    """Return recent recordings, including those without GPS coordinates."""
    limit = max(1, min(int(limit), 2000))

    with get_connection() as connection:
        rows = connection.execute("""
            SELECT *
            FROM detection_history
            ORDER BY created_at DESC
            LIMIT ?
        """, (limit,)).fetchall()

    return [row_to_record(row) for row in rows]


def get_history_record(recording_id):
    with get_connection() as connection:
        row = connection.execute("""
            SELECT *
            FROM detection_history
            WHERE recording_id = ?
        """, (recording_id,)).fetchone()

    return row_to_record(row)


def delete_history_record(recording_id):
    with get_connection() as connection:
        row = connection.execute("""
            SELECT *
            FROM detection_history
            WHERE recording_id = ?
        """, (recording_id,)).fetchone()

        if row is None:
            return None

        record = row_to_record(row)

        connection.execute("""
            DELETE FROM detection_history
            WHERE recording_id = ?
        """, (recording_id,))

        connection.commit()

    return record
