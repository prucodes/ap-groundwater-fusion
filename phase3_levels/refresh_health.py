"""What the weekly refresh could not refresh, in a few lines a person can read.

The weekly run tolerates an optional step failing, and the APWRIMS fetcher
keeps a feed's previous section when the portal misbehaves. Both are right for
the site, which should keep showing last week's dated figures rather than
nothing. Both were also silent. This prints one line per step that failed or
feed that was kept, and nothing when all is well, so the workflow can open an
issue only when there is something to say.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RUN_LOG = os.path.join(HERE, "outputs", "weekly_run_log.json")
APWRIMS_RECEIPT = os.path.join(ROOT, "data", "refresh_receipts", "apwrims_context.json")


def load(path):
    try:
        with open(path) as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return None


def problems(run_log, apwrims):
    lines = []
    for step in (run_log or {}).get("steps", []):
        if not step.get("ok"):
            kind = "required" if step.get("required") else "optional"
            lines.append(f"- Step failed ({kind}): {step.get('step')} (exit {step.get('rc')}, {step.get('secs')} s)")
    for name, status in ((apwrims or {}).get("sections") or {}).items():
        if status.get("status") != "refreshed":
            lines.append(f"- APWRIMS {name}: {status.get('status')}: {status.get('error', 'no reason given')}")
    return lines


def main():
    lines = problems(load(RUN_LOG), load(APWRIMS_RECEIPT))
    if lines:
        print("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
