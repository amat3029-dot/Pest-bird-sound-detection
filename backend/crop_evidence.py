import json
import uuid
from urllib.parse import urlparse

from history_db import get_connection


SUPPORTED_CROPS = (
    {"crop_id": "rice", "crop_name": "Rice"},
    {"crop_id": "maize", "crop_name": "Maize"},
    {"crop_id": "vegetables", "crop_name": "Vegetables"},
    {"crop_id": "sugarcane", "crop_name": "Sugarcane"},
    {"crop_id": "groundnut", "crop_name": "Groundnut"},
    {"crop_id": "wheat", "crop_name": "Wheat"},
    {"crop_id": "cotton", "crop_name": "Cotton"},
    {"crop_id": "millet", "crop_name": "Millet"},
)

EVIDENCE_STATUSES = {"verified", "pending", "rejected", "unknown"}
RELATIONSHIPS = {"pest", "non_pest", "beneficial", "neutral", "unknown"}


def init_crop_evidence_db(knowledge_data):
    with get_connection() as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS crop_bird_evidence (
                evidence_id INTEGER PRIMARY KEY AUTOINCREMENT,
                crop_id TEXT NOT NULL COLLATE NOCASE,
                crop_name TEXT NOT NULL,
                bird_species TEXT NOT NULL COLLATE NOCASE,
                common_name TEXT NOT NULL DEFAULT '',
                relationship TEXT NOT NULL
                    CHECK (relationship IN (
                        'pest', 'non_pest', 'beneficial', 'neutral', 'unknown'
                    )),
                damage_type_json TEXT NOT NULL DEFAULT '[]',
                growth_stage_json TEXT NOT NULL DEFAULT '[]',
                impact_description TEXT NOT NULL DEFAULT '',
                evidence_source TEXT NOT NULL,
                source_title TEXT NOT NULL,
                source_url TEXT NOT NULL,
                source_year INTEGER,
                source_publisher TEXT NOT NULL DEFAULT '',
                evidence_level TEXT NOT NULL DEFAULT 'unspecified',
                evidence_status TEXT NOT NULL DEFAULT 'pending'
                    CHECK (evidence_status IN (
                        'verified', 'pending', 'rejected', 'unknown'
                    )),
                reported_damage_percent REAL,
                reported_damage_context TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                reviewed_at TEXT,
                UNIQUE (crop_id, bird_species, evidence_source)
            )
        """)
        connection.execute("""
            CREATE INDEX IF NOT EXISTS idx_crop_bird_evidence_lookup
            ON crop_bird_evidence (crop_id, bird_species, evidence_status)
        """)
        connection.commit()

    return seed_crop_evidence_from_knowledge(knowledge_data)


def seed_crop_evidence_from_knowledge(knowledge_data):
    sources = {
        source["source_id"]: source
        for source in knowledge_data.get("sources", [])
        if source.get("source_id")
    }

    rows = []

    for crop in knowledge_data.get("crops", []):
        crop_id = str(crop.get("crop_id", "")).strip()
        crop_name = str(crop.get("crop_name", crop_id)).strip()

        for relationship in crop.get("relationships", []):
            scientific_name = str(
                relationship.get("scientific_name", "")
            ).strip()
            source_ids = relationship.get("source_ids", [])

            if not crop_id or not scientific_name or not source_ids:
                raise ValueError(
                    "Crop-bird evidence must include crop, scientific "
                    "species name, and at least one source."
                )

            relationship_type = str(
                relationship.get(
                    "relationship",
                    relationship.get("classification", "unknown")
                )
            ).strip().lower()

            if relationship_type not in RELATIONSHIPS:
                raise ValueError(
                    f"Unsupported crop-bird relationship: "
                    f"{relationship_type}"
                )

            status = str(
                relationship.get("evidence_status", "pending")
            ).strip().lower()

            if status not in EVIDENCE_STATUSES:
                raise ValueError(
                    f"Unsupported crop-bird evidence status: {status}"
                )

            for source_id in source_ids:
                source = sources.get(source_id)

                if not source or not source.get("url") or not source.get("title"):
                    raise ValueError(
                        f"Crop-bird evidence source is incomplete: "
                        f"{source_id}"
                    )

                rows.append((
                    crop_id,
                    crop_name,
                    scientific_name,
                    str(relationship.get("common_name", "")).strip(),
                    relationship_type,
                    json.dumps(
                        relationship.get("damage_type", []),
                        ensure_ascii=False
                    ),
                    json.dumps(
                        relationship.get("affected_growth_stages", []),
                        ensure_ascii=False
                    ),
                    str(relationship.get("crop_impact", "")).strip(),
                    source_id,
                    str(source["title"]).strip(),
                    str(source["url"]).strip(),
                    source.get("year"),
                    str(source.get("publisher", "")).strip(),
                    str(relationship.get("evidence_level", "unspecified")),
                    status,
                    relationship.get("reported_damage_percent"),
                    str(
                        relationship.get("reported_damage_context", "")
                    ).strip()
                ))

    if not rows:
        return 0

    with get_connection() as connection:
        before = connection.total_changes
        connection.executemany("""
            INSERT OR IGNORE INTO crop_bird_evidence (
                crop_id, crop_name, bird_species, common_name,
                relationship, damage_type_json, growth_stage_json,
                impact_description, evidence_source, source_title,
                source_url, source_year, source_publisher,
                evidence_level, evidence_status, reported_damage_percent,
                reported_damage_context
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, rows)
        inserted = connection.total_changes - before
        connection.commit()

    return inserted


