import csv
import json
import uuid
import wave
import math
import logging
from typing import Literal
from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator

from iot_api import (
    request_buzzer_for_detection,
    router as iot_router
)
from crop_evidence import (
    EVIDENCE_STATUSES,
    SUPPORTED_CROPS,
    create_manual_crop_evidence,
    find_crop_evidence,
    init_crop_evidence_db,
    list_crop_evidence
)
from pathlib import Path

import av
import birdnet

from fastapi import (
    FastAPI,
    UploadFile,
    File,
    Form,
    HTTPException
)
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from history_db import (
    init_history_db,
    save_history_record,
    list_history_records,
    list_field_activity_records,
    get_history_record,
    delete_history_record
)


# ==================================================
# APPLICATION
# ==================================================

app = FastAPI(
    title="Bird Guard AI Backend",
    version="3.0"
)
logger = logging.getLogger(__name__)
app.include_router(iot_router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


ROOT_DIR = Path(__file__).resolve().parent.parent

UPLOAD_DIR = ROOT_DIR / "recordings" / "uploads"
PROCESSED_DIR = ROOT_DIR / "recordings" / "processed"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

init_history_db()


# ==================================================
# DATABASE PATHS
# ==================================================

TAXONOMY_PATH = (
    ROOT_DIR / "backend" / "data" / "birdnet_taxonomy.csv"
)

KNOWLEDGE_PATH = (
    ROOT_DIR / "backend" / "data" / "crop_bird_knowledge.json"
)


# ==================================================
# JSON SAFETY
# ==================================================

def make_json_safe(value):
    """
    Recursively convert values that JSON cannot represent
    into JSON-compatible values.

    NaN, Infinity and -Infinity become None.
    NumPy scalar values are converted to Python values.
    """

    if isinstance(value, dict):
        return {
            str(key): make_json_safe(item)
            for key, item in value.items()
        }

    if isinstance(value, (list, tuple)):
        return [
            make_json_safe(item)
            for item in value
        ]

    # Convert NumPy scalar values to Python values.
    if hasattr(value, "item") and callable(value.item):
        try:
            value = value.item()
        except (ValueError, TypeError):
            pass

    # Handle non-finite floating-point values.
    if isinstance(value, float):
        if not math.isfinite(value):
            return None

    return value


def safe_float(value):
    """
    Convert a value to a finite Python float.
    Return None for invalid or non-finite values.
    """

    try:
        number = float(value)

        if not math.isfinite(number):
            return None

        return number

    except (TypeError, ValueError, OverflowError):
        return None


# ==================================================
# LOAD CROP-BIRD KNOWLEDGE
# ==================================================

def load_crop_bird_knowledge():

    if not KNOWLEDGE_PATH.exists():
        raise FileNotFoundError(
            f"Knowledge database not found: {KNOWLEDGE_PATH}"
        )

    with KNOWLEDGE_PATH.open(
        "r",
        encoding="utf-8"
    ) as file:
        return json.load(file)


crop_bird_knowledge = load_crop_bird_knowledge()
seeded_evidence_count = init_crop_evidence_db(crop_bird_knowledge)
if seeded_evidence_count:
    print(
        f"Imported {seeded_evidence_count} crop-bird evidence "
        "source record(s) from the legacy knowledge file."
    )


# ==================================================
# BIRD TAXONOMY
# ==================================================

bird_taxonomy = None


def get_bird_taxonomy():

    global bird_taxonomy

    if bird_taxonomy is not None:
        return bird_taxonomy

    if not TAXONOMY_PATH.exists():
        raise FileNotFoundError(
            f"BirdNET taxonomy not found: {TAXONOMY_PATH}"
        )

    taxonomy = {}

    with TAXONOMY_PATH.open(
        "r",
        encoding="utf-8-sig",
        newline=""
    ) as file:

        reader = csv.DictReader(file)

        for row in reader:

            # Only verified bird species.
            if (
                row.get("taxon_group") == "Aves"
                and row.get("record_type") == "species"
            ):

                scientific_name = (
                    row.get("scientific_name") or ""
                ).strip().lower()

                if scientific_name:

                    taxonomy[scientific_name] = {
                        "scientific_name": row["scientific_name"],
                        "common_name": row.get("common_name", "")
                    }

    bird_taxonomy = taxonomy

    print(
        f"Loaded {len(bird_taxonomy)} verified bird species."
    )

    return bird_taxonomy


# ==================================================
# CROP IMPACT ASSESSMENT
# ==================================================

def assess_crop_impact(
    scientific_name,
    crop_id,
    growth_stage
):
    evidence = find_crop_evidence(crop_id, scientific_name)
    verified = [
        item for item in evidence
        if item["evidence_status"] == "verified"
    ]
    pending = [
        item for item in evidence
        if item["evidence_status"] == "pending"
    ]
    unknown = [
        item for item in evidence
        if item["evidence_status"] == "unknown"
    ]
    rejected = [
        item for item in evidence
        if item["evidence_status"] == "rejected"
    ]

    def evidence_source(item):
        return {
            **item["source"],
            "evidence_status": item["evidence_status"],
            "relationship": item["relationship"]
        }

    def unique_sources(items):
        sources = {}
        for item in items:
            source = evidence_source(item)
            sources[source["source_id"]] = source
        return list(sources.values())

    risk_note = (
        "Pest risk is not calculated. Validated field-damage observations "
        "and an evaluated risk model are not yet available."
    )

    if not verified:
        evidence_status = (
            "pending"
            if pending
            else "unknown"
            if unknown
            else "rejected"
            if rejected
            else "unknown"
        )
        review_records = pending + unknown + rejected

        return {
            "classification": "unknown",
            "relationship": "unknown",
            "crop_impact": (
                "A crop relationship is awaiting source review; "
                "it is not treated as verified."
                if pending
                else "No verified crop relationship found in the database."
            ),
            "damage_type": [],
            "affected_growth_stages": [],
            "selected_stage_match": None,
            "evidence_level": "pending_review" if pending else "insufficient",
            "evidence_status": evidence_status,
            "unverified_evidence": [
                {
                    "relationship": item["relationship"],
                    "evidence_status": item["evidence_status"],
                    "crop_impact": item["impact_description"],
                    "damage_type": item["damage_type"],
                    "growth_stages": item["growth_stages"],
                    "evidence_level": item["evidence_level"],
                    "source": evidence_source(item)
                }
                for item in review_records
            ],
            "reported_damage_percent": None,
            "reported_damage_context": None,
            "pest_risk_percentage": None,
            "risk_status": "insufficient_data",
            "risk_assessment_status": "insufficient_data",
            "risk_assessment_note": risk_note,
            "source_ids": [
                item["source_id"]
                for item in unique_sources(review_records)
            ],
            "sources": unique_sources(review_records)
        }

    verified_relationships = {
        item["relationship"]
        for item in verified
    }

    if len(verified_relationships) != 1:
        return {
            "classification": "unknown",
            "relationship": "conflicting",
            "crop_impact": (
                "Verified sources disagree about this crop relationship; "
                "manual review is required."
            ),
            "damage_type": sorted({
                damage
                for item in verified
                for damage in item["damage_type"]
            }),
            "affected_growth_stages": sorted({
                stage
                for item in verified
                for stage in item["growth_stages"]
            }),
            "selected_stage_match": None,
            "evidence_level": "conflicting_verified_sources",
            "evidence_status": "conflicting",
            "pending_evidence": [],
            "reported_damage_percent": None,
            "reported_damage_context": None,
            "pest_risk_percentage": None,
            "risk_status": "insufficient_data",
            "risk_assessment_status": "insufficient_data",
            "risk_assessment_note": risk_note,
            "source_ids": [
                item["source_id"]
                for item in unique_sources(verified)
            ],
            "sources": unique_sources(verified)
        }

    relationship = verified_relationships.pop()
    affected_stages = sorted({
        stage
        for item in verified
        for stage in item["growth_stages"]
    })
    normalized_stage = growth_stage.strip().lower().replace("-", "_")
    stage_aliases = {
        "seedling": {"seedling", "germination"},
        "grain_filling": {"grain_filling", "grain_filling_stage"},
        "maturity": {"maturity", "harvest"}
    }
    selected_stage_aliases = stage_aliases.get(
        normalized_stage,
        {normalized_stage}
    )
    normalized_stages = {
        stage.strip().lower().replace("-", "_")
        for stage in affected_stages
    }

    if normalized_stages:
        stage_match = bool(normalized_stages & selected_stage_aliases)
        risk_status = (
            "stage_relevant"
            if stage_match
            else "stage_not_documented"
        )
    else:
        stage_match = None
        risk_status = "stage_unknown"

    descriptions = list(dict.fromkeys(
        item["impact_description"]
        for item in verified
        if item["impact_description"]
    ))
    damage_types = sorted({
        damage
        for item in verified
        for damage in item["damage_type"]
    })
    damage_percentages = {
        item["reported_damage_percent"]
        for item in verified
        if item["reported_damage_percent"] is not None
    }
    impact_contexts = list(dict.fromkeys(
        item["reported_damage_context"]
        for item in verified
        if item["reported_damage_context"]
    ))

    return {
        "classification": (
            relationship
            if relationship in {"pest", "non_pest"}
            else "unknown"
        ),
        "relationship": relationship,
        "crop_impact": "; ".join(descriptions) or (
            "Verified crop relationship; detailed impact is unavailable."
        ),
        "damage_type": damage_types,
        "affected_growth_stages": affected_stages,
        "selected_stage_match": stage_match,
        "evidence_level": ", ".join(sorted({
            item["evidence_level"]
            for item in verified
        })),
        "evidence_status": "verified",
        "pending_evidence": [],
        "reported_damage_percent": (
            next(iter(damage_percentages))
            if len(damage_percentages) == 1
            else None
        ),
        "reported_damage_context": "; ".join(impact_contexts) or None,
        "pest_risk_percentage": None,
        "risk_status": risk_status,
        "risk_assessment_status": "insufficient_data",
        "risk_assessment_note": risk_note,
        "source_ids": [
            item["source_id"]
            for item in unique_sources(verified)
        ],
        "sources": unique_sources(verified)
    }


# ==================================================
# BIRDNET MODEL
# ==================================================

birdnet_model = None


def get_birdnet_model():

    global birdnet_model

    if birdnet_model is None:

        print("Loading BirdNET 3.0 ONNX model...")

        birdnet_model = birdnet.load(
            "acoustic",
            "3.0",
            "onnx"
        )

        print("BirdNET model loaded successfully.")

    return birdnet_model


# ==================================================
# AUDIO CONVERSION: WEBM TO WAV
# ==================================================

def convert_webm_to_wav(source: Path, output: Path):

    container = av.open(str(source))

    audio_stream = next(
        (
            stream
            for stream in container.streams
            if stream.type == "audio"
        ),
        None
    )

    if audio_stream is None:

        container.close()

        raise ValueError(
            "No audio stream found in recording"
        )

    resampler = av.AudioResampler(
        format="s16",
        layout="mono",
        rate=48000
    )

    try:

        with wave.open(str(output), "wb") as wav:

            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(48000)

            for frame in container.decode(audio_stream):

                for converted in resampler.resample(frame):

                    wav.writeframes(
                        converted.to_ndarray().tobytes()
                    )

            for converted in resampler.resample(None):

                wav.writeframes(
                    converted.to_ndarray().tobytes()
                )

    finally:

        container.close()


# ==================================================
# BIRDNET ANALYSIS
# ==================================================

def analyse_with_birdnet(wav_path: Path):

    model = get_birdnet_model()

    taxonomy = get_bird_taxonomy()

    result = model.predict(
        str(wav_path),
        top_k=5,
        n_producers=1,
        n_workers=1,
        default_confidence_threshold=0.1,
        show_stats="minimal"
    )

    dataframe = result.to_dataframe()

    predictions = []

    if dataframe.empty:
        return predictions

    dataframe = dataframe.sort_values(
        "confidence",
        ascending=False
    )

    for _, row in dataframe.iterrows():

        full_name = str(row["species_name"])

        scientific_name = (
            full_name.split("_", 1)[0].strip()
        )

        # Only accept verified bird species.
        bird = taxonomy.get(
            scientific_name.lower()
        )

        if bird is None:
            continue

        # Convert BirdNET values safely.
        confidence = safe_float(row["confidence"])

        start_time = safe_float(row["start_time"])

        end_time = safe_float(row["end_time"])

        # Ignore invalid model detections.
        if (
            confidence is None
            or start_time is None
            or end_time is None
            or not 0.0 <= confidence <= 1.0
            or start_time < 0
            or end_time <= start_time
        ):
            continue

        predictions.append({

            "scientific_name": bird["scientific_name"],

            "common_name": bird["common_name"],

            "species_name": full_name,

            "confidence": confidence,

            "start_time": start_time,

            "end_time": end_time

        })

    return predictions


# ==================================================
# HEALTH ENDPOINTS
# ==================================================

@app.get("/")
def home():

    return {
        "message": "Bird Guard AI Backend is running"
    }


@app.get("/api/health")
def health():

    return {

        "backend": "online",

        "audio_conversion": "ready",

        "birdnet": (
            "loaded"
            if birdnet_model is not None
            else "ready_to_load"
        ),

        "crop_knowledge": "loaded",

        "bird_taxonomy": (
            "loaded"
            if bird_taxonomy is not None
            else "ready_to_load"
        )

    }


@app.get("/api/crop-evidence")
def get_crop_evidence(
    crop_id: str | None = None,
    scientific_name: str | None = None,
    evidence_status: str | None = None
):
    normalized_crop_id = crop_id.strip().lower() if crop_id else None
    normalized_status = (
        evidence_status.strip().lower()
        if evidence_status
        else None
    )

    supported_crop_ids = {
        crop["crop_id"]
        for crop in SUPPORTED_CROPS
    }

    if normalized_crop_id and normalized_crop_id not in supported_crop_ids:
        raise HTTPException(
            status_code=400,
            detail="Unsupported crop. Use one of the supported crop IDs."
        )

    if normalized_status and normalized_status not in EVIDENCE_STATUSES:
        raise HTTPException(
            status_code=400,
            detail="Invalid evidence status."
        )

    records = list_crop_evidence(
        crop_id=normalized_crop_id,
        scientific_name=scientific_name.strip() if scientific_name else None,
        evidence_status=normalized_status
    )

    return {
        "status": "success",
        "supported_crops": list(SUPPORTED_CROPS),
        "evidence_statuses": sorted(EVIDENCE_STATUSES),
        "total_records": len(records),
        "records": records
    }


class ManualCropEvidenceSubmission(BaseModel):
    crop_id: str = Field(min_length=1, max_length=32)
    scientific_name: str = Field(min_length=1, max_length=150)
    common_name: str = Field(default="", max_length=150)
    relationship: Literal["pest", "non_pest", "beneficial", "neutral", "unknown"]
    damage_type: list[str] = Field(default_factory=list, max_length=20)
    growth_stages: list[str] = Field(default_factory=list, max_length=5)
    impact_description: str = Field(default="", max_length=2000)
    source_title: str = Field(min_length=1, max_length=250)
    source_url: str = Field(default="", max_length=2048)
    source_year: int | None = Field(default=None, ge=1000, le=2100)
    source_publisher: str = Field(default="", max_length=250)
    evidence_level: str = Field(default="manual_submission", max_length=50)

    @field_validator("crop_id")
    @classmethod
    def normalize_crop_id(cls, value):
        return value.strip().lower()

    @field_validator("scientific_name", "common_name", "source_title", "source_publisher", "impact_description")
    @classmethod
    def trim_text(cls, value):
        return value.strip()

    @field_validator("source_title")
    @classmethod
    def require_source_title(cls, value):
        if not value:
            raise ValueError("Evidence source or observation title is required.")
        return value

    @field_validator("source_url")
    @classmethod
    def validate_source_url(cls, value):
        value = value.strip()
        if value:
            parsed_url = urlparse(value)
            if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
                raise ValueError("Evidence source URL must use HTTP or HTTPS.")
        return value

    @field_validator("damage_type")
    @classmethod
    def normalize_damage_types(cls, values):
        return [value.strip() for value in values if value.strip()]

    @field_validator("growth_stages")
    @classmethod
    def validate_growth_stages(cls, values):
        allowed_stages = {
            "seedling", "vegetative", "flowering", "grain_filling", "maturity"
        }
        normalized = []
        for value in values:
            stage = "_".join(
                value.strip().lower().replace("-", " ").replace("/", " ").split()
            )
            if stage == "maturity_harvest":
                stage = "maturity"
            if stage:
                normalized.append(stage)
        if any(value not in allowed_stages for value in normalized):
            raise ValueError("One or more growth stages are unsupported.")
        return list(dict.fromkeys(normalized))


@app.post("/api/crop-evidence", status_code=201)
def submit_manual_crop_evidence(submission: ManualCropEvidenceSubmission):
    try:
        record = create_manual_crop_evidence(submission.model_dump())
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    return {
        "status": "pending_review",
        "message": "Evidence saved as pending review; it is not treated as verified.",
        "record": record
    }


# ==================================================
# RECORDING AND CROP ASSESSMENT API
# ==================================================

@app.post("/api/recordings")
async def analyse_recording(
    file: UploadFile = File(...),
    crop_id: str = Form("other"),
    growth_stage: str = Form("unknown"),
    save_empty_recording: bool = Form(True),
    latitude: float | None = Form(None),
    longitude: float | None = Form(None),
    location_accuracy: float | None = Form(None),
    alert_output: str = Form("arduino"),
    confidence_threshold: float | None = Form(None)
):

    recording_id = uuid.uuid4().hex
    alert_output = alert_output.strip().lower()
    if alert_output not in {"arduino", "laptop"}:
        raise HTTPException(
            status_code=400,
            detail="Alert output must be 'arduino' or 'laptop'."
        )
    if confidence_threshold is not None and not 0.0 <= confidence_threshold <= 1.0:
        raise HTTPException(
            status_code=400,
            detail="Confidence threshold must be between 0 and 1."
        )

        # Validate optional GPS coordinates.
    if (latitude is None) != (longitude is None):
        raise HTTPException(
            status_code=400,
            detail="Latitude and longitude must be supplied together."
        )

    if latitude is not None:
        if not (-90 <= latitude <= 90):
            raise HTTPException(
                status_code=400,
                detail="Invalid latitude."
            )

        if not (-180 <= longitude <= 180):
            raise HTTPException(
                status_code=400,
                detail="Invalid longitude."
            )

    if location_accuracy is not None and location_accuracy < 0:
        raise HTTPException(
            status_code=400,
            detail="Invalid location accuracy."
        )

    webm_path = UPLOAD_DIR / f"{recording_id}.webm"
    wav_path = PROCESSED_DIR / f"{recording_id}.wav"

    try:

        # SAVE UPLOADED AUDIO
        with webm_path.open("wb") as destination:

            while True:

                chunk = await file.read(1024 * 1024)

                if not chunk:
                    break

                destination.write(chunk)

        if webm_path.stat().st_size == 0:
            webm_path.unlink(missing_ok=True)

            raise HTTPException(
                status_code=400,
                detail="The uploaded recording is empty"
            )

        # CONVERT WEBM TO WAV
        await run_in_threadpool(
            convert_webm_to_wav,
            webm_path,
            wav_path
        )

        if wav_path.stat().st_size <= 44:
            webm_path.unlink(missing_ok=True)
            wav_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=400,
                detail="The uploaded segment contains no audio samples."
            )

        # BIRDNET SPECIES DETECTION
        predictions = await run_in_threadpool(
            analyse_with_birdnet,
            wav_path
        )

        if predictions:
            logger.info(
                "BirdNET identified %s verified bird detection(s): %s",
                len(predictions),
                ", ".join(
                    f"{item['scientific_name']} "
                    f"({item['confidence']:.3f})"
                    for item in predictions
                ),
            )
        else:
            logger.info("BirdNET returned no verified bird detections.")

        buzzer_alert = request_buzzer_for_detection(
            predictions,
            alert_output=alert_output,
            confidence_threshold=confidence_threshold
        )

        # CROP IMPACT ASSESSMENT
        assessed_predictions = []

        for prediction in predictions:

            crop_assessment = assess_crop_impact(
                prediction["scientific_name"],
                crop_id,
                growth_stage
            )

            assessed_predictions.append({
                **prediction,
                "crop_assessment": crop_assessment
            })

        # COUNT DOCUMENTED PEST CANDIDATES
        pest_count = sum(
            1
            for item in assessed_predictions
            if (
                item["crop_assessment"]["classification"]
                == "pest"
            )
        )

        # BUILD API RESPONSE
        history_saved = bool(assessed_predictions) or save_empty_recording

        response_data = {

            "status": "analysed",

            "recording_id": recording_id,

            "audio_file": (
                wav_path.name
                if history_saved
                else None
            ),

            "history_saved": history_saved,

            "selected_crop": crop_id,

            "growth_stage": growth_stage,

            "latitude": latitude,

            "longitude": longitude,

            "location_accuracy": location_accuracy,

            "bird_detected": bool(assessed_predictions),

            # This is detection segment count,
            # not individual birds.
            "bird_count": len(assessed_predictions),

            "documented_pest_candidate_count": pest_count,

            "predictions": assessed_predictions,

            "buzzer_alert": buzzer_alert,

            "alert_output": alert_output,

            "message": (
                "Bird detection and crop assessment completed"
                if assessed_predictions
                else "No verified bird species detected"
            ),

            "risk_note": (
                "Live crop pest risk has not yet been calculated. "
                "BirdNET confidence and reported historical crop "
                "damage are separate measurements. A buzzer alert indicates "
                f"bird identification only (threshold "
                f"{buzzer_alert['confidence_threshold']:.0%}); it is not a pest-risk "
                "or crop-damage assessment."
            )

        }

        # MAKE RESPONSE JSON-SAFE
        safe_response = make_json_safe(response_data)

        if history_saved:
            save_history_record(
                recording_id=recording_id,
                selected_crop=crop_id,
                growth_stage=growth_stage,
                predictions=safe_response["predictions"],
                audio_filename=webm_path.name,
                latitude=latitude,
                longitude=longitude,
                location_accuracy=location_accuracy
            )
        else:
            for temporary_path in (webm_path, wav_path):
                try:
                    temporary_path.unlink(missing_ok=True)
                except OSError as cleanup_error:
                    print(
                        f"Could not remove empty recording segment "
                        f"{temporary_path}: {cleanup_error}"
                    )

        return safe_response

    except HTTPException:
        raise

    except Exception as error:

        print(
            f"Recording analysis error: {repr(error)}"
        )

        raise HTTPException(
            status_code=500,
            detail=f"Audio analysis failed: {str(error)}"
        )

    finally:

        # Always close the uploaded file.
        await file.close()


