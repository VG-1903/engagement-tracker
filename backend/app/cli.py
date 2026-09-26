"""Command line entry points.

    python -m app.cli seed [--reset]
    python -m app.cli generate-recurring [--as-of YYYY-MM-DD]   # what a nightly cron job runs
"""

import argparse
import json
from datetime import date

from app.db import SessionLocal


def main() -> None:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_seed = sub.add_parser("seed", help="Load demo data")
    p_seed.add_argument("--reset", action="store_true", help="Wipe all tables first")
    p_gen = sub.add_parser("generate-recurring", help="Create due recurring engagements (idempotent)")
    p_gen.add_argument("--as-of", type=date.fromisoformat, default=None)
    args = parser.parse_args()

    with SessionLocal() as db:
        if args.cmd == "seed":
            from app.seed import seed

            seed(db, force_reset=args.reset)
        elif args.cmd == "generate-recurring":
            from app.services.engagements import generate_due_recurring

            result = generate_due_recurring(db, as_of=args.as_of)
            print(json.dumps(result.model_dump(mode="json"), indent=2))


if __name__ == "__main__":
    main()
