import birdnet

def main():
    print("Loading BirdNET 3.0...")
    model = birdnet.load("acoustic", "3.0", "onnx")

    print("Analysing recording...")
    result = model.predict(
        "recordings/processed/test_conversion.wav",
        top_k=5,
        n_producers=1,
        n_workers=1,
        default_confidence_threshold=0.1,
        show_stats="minimal"
    )

    df = result.to_dataframe()

    if df.empty:
        print("No species passed the 10% confidence threshold.")
    else:
        print("\nCandidate predictions:")
        print(df[["start_time", "end_time", "species_name", "confidence"]].to_string(index=False))

if __name__ == "__main__":
    from multiprocessing import freeze_support
    freeze_support()
    main()