# ==================================================
# DETECTION HISTORY API
# ==================================================

@app.get("/api/history")
def get_detection_history(limit: int = 100):

    records = list_history_records(limit)

    return {
        "status": "success",
        "total_records": len(records),
        "records": records
    }

@app.get("/api/field-activity")
def get_field_activity(limit: int = 500):

    records = list_field_activity_records(limit)

    mapped_records = [
        record for record in records
        if (
            record["latitude"] is not None
            and record["longitude"] is not None
            and -90 <= record["latitude"] <= 90
            and -180 <= record["longitude"] <= 180
        )
    ]

    detected_records = [
        record for record in records
        if record["bird_detected"]
    ]

    total_segments = sum(
        record["detection_segments"]
        for record in detected_records
    )

    return {
        "status": "success",
        "total_recordings": len(records),
        "total_locations": len(mapped_records),
        "unmapped_recordings": len(records) - len(mapped_records),
        "detected_recordings": len(detected_records),
        "total_detection_segments": total_segments,
        "records": records
    }


@app.get("/api/history/{recording_id}")
def get_detection_history_detail(recording_id: str):

    record = get_history_record(recording_id)

    if record is None:

        raise HTTPException(
            status_code=404,
            detail="History record not found"
        )

    return {
        "status": "success",
        "record": record
    }


