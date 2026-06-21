@echo off
REM Safe Supabase setup: sync .env + apply only NEW migrations (skips already-applied).
cd /d "%~dp0"
python scripts\setup_supabase.py %*
if errorlevel 1 pause
