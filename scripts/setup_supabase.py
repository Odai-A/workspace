#!/usr/bin/env python3
"""
Configure ScanScope Supabase locally:
  1. Validate root .env credentials
  2. Sync VITE_* vars into inventory_system/.env
  3. Apply pending SQL migrations to Supabase Postgres (skips already-applied)
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from dotenv import dotenv_values, load_dotenv

ROOT = Path(__file__).resolve().parents[1]
FRONTEND_ENV = ROOT / "inventory_system" / ".env"
ENV_EXAMPLE = ROOT / ".env.example"
ENV_FILE = ROOT / ".env"

PLACEHOLDER_PATTERNS = (
    "your-project",
    "your-anon-key",
    "YOUR_PROJECT_REF",
    "YOUR_DB_PASSWORD",
    "placeholder",
)


def looks_like_placeholder(value: str | None) -> bool:
    if not value:
        return True
    lowered = value.lower().strip()
    if not lowered:
        return True
    return any(token in lowered for token in PLACEHOLDER_PATTERNS)


def ensure_root_env() -> bool:
    if ENV_FILE.exists():
        return True

    if ENV_EXAMPLE.exists():
        ENV_FILE.write_text(ENV_EXAMPLE.read_text(encoding="utf-8"), encoding="utf-8")
        print(f"Created {ENV_FILE} from .env.example")
        print("Edit .env with your Supabase credentials, then run this script again.")
        return False

    print(f"Missing {ENV_FILE}. Create it with SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_KEY, DATABASE_URL.")
    return False


def validate_supabase_env(*, require_database: bool = True) -> tuple[bool, dict[str, str]]:
    load_dotenv(ENV_FILE)
    values = dotenv_values(ENV_FILE)

    required = {
        "SUPABASE_URL": values.get("SUPABASE_URL", ""),
        "SUPABASE_KEY": values.get("SUPABASE_KEY", "") or values.get("VITE_SUPABASE_KEY", ""),
        "SUPABASE_SERVICE_KEY": values.get("SUPABASE_SERVICE_KEY", ""),
        "DATABASE_URL": values.get("DATABASE_URL", ""),
    }

    api_keys = ("SUPABASE_URL", "SUPABASE_KEY", "SUPABASE_SERVICE_KEY")
    missing = [key for key in api_keys if looks_like_placeholder(required[key])]

    if require_database and looks_like_placeholder(required["DATABASE_URL"]):
        missing.append("DATABASE_URL")

    if missing:
        print("Supabase is not fully configured in .env yet. Fix these keys:")
        for key in missing:
            print(f"  - {key}")
        print("\nWhere to find them in Supabase dashboard:")
        print("  SUPABASE_URL / SUPABASE_KEY / SUPABASE_SERVICE_KEY -> Project Settings > API")
        if "DATABASE_URL" in missing:
            print("  DATABASE_URL -> Project Settings > Database > Connection string (URI)")
        return False, required

    if not required["SUPABASE_URL"].startswith("https://") or ".supabase.co" not in required["SUPABASE_URL"]:
        print("SUPABASE_URL should look like https://abcdefgh.supabase.co")
        return False, required

    return True, required


def sync_frontend_env(values: dict[str, str]) -> None:
    lines: list[str] = []
    if FRONTEND_ENV.exists():
        lines = FRONTEND_ENV.read_text(encoding="utf-8").splitlines()

    updates = {
        "VITE_API_URL": os.environ.get("VITE_API_URL", "http://localhost:5000/api"),
        "VITE_SUPABASE_URL": values["SUPABASE_URL"],
        "VITE_SUPABASE_ANON_KEY": values["SUPABASE_KEY"],
    }

    existing = {}
    for line in lines:
        if "=" in line and not line.strip().startswith("#"):
            key, _, val = line.partition("=")
            existing[key.strip()] = val

    merged = {**existing, **updates}
    output = [
        "# Auto-synced by scripts/setup_supabase.py",
        "# Edit root .env, then re-run setup to refresh frontend values.",
        "",
    ]
    for key, val in merged.items():
        output.append(f"{key}={val}")
    output.append("")

    FRONTEND_ENV.write_text("\n".join(output), encoding="utf-8")
    print(f"Synced frontend env -> {FRONTEND_ENV}")


def test_supabase_api(values: dict[str, str]) -> bool:
    try:
        from supabase import create_client

        client = create_client(values["SUPABASE_URL"], values["SUPABASE_KEY"])
        client.table("tenants").select("id").limit(1).execute()
        print("Supabase API connection OK.")
        return True
    except Exception as exc:
        message = str(exc).lower()
        if "relation" in message and "does not exist" in message:
            print("Supabase API reachable (tables not migrated yet — running migrations next).")
            return True
        print(f"Supabase API check failed: {exc}")
        print("Verify SUPABASE_URL and SUPABASE_KEY in .env.")
        return False


def import_migrator():
    scripts_dir = Path(__file__).resolve().parent
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    from supabase_migrate import print_status, run_migrations

    return print_status, run_migrations


def main() -> int:
    parser = argparse.ArgumentParser(description="ScanScope Supabase one-time / safe setup")
    parser.add_argument("--dry-run", action="store_true", help="Preview pending migrations only")
    parser.add_argument("--status", action="store_true", help="Show migration status only")
    parser.add_argument("--skip-migrate", action="store_true", help="Sync .env only, do not migrate")
    parser.add_argument("--migrate-only", action="store_true", help="Migrate only, skip .env sync")
    args = parser.parse_args()

    print("=== ScanScope Supabase setup ===\n")
    print("Safe mode: only touches your Supabase cloud database + local .env files.")
    print("Your Windows system and app code are not modified.\n")

    if not ensure_root_env():
        return 1

    ok, values = validate_supabase_env(require_database=False)
    if not ok:
        return 1

    print_status, run_migrations = import_migrator()

    if args.status:
        return print_status(values["DATABASE_URL"])

    if not args.migrate_only:
        sync_frontend_env(values)
        if not test_supabase_api(values):
            return 1

    if args.skip_migrate:
        print("\nSkipped migrations (--skip-migrate).")
        print("Add DATABASE_URL to .env, then run setup_supabase.bat again to migrate.")
        return 0

    if looks_like_placeholder(values["DATABASE_URL"]):
        print("\nSynced .env files. DATABASE_URL is still missing — add it to run migrations:")
        print("  Supabase dashboard -> Project Settings -> Database -> Connection string (URI)")
        return 0

    code = run_migrations(values["DATABASE_URL"], dry_run=args.dry_run)
    if code == 0 and not args.dry_run:
        print("\nDone. Restart dev servers so the frontend picks up .env changes:")
        print("  Backend:  python app.py")
        print("  Frontend: cd inventory_system && npm run dev")
    return code


if __name__ == "__main__":
    sys.exit(main())
