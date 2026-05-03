# Render scan latency: environment variables

Scans are mostly **I/O bound** (Supabase round-trips, FNSKU external API, optional Rainforest). Tuning these env vars caps worst-case time and can skip optional work on standard scans.

## Rainforest (optional enrichment)

| Variable | Default | Effect |
|----------|---------|--------|
| `SKIP_RAINFOREST_ON_STANDARD_SCAN` | `0` (off) | When `1` / `true` / `yes` / `on`, standard `POST /api/scan` skips the Rainforest HTTP call unless the client sends `force_api_lookup` / `forceApiLookup`. **Faster first response**; images/details may stay minimal until the user uses “Check for updates”, “Fetch images & details”, or another path that forces lookup. |
| `RAINFOREST_REQUEST_TIMEOUT` | `8` (seconds) | Timeout for Rainforest `requests.get` on the product endpoint. |

Logic in `app.py`: `should_fetch_rainforest = bool(force_api_lookup) or (not SKIP_RAINFOREST_ON_STANDARD_SCAN)`.

## FNSKU external API (`ato.fnskutoasin.com`)

| Variable | Default | Effect |
|----------|---------|--------|
| `FNSKU_ADD_OR_GET_TIMEOUT` | `8` | Per `AddOrGet` POST. |
| `FNSKU_GET_BY_BARCODE_TIMEOUT` | `8` | Per `GetByBarCode` GET (including poll loop). |
| `FNSKU_STATUS_LOOKUP_TIMEOUT` | `8` | Used on scan status paths. |
| `FNSKU_SCAN_INITIAL_MAX_POLLS` | `6` | Max poll iterations when ASIN not immediate. |
| `FNSKU_SCAN_INITIAL_POLL_INTERVAL_MS` | `700` | Sleep between polls (ms). |
| `FNSKU_SCAN_RETRY_ADD_AFTER` | `3` | Poll index at which a second `AddOrGet` is attempted. |

Lower timeouts or fewer polls **reduce tail latency** but increase “not found until retry” behavior when the vendor is slow.

## Measuring TTFB vs server time

1. **Browser DevTools → Network**  
   Select `POST …/api/scan`. Compare **TTFB** (time to first byte) for a **cache hit** (repeat same FNSKU) vs a **never-seen** code.

2. **Response headers** (exposed via CORS `expose_headers` for cross-origin clients)  
   - `X-Scan-Server-Total-Ms` — wall time inside the Flask worker for that request.  
   - `X-Scan-Server-Stages-Ms` — compact stage timestamps (ms since request start), e.g. `auth_inputs_ready:12ms;after_trial_gate:45ms;…`.

3. **Client round-trip (opt-in)**  
   In the browser console, run `localStorage.setItem('SCAN_CLIENT_TIMING', '1')` and reload. After each solo/batch scan path that uses `lookupProductByCode`, the console logs `[SCAN_CLIENT_TIMING]` with `client_roundtrip_ms` (includes queue, TLS, and browser) plus the server headers above. Set `localStorage.removeItem('SCAN_CLIENT_TIMING')` to disable.

4. **Server logs**  
   Each scan response logs `SCAN_PERF total_ms=… marks=… code=…` with the same stage labels.

**Interpretation:** If **TTFB** ≫ **`X-Scan-Server-Total-Ms`**, look at **region**, **TLS**, **cold start**, or **client** (e.g. `SCAN_MAX_CONCURRENCY` queueing in `Scanner.jsx`). If server total is high, use `X-Scan-Server-Stages-Ms` / `marks` to see whether time sits in cache, FNSKU external, Rainforest, or DB save.

See also [DEPLOY_RENDER_REGIONS.md](./DEPLOY_RENDER_REGIONS.md) for colocating Render with Supabase.