@app.get("/api/history/{recording_id}/audio")
def play_history_audio(recording_id: str):

    record = get_history_record(recording_id)

    if record is None:

        raise HTTPException(
            status_code=404,
            detail="History record not found"
        )

    safe_filename = Path(
        record["audio_filename"]
    ).name

    audio_path = UPLOAD_DIR / safe_filename

    if not audio_path.is_file():

        raise HTTPException(
            status_code=404,
            detail="Recording audio file not found"
        )

    return FileResponse(
        path=audio_path,
        media_type="audio/webm",
        filename="bird-recording.webm"
    )


@app.delete("/api/history/{recording_id}")
def remove_detection_history(recording_id: str):

    record = delete_history_record(recording_id)

    if record is None:

        raise HTTPException(
            status_code=404,
            detail="History record not found"
        )

    # Remove the associated WebM and processed WAV files.
    safe_filename = Path(
        record["audio_filename"]
    ).name

    webm_path = UPLOAD_DIR / safe_filename
    wav_path = PROCESSED_DIR / f"{recording_id}.wav"

    if webm_path.is_file():
        webm_path.unlink()

    if wav_path.is_file():
        wav_path.unlink()

    return {

        "status": "success",

        "message": "History record deleted successfully",

        "recording_id": recording_id

    }