def create_manual_crop_evidence(evidence):
    crop_id = str(evidence.get("crop_id", "")).strip().lower()
    crop = next(
        (item for item in SUPPORTED_CROPS if item["crop_id"] == crop_id),
        None
    )
    if not crop:
        raise ValueError("Unsupported crop.")

    scientific_name = str(evidence.get("scientific_name", "")).strip()
    if not scientific_name:
        raise ValueError("Scientific species name is required.")

    relationship = str(evidence.get("relationship", "")).strip().lower()
    if relationship not in RELATIONSHIPS:
        raise ValueError("Unsupported crop-bird relationship.")

    source_title = str(evidence.get("source_title", "")).strip()
    if not source_title:
        raise ValueError("Evidence source or observation title is required.")

    source_url = str(evidence.get("source_url", "")).strip()
    if source_url:
        parsed_url = urlparse(source_url)
        if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
            raise ValueError("Evidence source URL must use HTTP or HTTPS.")

    source_id = f"manual:{uuid.uuid4().hex}"
    damage_types = [
        str(value).strip()
        for value in evidence.get("damage_type", [])
        if str(value).strip()
    ]
    growth_stages = [
        str(value).strip()
        for value in evidence.get("growth_stages", [])
        if str(value).strip()
    ]

    with get_connection() as connection:
        cursor = connection.execute("""
            INSERT INTO crop_bird_evidence (
                crop_id, crop_name, bird_species, common_name,
                relationship, damage_type_json, growth_stage_json,
                impact_description, evidence_source, source_title,
                source_url, source_year, source_publisher,
                evidence_level, evidence_status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        """, (
            crop_id,
            crop["crop_name"],
            scientific_name,
            str(evidence.get("common_name", "")).strip(),
            relationship,
            json.dumps(damage_types, ensure_ascii=False),
            json.dumps(growth_stages, ensure_ascii=False),
            str(evidence.get("impact_description", "")).strip(),
            source_id,
            source_title,
            source_url,
            evidence.get("source_year"),
            str(evidence.get("source_publisher", "")).strip(),
            str(evidence.get("evidence_level", "manual_submission")).strip(),
        ))
        row = connection.execute(
            "SELECT * FROM crop_bird_evidence WHERE evidence_id = ?",
            (cursor.lastrowid,)
        ).fetchone()

    return _row_to_evidence(row)


def _row_to_evidence(row):
    evidence = dict(row)
    evidence["damage_type"] = json.loads(
        evidence.pop("damage_type_json")
    )
    evidence["growth_stages"] = json.loads(
        evidence.pop("growth_stage_json")
    )
    evidence["source"] = {
        "source_id": evidence.pop("evidence_source"),
        "title": evidence.pop("source_title"),
        "url": evidence.pop("source_url"),
        "year": evidence.pop("source_year"),
        "publisher": evidence.pop("source_publisher")
    }
    return evidence


def list_crop_evidence(
    crop_id=None,
    scientific_name=None,
    evidence_status=None
):
    conditions = []
    parameters = []

    if crop_id:
        conditions.append("crop_id = ?")
        parameters.append(crop_id.strip())

    if scientific_name:
        conditions.append("bird_species = ?")
        parameters.append(scientific_name.strip())

    if evidence_status:
        if evidence_status not in EVIDENCE_STATUSES:
            raise ValueError("Invalid crop-bird evidence status.")
        conditions.append("evidence_status = ?")
        parameters.append(evidence_status)

    query = "SELECT * FROM crop_bird_evidence"

    if conditions:
        query += " WHERE " + " AND ".join(conditions)

    query += " ORDER BY crop_name COLLATE NOCASE, bird_species COLLATE NOCASE, evidence_id"

    with get_connection() as connection:
        rows = connection.execute(query, parameters).fetchall()

    return [_row_to_evidence(row) for row in rows]


def find_crop_evidence(crop_id, scientific_name):
    return list_crop_evidence(
        crop_id=crop_id,
        scientific_name=scientific_name
    )
