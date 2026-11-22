
import birdnet
from multiprocessing import freeze_support
import numpy as np


def main():
    model = birdnet.load("acoustic", "3.0", "onnx")

    result = model.predict(
        "recordings/test_recording.wav",
        top_k=5,
        n_producers=1,
        n_workers=1,
        default_confidence_threshold=0.0,
        show_stats="minimal"
    )

    print("\nPrediction table:")
    dataframe = result.to_dataframe()
    print(dataframe.to_string(index=False))

    print("\nMaximum raw prediction score:")
    print(np.max(result.species_probs))

    print("\nSpecies count:")
    print(result.n_species)


if __name__ == "__main__":
    freeze_support()
    main()
