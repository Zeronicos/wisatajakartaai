import argparse
import subprocess
import sys
from pathlib import Path


def run(cmd: list[str], cwd: Path) -> None:
    print(">", " ".join(cmd))
    completed = subprocess.run(cmd, cwd=str(cwd), check=False)
    if completed.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(cmd)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run full data pipeline: schema -> load -> narratives -> embeddings.")
    parser.add_argument("--poi", required=True)
    parser.add_argument("--restaurants", required=True)
    parser.add_argument("--minimarkets", required=True)
    parser.add_argument("--stops", required=True)
    parser.add_argument("--truncate", action="store_true")
    parser.add_argument("--with-narratives", action="store_true")
    parser.add_argument("--narrative-limit", type=int, default=100)
    parser.add_argument("--embed-limit", type=int, default=None)
    parser.add_argument("--continue-on-error", action="store_true")
    args = parser.parse_args()

    here = Path(__file__).resolve().parent
    backend_dir = here.parent
    py = sys.executable

    run([py, "-m", "data_preprocessing.init_db"], cwd=backend_dir)

    load_cmd = [
        py,
        "-m",
        "data_preprocessing.load_data",
        "--poi",
        args.poi,
        "--restaurants",
        args.restaurants,
        "--minimarkets",
        args.minimarkets,
        "--stops",
        args.stops,
    ]
    if args.truncate:
        load_cmd.append("--truncate")
    run(load_cmd, cwd=backend_dir)

    if args.with_narratives:
        narrative_cmd = [
            py,
            "-m",
            "data_preprocessing.generate_narratives",
            "--limit",
            str(args.narrative_limit),
        ]
        if args.continue_on_error:
            narrative_cmd.append("--continue-on-error")
        run(narrative_cmd, cwd=backend_dir)

    embed_cmd = [py, "-m", "data_preprocessing.generate_embeddings", "--only-missing"]
    if args.embed_limit is not None:
        embed_cmd.extend(["--limit", str(args.embed_limit)])
    if args.continue_on_error:
        embed_cmd.append("--continue-on-error")
    run(embed_cmd, cwd=backend_dir)

    print("Full pipeline selesai.")


if __name__ == "__main__":
    main()
