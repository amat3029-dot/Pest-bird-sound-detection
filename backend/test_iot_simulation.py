
import json
import time

def parse_sensor_data(line):
    parts = line.strip().split(",")

    if len(parts) != 4 or parts[0] != "SOUND":
        return None

    return {
        "sensor": parts[0],
        "sound_level": int(parts[1]),
        "threshold": int(parts[2]),
        "status": parts[3],
        "timestamp": time.time()
    }


# Simulated Arduino serial messages
test_messages = [
    "SOUND,25,80,NORMAL",
    "SOUND,65,80,NORMAL",
    "SOUND,110,80,HIGH",
    "SOUND,150,80,HIGH"
]

print("BIRD GUARD AI - SENSOR SIMULATION")
print("--------------------------------")

for message in test_messages:
    result = parse_sensor_data(message)

    if result:
        print(json.dumps(result, indent=2))
