"""Compatibility entry point for the canonical Arduino serial bridge."""

if __package__:
    from .arduino_bridge import run_bridge
else:
    from arduino_bridge import run_bridge


if __name__ == "__main__":
    run_bridge()
