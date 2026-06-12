#!/usr/bin/env python3
"""Manage annotation-tool login accounts."""

from __future__ import annotations

import argparse
import base64
import getpass
import hashlib
import json
import secrets
import sys
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = PROJECT_ROOT / "src" / "config" / "accounts.json"
DEFAULT_ITERATIONS = 200_000


def load_config() -> dict[str, Any]:
    if not CONFIG_PATH.exists():
        return {"users": {}}
    with CONFIG_PATH.open("r", encoding="utf-8") as handle:
        config = json.load(handle)
    config.setdefault("users", {})
    return config


def save_config(config: dict[str, Any]) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CONFIG_PATH.open("w", encoding="utf-8") as handle:
        json.dump(config, handle, indent=2)
        handle.write("\n")


def derive_password(password: str, iterations: int) -> dict[str, Any]:
    salt = secrets.token_bytes(16)
    password_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        iterations,
        dklen=32,
    )
    return {
        "salt": base64.b64encode(salt).decode("ascii"),
        "iterations": iterations,
        "passwordHash": base64.b64encode(password_hash).decode("ascii"),
    }


def read_password(args: argparse.Namespace) -> str:
    if args.password is not None:
        password = args.password
    else:
        password = getpass.getpass("Password: ")
        confirm = getpass.getpass("Confirm password: ")
        if password != confirm:
            raise ValueError("Passwords do not match.")

    if not password:
        raise ValueError("Password cannot be empty.")
    return password


def add_account(args: argparse.Namespace) -> None:
    config = load_config()
    users = config["users"]

    if args.username in users and not args.force:
        raise ValueError(f"Account already exists: {args.username}")

    users[args.username] = {
        "role": args.role,
        **derive_password(read_password(args), args.iterations),
    }
    save_config(config)
    print(f"Saved {args.role} account: {args.username}")


def remove_account(args: argparse.Namespace) -> None:
    config = load_config()
    users = config["users"]

    if args.username not in users:
        raise ValueError(f"Account does not exist: {args.username}")

    del users[args.username]
    save_config(config)
    print(f"Removed account: {args.username}")


def list_accounts(_: argparse.Namespace) -> None:
    config = load_config()
    for username in sorted(config["users"]):
        role = config["users"][username].get("role", "annotator")
        print(f"{username}\t{role}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    add_parser = subparsers.add_parser("add", help="Create or update an account")
    add_parser.add_argument("username")
    add_parser.add_argument(
        "--role",
        choices=["annotator", "admin"],
        default="annotator",
        help="Account tier (default: annotator)",
    )
    add_parser.add_argument("--password", help="Password to set; omit to enter securely")
    add_parser.add_argument("--iterations", type=int, default=DEFAULT_ITERATIONS)
    add_parser.add_argument("--force", action="store_true", help="Overwrite an existing account")
    add_parser.set_defaults(func=add_account)

    remove_parser = subparsers.add_parser("remove", help="Remove an account")
    remove_parser.add_argument("username")
    remove_parser.set_defaults(func=remove_account)

    list_parser = subparsers.add_parser("list", help="List accounts")
    list_parser.set_defaults(func=list_accounts)

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
