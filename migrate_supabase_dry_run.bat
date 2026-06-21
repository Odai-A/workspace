@echo off
REM Preview pending migrations without applying anything.
cd /d "%~dp0"
python scripts\supabase_migrate.py --dry-run
pause
