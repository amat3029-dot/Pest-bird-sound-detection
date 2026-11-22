#include <string.h>

#define SOUND_SENSOR_PIN 2
#define BUZZER_PIN 8

// Most LM393-based digital sound modules assert LOW when their threshold trips.
// Change this to HIGH if your module has the opposite polarity.
#define SOUND_ACTIVE_LEVEL LOW

// Keep at 0 for an active buzzer; set to 1 for a passive piezo transducer.
#define BUZZER_USE_TONE 0
#define BUZZER_TONE_HZ 2000
#define BUZZER_ACTIVE_LEVEL HIGH
#define BUZZER_MAX_ON_MS 5000UL
#define SENSOR_REPORT_INTERVAL_MS 500UL

char serialBuffer[32];
size_t serialBufferLength = 0;
bool buzzerActive = false;
unsigned long buzzerStartedAt = 0;
unsigned long lastSensorReportAt = 0;

void setBuzzer(bool enabled) {
  buzzerActive = enabled;

#if BUZZER_USE_TONE
  if (enabled) {
    tone(BUZZER_PIN, BUZZER_TONE_HZ);
  } else {
    noTone(BUZZER_PIN);
    digitalWrite(BUZZER_PIN, LOW);
  }
#else
  digitalWrite(
    BUZZER_PIN,
    enabled ? BUZZER_ACTIVE_LEVEL : (BUZZER_ACTIVE_LEVEL == HIGH ? LOW : HIGH)
  );
#endif

  if (enabled) {
    buzzerStartedAt = millis();
    Serial.println("BUZZER,ACTIVE");
  } else {
    Serial.println("BUZZER,OFF");
  }
}

void handleCommand(const char *command) {
  if (strcmp(command, "BUZZER_ON") == 0) {
    setBuzzer(true);
  } else if (strcmp(command, "BUZZER_OFF") == 0) {
    setBuzzer(false);
  }
}

void readSerialCommands() {
  while (Serial.available() > 0) {
    const char incoming = static_cast<char>(Serial.read());

    if (incoming == '\n') {
      serialBuffer[serialBufferLength] = '\0';
      handleCommand(serialBuffer);
      serialBufferLength = 0;
    } else if (incoming != '\r') {
      if (serialBufferLength < sizeof(serialBuffer) - 1) {
        serialBuffer[serialBufferLength++] = incoming;
      } else {
        serialBufferLength = 0;
      }
    }
  }
}

void reportSoundSensor() {
  const int rawValue = digitalRead(SOUND_SENSOR_PIN);
  const bool detected = rawValue == SOUND_ACTIVE_LEVEL;
  const int activeLevel = SOUND_ACTIVE_LEVEL == HIGH ? 1 : 0;

  Serial.print("SOUND,");
  Serial.print(rawValue);
  Serial.print(",");
  Serial.print(activeLevel);
  Serial.print(",");
  Serial.println(detected ? "DETECTED" : "QUIET");
}

void setup() {
  pinMode(SOUND_SENSOR_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  Serial.begin(115200);
  setBuzzer(false);
}

void loop() {
  readSerialCommands();

  const unsigned long now = millis();
  if (buzzerActive && now - buzzerStartedAt >= BUZZER_MAX_ON_MS) {
    setBuzzer(false);
  }

  if (now - lastSensorReportAt >= SENSOR_REPORT_INTERVAL_MS) {
    lastSensorReportAt = now;
    reportSoundSensor();
  }
}
