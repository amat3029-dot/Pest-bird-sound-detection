import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import crop_evidence


class ManualCropEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        database_path = Path(self.temporary_directory.name) / "evidence.sqlite3"
        self.connections = []

        def connect_to_test_database():
            connection = sqlite3.connect(database_path)
            connection.row_factory = sqlite3.Row
            self.connections.append(connection)
            return connection

        self.connection_patch = patch.object(
            crop_evidence,
            "get_connection",
            connect_to_test_database,
        )
        self.connection_patch.start()
        crop_evidence.init_crop_evidence_db({"crops": [], "sources": []})

    def tearDown(self):
        self.connection_patch.stop()
        for connection in self.connections:
            connection.close()
        self.temporary_directory.cleanup()

    def test_manual_evidence_is_persisted_as_pending_review(self):
        record = crop_evidence.create_manual_crop_evidence({
            "crop_id": "sugarcane",
            "scientific_name": "Passer domesticus",
            "common_name": "House Sparrow",
            "relationship": "pest",
            "damage_type": ["feeding on shoots"],
            "growth_stages": ["seedling"],
            "impact_description": "Observed crop damage.",
            "source_title": "Field observation",
            "source_url": "",
            "source_year": 2026,
            "source_publisher": "Farm staff",
            "evidence_status": "verified",
        })

        self.assertEqual(record["evidence_status"], "pending")
        self.assertEqual(record["crop_id"], "sugarcane")
        self.assertEqual(record["damage_type"], ["feeding on shoots"])
        self.assertEqual(
            crop_evidence.list_crop_evidence(
                crop_id="sugarcane",
                evidence_status="verified",
            ),
            [],
        )
        self.assertEqual(
            len(crop_evidence.list_crop_evidence(
                crop_id="sugarcane",
                evidence_status="pending",
            )),
            1,
        )

    def test_manual_evidence_rejects_unsupported_crop_and_relationship(self):
        evidence = {
            "crop_id": "unknown-crop",
            "scientific_name": "Passer domesticus",
            "relationship": "pest",
            "source_title": "Field observation",
        }
        with self.assertRaisesRegex(ValueError, "Unsupported crop"):
            crop_evidence.create_manual_crop_evidence(evidence)

        evidence["crop_id"] = "sugarcane"
        evidence["relationship"] = "unsafe"
        with self.assertRaisesRegex(ValueError, "relationship"):
            crop_evidence.create_manual_crop_evidence(evidence)

    def test_manual_evidence_rejects_non_http_source_urls(self):
        with self.assertRaisesRegex(ValueError, "HTTP or HTTPS"):
            crop_evidence.create_manual_crop_evidence({
                "crop_id": "sugarcane",
                "scientific_name": "Passer domesticus",
                "relationship": "pest",
                "source_title": "Field observation",
                "source_url": "javascript:alert(1)",
            })


if __name__ == "__main__":
    unittest.main()
