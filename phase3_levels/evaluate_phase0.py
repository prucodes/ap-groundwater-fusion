"""Generate the structured Phase 0 evaluation artifact from local inputs."""
import argparse
import datetime
import json
import os

from cross_validate_cgwb import evaluate as evaluate_cross_network
from train_multihorizon import evaluate as evaluate_direct_forecasts
from train_spatial import evaluate as evaluate_spatial

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUTPUT = os.path.join(HERE, "outputs", "phase0_evaluations.json")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    nowcast_path = os.path.join(HERE, "outputs", "mandal_nowcasts_v2.json")
    with open(nowcast_path) as handle:
        nowcast = json.load(handle)
    payload = {
        "schemaVersion": "1.0.0",
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "modelVersion": nowcast["modelVersion"],
        "temporalNowcast": nowcast["evaluation"]["temporalNowcast"],
        "intervalEvaluation": nowcast["evaluation"]["temporalNowcast"]["intervalEvaluation"],
        "spatialEstimation": evaluate_spatial(),
        "directForecast": evaluate_direct_forecasts(),
        "crossNetworkComparison": evaluate_cross_network(),
    }
    with open(args.output, "w") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
    print(f"wrote {args.output}")


if __name__ == "__main__":
    main()
