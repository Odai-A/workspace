# Desktop App Quickstart (Windows)

This project can now run as a desktop app with Electron.

## 1) Start in development mode

From `inventory_system`:

```bash
npm run desktop:dev
```

`desktop:dev` now does the safe thing automatically:
- If Vite is already running on `5174`, it attaches Electron to that server.
- If not, it starts Vite on `5174` and then launches Electron.

You can still force attach mode manually:

```bash
npm run desktop:attach
```

## 2) Run desktop app from production build

From `inventory_system`:

```bash
npm run desktop:start
```

This builds `dist/` and launches Electron against the production bundle.
In this mode, Electron uses the local desktop edge server (`127.0.0.1:5178`) and proxies `/api`.

## 3) Build a Windows installer (recommended; supports auto-update)

From `inventory_system`:

```bash
npm run desktop:pack
```

This runs **electron-builder** and writes an NSIS installer plus update metadata under `release/`:

- **Installer:** `release/Inventory System Setup <version>.exe` (distribute this for new installs)
- **Auto-update files:** `release/latest.yml`, `release/Inventory System Setup <version>.exe.blockmap`, and the same `.exe` — host these at the **same HTTPS base URL** you configure (see below)

First-time installs should use the **Setup** wizard. Installed apps check for updates about **12 seconds** after launch and again every **6 hours**.

### Optional: loose folder (no installer / no auto-update)

Same as before (zip the whole folder):

```bash
npm run desktop:pack:folder
```

Output: `release/Inventory System-win32-x64/Inventory System.exe`

## 4) Configure auto-update (HTTPS feed)

1. In `package.json`, under `build.publish[0].url`, set your public HTTPS folder (must end with `/`), for example `https://cdn.example.com/inventory-desktop/`.
2. Run `npm run desktop:pack`, then upload **`latest.yml`**, **`Inventory System Setup <version>.exe`**, and **`.exe.blockmap`** to that exact URL path (so `https://…/inventory-desktop/latest.yml` works).
3. Bump **`version`** in `package.json` for each release; rebuild and re-upload the three files.

**Runtime override (optional):** set `DESKTOP_UPDATE_FEED_URL` when launching the app to override the baked-in feed (HTTPS base URL; trailing slash optional). The build-time `publish.url` is what most installs use.

**Disable checks:** set `DESKTOP_UPDATES=0` (or `false` / `off`) before starting the app.

## Notes

- Packaged desktop app now prefers local backend first:
  - `http://127.0.0.1:5000` (auto-start attempted when available)
  - Falls back to `https://inventory-backend-6bb3.onrender.com` only if local backend is unavailable
- No Cursor or terminal is required for normal use after install: start from the Start menu or desktop shortcut.
- Desktop production runs a local edge service at `http://127.0.0.1:5178` and proxies `/api` to backend.
- Override backend target for desktop with `DESKTOP_BACKEND_URL` if needed.
- If backend target is local (`127.0.0.1:5000`), the desktop app attempts to auto-start backend in the background.
- The existing web app deployment flow is unchanged.
