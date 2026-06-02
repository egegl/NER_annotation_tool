#!/usr/bin/env python3
"""Manage NER labels used by the annotation tool."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = PROJECT_ROOT / "src" / "config" / "labels.json"


def load_config() -> dict[str, Any]:
    if not CONFIG_PATH.exists():
        return {"labels": []}
    with CONFIG_PATH.open("r", encoding="utf-8") as handle:
        config = json.load(handle)
    config.setdefault("labels", [])
    return config


def save_config(config: dict[str, Any]) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CONFIG_PATH.open("w", encoding="utf-8") as handle:
        json.dump(config, handle, indent=2)
        handle.write("\n")


def find_label(labels: list[dict[str, Any]], name: str) -> dict[str, Any] | None:
    return next((label for label in labels if label.get("name") == name), None)


def next_color_index(labels: list[dict[str, Any]]) -> int:
    existing = [label.get("colorIndex") for label in labels if isinstance(label.get("colorIndex"), int)]
    return (max(existing) + 1) if existing else 0


def add_label(args: argparse.Namespace) -> None:
    config = load_config()
    labels = config["labels"]
    existing = find_label(labels, args.name)

    if existing and not args.force:
        raise ValueError(f"Label already exists: {args.name}")

    color_index = args.color_index if args.color_index is not None else next_color_index(labels)
    label = {"name": args.name, "colorIndex": color_index}

    if existing:
        existing.update(label)
    else:
        labels.append(label)

    save_config(config)
    print(f"Saved label: {args.name}")


def remove_label(args: argparse.Namespace) -> None:
    config = load_config()
    labels = config["labels"]
    remaining = [label for label in labels if label.get("name") != args.name]

    if len(remaining) == len(labels):
        raise ValueError(f"Label does not exist: {args.name}")

    config["labels"] = remaining
    save_config(config)
    print(f"Removed label: {args.name}")


def list_labels(_: argparse.Namespace) -> None:
    config = load_config()
    for label in config["labels"]:
        color_index = label.get("colorIndex", "")
        print(f"{label.get('name', '')}\t{color_index}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    add_parser = subparsers.add_parser("add", help="Create or update a label")
    add_parser.add_argument("name")
    add_parser.add_argument("--color-index", type=int)
    add_parser.add_argument("--force", action="store_true", help="Overwrite an existing label")
    add_parser.set_defaults(func=add_label)

    remove_parser = subparsers.add_parser("remove", help="Remove a label")
    remove_parser.add_argument("name")
    remove_parser.set_defaults(func=remove_label)

    list_parser = subparsers.add_parser("list", help="List labels")
    list_parser.set_defaults(func=list_labels)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        args.func(args)
    except ValueError as error:
        parser.exit(1, f"error: {error}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
