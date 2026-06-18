#!/usr/bin/env python3
"""Fetch public prototype AP boundary/name sources and update the manifest."""

from __future__ import annotations

import argparse
import csv
import shutil
import subprocess
import tempfile
import zipfile
from datetime import date
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlretrieve


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = REPO_ROOT / "data/source_manifest.csv"
MANIFEST_COLUMNS = [
    "source_name",
    "source_url",
    "license",
    "downloaded_or_created_date",
    "data_label",
    "official_flag",
    "notes",
]
SOURCES = [
    {
        "source_name": "satishvmadala/andhrapradesh_opendata_locations",
        "source_url": "https://github.com/satishvmadala/andhrapradesh_opendata_locations",
        "zip_url": "https://github.com/satishvmadala/andhrapradesh_opendata_locations/archive/refs/heads/master.zip",
        "license": "GPL-3.0",
        "target_dir": REPO_ROOT / "data/raw/boundaries/satishvmadala_ap_open_data",
        "notes": "Fetched public prototype AP name/location source; not official APWRIMS boundary data.",
    },
    {
        "source_name": "datta07/INDIAN-SHAPEFILES",
        "source_url": "https://github.com/datta07/INDIAN-SHAPEFILES",
        "zip_url": "https://github.com/datta07/INDIAN-SHAPEFILES/archive/refs/heads/master.zip",
        "license": "MIT",
        "target_dir": REPO_ROOT / "data/raw/boundaries/datta07_indian_shapefiles",
        "notes": "Fetched public prototype shapefile source; verify AP coverage and admin level before use.",
    },
]


def is_placeholder_only(path: Path) -> bool:
    if not path.exists():
        return True
    entries = [entry.name for entry in path.iterdir()]
    return not entries or entries == [".gitkeep"]


def prepare_target_dir(target_dir: Path) -> None:
    if is_placeholder_only(target_dir):
        if target_dir.exists():
            shutil.rmtree(target_dir)
        target_dir.parent.mkdir(parents=True, exist_ok=True)
        return
    if (target_dir / ".git").exists():
        return
    raise SystemExit(
        f"Refusing to overwrite non-empty non-git directory: {target_dir}\n"
        "Move or review its contents, then rerun this script."
    )


def run_git_command(args: list[str], cwd: Path | None = None) -> None:
    try:
        subprocess.run(args, cwd=cwd, check=True)
    except FileNotFoundError as error:
        raise SystemExit("git is unavailable. Install git or use --method zip if network access allows downloads.") from error
    except subprocess.CalledProcessError as error:
        raise RuntimeError(f"Git command failed: {' '.join(args)}") from error


def fetch_with_git(source: dict[str, object]) -> None:
    target_dir = source["target_dir"]
    assert isinstance(target_dir, Path)
    prepare_target_dir(target_dir)

    if (target_dir / ".git").exists():
        run_git_command(["git", "pull", "--ff-only"], cwd=target_dir)
        return

    source_url = str(source["source_url"])
    run_git_command(["git", "clone", "--depth", "1", source_url, str(target_dir)])


def copy_extracted_tree(extracted_root: Path, target_dir: Path) -> None:
    if target_dir.exists():
        shutil.rmtree(target_dir)
    target_dir.mkdir(parents=True, exist_ok=True)
    for child in extracted_root.iterdir():
        destination = target_dir / child.name
        if child.is_dir():
            shutil.copytree(child, destination)
        else:
            shutil.copy2(child, destination)


def fetch_with_zip(source: dict[str, object]) -> None:
    target_dir = source["target_dir"]
    assert isinstance(target_dir, Path)
    prepare_target_dir(target_dir)
    if (target_dir / ".git").exists():
        raise SystemExit(f"{target_dir} is already a git clone; use --method git to update it.")

    zip_url = str(source["zip_url"])
    with tempfile.TemporaryDirectory() as tmpdir_name:
        tmpdir = Path(tmpdir_name)
        zip_path = tmpdir / "source.zip"
        try:
            urlretrieve(zip_url, zip_path)
        except URLError as error:
            raise RuntimeError(f"Could not download {zip_url}") from error

        with zipfile.ZipFile(zip_path) as archive:
            archive.extractall(tmpdir / "extract")
        roots = [path for path in (tmpdir / "extract").iterdir() if path.is_dir()]
        if len(roots) != 1:
            raise RuntimeError(f"Unexpected archive layout for {zip_url}")
        copy_extracted_tree(roots[0], target_dir)


def read_manifest(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        return [dict(row) for row in reader]


def update_manifest(path: Path, fetched_sources: list[dict[str, object]]) -> None:
    rows = read_manifest(path)
    by_name = {row["source_name"]: row for row in rows if row.get("source_name")}

    for source in fetched_sources:
        source_name = str(source["source_name"])
        by_name[source_name] = {
            "source_name": source_name,
            "source_url": str(source["source_url"]),
            "license": str(source["license"]),
            "downloaded_or_created_date": str(date.today()),
            "data_label": "prototype-public-source",
            "official_flag": "false",
            "notes": str(source["notes"]),
        }

    ordered_names = [row["source_name"] for row in rows if row.get("source_name")]
    for source in fetched_sources:
        source_name = str(source["source_name"])
        if source_name not in ordered_names:
            ordered_names.append(source_name)

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=MANIFEST_COLUMNS)
        writer.writeheader()
        for source_name in ordered_names:
            writer.writerow(by_name[source_name])


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--method", choices=["git", "zip"], default="git")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    fetched: list[dict[str, object]] = []
    for source in SOURCES:
        try:
            if args.method == "git":
                fetch_with_git(source)
            else:
                fetch_with_zip(source)
        except Exception as error:
            raise SystemExit(
                f"Failed to fetch {source['source_name']} from {source['source_url']}.\n"
                f"Reason: {error}\n"
                "Check network access, repository availability, and credentials if required. "
                "You can also retry with --method zip."
            ) from error
        fetched.append(source)
        print(f"Fetched {source['source_name']} into {source['target_dir']}")

    update_manifest(args.manifest, fetched)
    print(f"Updated source manifest at {args.manifest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

