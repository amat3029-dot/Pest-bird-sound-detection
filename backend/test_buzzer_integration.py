import unittest
from unittest.mock import Mock, patch

from backend import iot_api
from backend.arduino_bridge import (
    encode_buzzer_command,
    parse_serial_message,
    poll_buzzer_command,
)


class BuzzerIntegrationTests(unittest.TestCase):
    def setUp(self):
        with iot_api._state_lock:
            iot_api.latest_reading = None
            iot_api.bridge_state.update(
                connected=False,
                serial_port=None,
                buzzer_status="OFFLINE",
                last_seen=None,
            )
            iot_api._command_queue.clear()
            iot_api._last_buzzer_alert = 0.0

    def test_sensor_api_and_bridge_status_are_reported(self):
        sensor_response = iot_api.receive_sensor_data(
            iot_api.SensorReading(
                sensor="DIGITAL_SOUND",
                sound_level=0,
                threshold=0,
                status="DETECTED",
            )
        )
        self.assertEqual(sensor_response["data"]["status"], "DETECTED")

        iot_api.receive_bridge_status(
            iot_api.BridgeStatus(
                connected=True,
                serial_port="COM6",
                buzzer_status="READY",
            )
        )

        status = iot_api.get_iot_status()
        self.assertEqual(status["arduino_status"], "CONNECTED")
        self.assertEqual(status["com_port"], "COM6")
        self.assertEqual(status["buzzer_status"], "READY")
        self.assertEqual(status["data"]["sound_level"], 0)

    def test_only_qualified_verified_detection_queues_buzzer_command(self):
        iot_api.receive_bridge_status(
            iot_api.BridgeStatus(
                connected=True,
                serial_port="COM6",
                buzzer_status="READY",
            )
        )
        prediction = {
            "scientific_name": "Passer domesticus",
            "confidence": iot_api.BUZZER_CONFIDENCE_THRESHOLD,
            "start_time": 0.0,
            "end_time": 3.0,
        }

        with patch("backend.iot_api.threading.Timer") as timer_class:
            timer_class.return_value.start.return_value = None
            result = iot_api.request_buzzer_for_detection([prediction])

        self.assertEqual(result["status"], "queued")
        self.assertEqual(
            iot_api.get_next_bridge_command()["command"],
            "BUZZER_ON",
        )
        timer_class.assert_called_once()
        if iot_api.BUZZER_COOLDOWN_SECONDS > 0:
            self.assertEqual(
                iot_api.request_buzzer_for_detection([prediction])["status"],
                "cooldown",
            )

    def test_empty_invalid_and_below_threshold_detections_do_not_queue(self):
        iot_api.receive_bridge_status(
            iot_api.BridgeStatus(
                connected=True,
                serial_port="COM6",
                buzzer_status="READY",
            )
        )
        invalid = {
            "scientific_name": "Passer domesticus",
            "confidence": 0.99,
            "start_time": 0.0,
            "end_time": 0.0,
        }
        self.assertEqual(
            iot_api.request_buzzer_for_detection([])["status"],
            "not_qualified",
        )
        self.assertEqual(
            iot_api.request_buzzer_for_detection([invalid])["status"],
            "not_qualified",
        )
        if iot_api.BUZZER_CONFIDENCE_THRESHOLD > 0:
            below_threshold = {
                **invalid,
                "confidence": iot_api.BUZZER_CONFIDENCE_THRESHOLD - 0.01,
                "end_time": 2.0,
            }
            self.assertEqual(
                iot_api.request_buzzer_for_detection([below_threshold])["status"],
                "not_qualified",
            )
        self.assertIsNone(iot_api.get_next_bridge_command()["command"])

    def test_buzzer_request_is_rejected_until_bridge_reports_ready(self):
        iot_api.receive_bridge_status(
            iot_api.BridgeStatus(
                connected=True,
                serial_port="COM6",
                buzzer_status="OFFLINE",
            )
        )
        prediction = {
            "scientific_name": "Passer domesticus",
            "confidence": 0.99,
            "start_time": 0.0,
            "end_time": 2.0,
        }
        result = iot_api.request_buzzer_for_detection([prediction])
        self.assertEqual(result["status"], "offline")
        self.assertIsNone(iot_api.get_next_bridge_command()["command"])

    def test_laptop_output_does_not_enqueue_physical_buzzer(self):
        prediction = {
            "scientific_name": "Pavo cristatus",
            "confidence": 0.95,
            "start_time": 0.0,
            "end_time": 2.0,
        }
        result = iot_api.request_buzzer_for_detection(
            [prediction],
            alert_output="laptop",
        )
        self.assertEqual(result["status"], "laptop_sound")
        self.assertEqual(result["species"], "Pavo cristatus")
        self.assertIsNone(iot_api.get_next_bridge_command()["command"])

    def test_selected_threshold_cannot_lower_bird_alert_below_80_percent(self):
        prediction = {
            "scientific_name": "Alcedo atthis",
            "confidence": 0.85,
            "start_time": 0.0,
            "end_time": 2.0,
        }
        with patch.object(iot_api, "BUZZER_CONFIDENCE_THRESHOLD", 0.70):
            self.assertEqual(
                iot_api.get_iot_status()["buzzer_confidence_threshold"],
                0.80,
            )
            result = iot_api.request_buzzer_for_detection(
                [prediction],
                alert_output="laptop",
                confidence_threshold=0.30,
            )
            self.assertEqual(result["status"], "laptop_sound")
            self.assertEqual(result["confidence_threshold"], 0.80)

            below_minimum = {**prediction, "confidence": 0.79}
            rejected = iot_api.request_buzzer_for_detection(
                [below_minimum],
                alert_output="laptop",
                confidence_threshold=0.10,
            )
            self.assertEqual(rejected["status"], "not_qualified")
            self.assertEqual(rejected["confidence_threshold"], 0.80)

    def test_unsupported_alert_output_is_rejected(self):
        with self.assertRaises(ValueError):
            iot_api.request_buzzer_for_detection([], alert_output="sensor")
        with self.assertRaises(ValueError):
            iot_api.request_buzzer_for_detection(
                [],
                confidence_threshold=1.1,
            )

    def test_serial_sensor_messages_and_command_encoding(self):
        message = parse_serial_message("SOUND,0,0,DETECTED")
        self.assertEqual(message["type"], "sensor")
        self.assertEqual(message["sound_level"], 0)
        self.assertEqual(message["status"], "DETECTED")
        self.assertEqual(
            parse_serial_message("BUZZER,ACTIVE")["status"],
            "ACTIVE",
        )
        self.assertEqual(encode_buzzer_command("BUZZER_ON"), b"BUZZER_ON\n")
        self.assertEqual(encode_buzzer_command("BUZZER_OFF"), b"BUZZER_OFF\n")
        self.assertIsNone(parse_serial_message("SOUND,not-a-number,0,QUIET"))
        with self.assertRaises(ValueError):
            encode_buzzer_command("digitalWrite(8,HIGH)")

    def test_bridge_polls_and_writes_only_supported_serial_commands(self):
        session = Mock()
        session.get.return_value.json.return_value = {"command": "BUZZER_ON"}
        arduino = Mock()

        poll_buzzer_command(session, arduino)

        arduino.write.assert_called_once_with(b"BUZZER_ON\n")
        arduino.flush.assert_called_once_with()

        session.get.return_value.json.return_value = {
            "command": "digitalWrite(8,HIGH)"
        }
        arduino.reset_mock()
        poll_buzzer_command(session, arduino)
        arduino.write.assert_not_called()


if __name__ == "__main__":
    unittest.main()
