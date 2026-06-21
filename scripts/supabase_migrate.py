#!/usr/bin/env python3
"""Apply SQL files from supabase_migrations/ to a Supabase Postgres database."""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

import psycopg2
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS_DIR = ROOT / "supabase_migrations"
TRACKING_TABLE = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT NOW()
);
"""


def split_sql_statements(sql_text: str) -> list[str]:
    """Split SQL into statements, respecting PostgreSQL dollar-quoted blocks."""
    statements: list[str] = []
    buf: list[str] = []
    dollar_delim: str | None = None
    i = 0
    text = sql_text
    length = len(text)

    while i < length:
        if dollar_delim is None and text[i] == "$":
            match = re.match(r"\$([A-Za-z0-9_]*)\$", text[i:])
            if match:
                dollar_delim = match.group(0)
                buf.append(dollar_delim)
                i += len(dollar_delim)
                continue

        if dollar_delim and text.startswith(dollar_delim, i):
            buf.append(dollar_delim)
            i += len(dollar_delim)
            dollar_delim = None
            continue

        if dollar_delim is None and text[i] == ";":
            statement = "".join(buf).strip()
            if statement and not statement.startswith("--"):
                statements.append(statement)
            buf = []
            i += 1
            continue

        buf.append(text[i])
        i += 1

    tail = "".join(buf).strip()
    if tail and not tail.startswith("--"):
        statements.append(tail)
    return statements


def migration_files() -> list[Path]:
    return sorted(MIGRATIONS_DIR.glob("*.sql"))


def mask_database_url(database_url: str) -> str:
    parsed = urlparse(database_url)
    host = parsed.hostname or "unknown-host"
    port = parsed.port or 5432
    db = (parsed.path or "/postgres").lstrip("/")
    return f"postgresql://***@{host}:{port}/{db}"


def load_database_url(explicit: str | None = None) -> str | None:
    load_dotenv(ROOT / ".env")
    return explicit or os.environ.get("DATABASE_URL")


def connect(database_url: str):
    return psycopg2.connect(database_url)


def ensure_tracking_table(conn) -> None:
    with conn.cursor() as cur:
        cur.execute(TRACKING_TABLE)
    conn.commit()


def applied_migrations(conn) -> set[str]:
    ensure_tracking_table(conn)
    with conn.cursor() as cur:
        cur.execute("SELECT filename FROM schema_migrations ORDER BY filename")
        return {row[0] for row in cur.fetchall()}


def migration_plan(conn) -> tuple[list[Path], list[Path], list[Path]]:
    files = migration_files()
    already = applied_migrations(conn)
    pending = [f for f in files if f.name not in already]
    applied = [f for f in files if f.name in already]
    return files, applied, pending


def apply_file(conn, path: Path) -> None:
    sql_text = path.read_text(encoding="utf-8")
    statements = split_sql_statements(sql_text)
    with conn.cursor() as cur:
        for statement in statements:
            cur.execute(statement)
        cur.execute(
            "INSERT INTO schema_migrations (filename) VALUES (%s) ON CONFLICT DO NOTHING",
            (path.name,),
        )
    conn.commit()


def print_status(database_url: str) -> int:
    if not MIGRATIONS_DIR.is_dir():
        print(f"ERROR: migrations folder not found: {MIGRATIONS_DIR}")
        return 1

    print(f"Database: {mask_database_url(database_url)}")
    conn = connect(database_url)
    try:
        all_files, applied, pending = migration_plan(conn)
        print(f"Total migration files: {len(all_files)}")
        print(f"Already applied:       {len(applied)}")
        print(f"Pending:               {len(pending)}")
        if pending:
            print("\nPending migrations:")
            for path in pending:
                print(f"  - {path.name}")
        else:
            print("\nDatabase schema is up to date.")
        return 0
    finally:
        conn.close()


def run_migrations(database_url: str | None = None, *, dry_run: bool = False) -> int:
    database_url = load_database_url(database_url)
    if not database_url:
        print("ERROR: DATABASE_URL is missing from .env")
        print("Get it from Supabase: Project Settings > Database > Connection string (URI)")
        return 1

    if not MIGRATIONS_DIR.is_dir():
        print(f"ERROR: migrations folder not found: {MIGRATIONS_DIR}")
        return 1

    files = migration_files()
    if not files:
        print("No migration files found.")
        return 0

    print(f"Target: {mask_database_url(database_url)}")
    conn = connect(database_url)
    conn.autocommit = False

    try:
        _, _, pending = migration_plan(conn)

        if not pending:
            print("Nothing to do — all migrations already applied.")
            return 0

        if dry_run:
            print(f"Dry run — would apply {len(pending)} migration(s):")
            for path in pending:
                print(f"  - {path.name}")
            print("\nNo changes were made.")
            return 0

        print(f"Applying {len(pending)} pending migration(s)...")
        for path in pending:
            print(f"  -> {path.name}")
            try:
                apply_file(conn, path)
            except Exception as exc:
                conn.rollback()
                print(f"STOPPED on {path.name}: {exc}")
                print("Earlier migrations in this run were saved; this one was rolled back.")
                return 1

        print("Migrations complete.")
        return 0
    finally:
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Apply pending Supabase SQL migrations safely (skips already-applied files)."
    )
    parser.add_argument("--dry-run", action="store_true", help="Show pending migrations without applying")
    parser.add_argument("--status", action="store_true", help="Show applied vs pending migrations")
    args = parser.parse_args()

    database_url = load_database_url()
    if not database_url:
        print("ERROR: DATABASE_URL is missing from .env")
        return 1

    if args.status:
        return print_status(database_url)
    return run_migrations(database_url, dry_run=args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
