# Bird Guard AI Arduino integration

## Data flow

The existing Live Detection page captures 15-second segments from the selected
browser microphone and posts them to the existing `POST /api/recordings` route.
FastAPI converts each non-empty segment and runs the existing BirdNET model and
verified-bird taxonomy. Only a verified bird prediction meeting the configured
confidence threshold can request an alert; this is bird identification, not a
crop-pest or crop-damage finding.

Choose **Arduino physical buzzer** or **Laptop sound** in Live Detection.
Laptop sound uses the existing browser bird-alert audio and does not enqueue
Arduino buzzer commands. The choice is saved in browser storage.
The confidence percentage selected in Bird Detection Settings is sent with each
segment and gates both alert outputs. Bird alerts are always enabled; there is
no mute control. The species cooldown remains configurable to prevent repeated
alerts.

`backend/arduino_bridge.py` is the only process that opens the Arduino serial
port. It forwards D2 sensor readings to FastAPI and polls the existing backend
process for `BUZZER_ON` / `BUZZER_OFF` commands. The Arduino independently
turns the buzzer off after its fail-safe timeout.

The digital sound sensor reports general sound activity only. Its digital
output does not measure calibrated sound intensity and cannot identify bird
species.

## Wiring and configuration

- Sound sensor `DO` -> Arduino `D2`; sensor `GND` -> Arduino `GND`;
  sensor `VCC` -> the voltage supported by the sensor board.
- Buzzer control is Arduino `D8`. The buzzer type and electrical rating in this
  setup are unknown: **do not connect an unknown two-wire buzzer directly to
  an Arduino GPIO pin**. Use an appropriately rated transistor or logic-level
  MOSFET driver. For a low-side NPN driver, connect D8 through a base resistor
  to the transistor base, emitter to common ground, and collector to the
  buzzer's negative lead; power the buzzer from a supply appropriate to its
  rating, with the positive lead on supply positive. Join supply and Arduino
  grounds. Add a flyback diode across the buzzer only if its specifications
  indicate an inductive load (cathode to positive). Verify the driver and
  buzzer ratings before powering the circuit.
- In `bird_guard_ai.ino`, set `SOUND_ACTIVE_LEVEL` to match the sound module's
  digital output polarity. `BUZZER_USE_TONE` is `0` for an active buzzer and
  `1` for a passive piezo. The sketch's buzzer output is active-high by default;
  change `BUZZER_ACTIVE_LEVEL` only for an inverting driver.
- Upload `hardware/arduino/bird_guard_ai.ino` to an Arduino Uno at 115200 baud.
  Close Arduino IDE Serial Monitor before starting the Python bridge.

## Windows PowerShell setup

Run from `C:\kittu\bird-pest-detection`. If dependencies are not already
installed in the project virtual environment:

```powershell
.\venv\Scripts\python.exe -m pip install fastapi "uvicorn[standard]" python-multipart av birdnet pyserial requests
```

In **Terminal 1**, start FastAPI and configure the alert policy:

```powershell
Set-Location C:\kittu\bird-pest-detection
$env:BIRDNET_ALERT_CONFIDENCE_THRESHOLD = "0.80"
$env:BUZZER_ALERT_COOLDOWN_SECONDS = "60"
$env:BUZZER_ON_DURATION_SECONDS = "1.5"
Set-Location backend
..\venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8010
```

The alert confidence setting is a number from `0` to `1`; siren alerts always
require at least `0.80` confidence, even when a lower setting is supplied.
Duration is `0.1` to `5` seconds, and cooldown is `0` to `86400` seconds.
These are identification alert settings, not pest-risk thresholds.

In **Terminal 2**, start the single serial bridge:

```powershell
Set-Location C:\kittu\bird-pest-detection
$env:ARDUINO_SERIAL_PORT = "COM6"
.\venv\Scripts\python.exe backend\arduino_bridge.py
```

The port can be changed by setting `ARDUINO_SERIAL_PORT` to the Windows COM port
assigned to the Arduino.

In **Terminal 3**, start the frontend:

```powershell
Set-Location C:\kittu\bird-pest-detection
.\venv\Scripts\python.exe -m http.server 5500 --directory frontend
```

Open `http://localhost:5500`, select the laptop microphone on Live Detection,
and grant microphone permission. The browser microphone API requires localhost
or HTTPS.

## API and verification

- `GET /api/iot/status` reports the latest real sensor reading, bridge
  connection, COM port, buzzer state, and configured confidence threshold.
- `POST /api/iot/bridge/status` is the bridge heartbeat.
- `GET /api/iot/commands/next` is polled only by the serial bridge.
- `GET` and `POST /api/iot/sensor` remain available for existing clients.
- Run the repository's focused software checks from its root:

```powershell
.\venv\Scripts\python.exe -m unittest backend.test_buzzer_integration -v
node --check frontend\script.js
```

Hardware verification is still required for the selected COM port, sensor
output polarity, microphone permissions/device selection, buzzer type and
driver ratings, and actual buzzer activation and fail-safe shutoff.
