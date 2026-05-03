# Deploy: Render and Supabase regions (scan latency)

When **cached** scans still feel slow, the bottleneck is often **round-trip time to Supabase** (many queries per scan) or **heavy queries**, not the FNSKU vendor.

## Align regions

1. Note your **Supabase project region** (Dashboard → Project Settings → Infrastructure / region).
2. Deploy the **Render web service** in the **same or nearest** region so `POST /api/scan` pays minimal RTT on every `api_lookup_cache`, `scan_history`, trial, and role check.
3. If most users are in one geography, weigh **user ↔ Render** vs **Render ↔ Supabase**; usually colocating **Render + Supabase** matters more for scan throughput than Render vs end-user.

## Prove it is “DB / region” vs “external API”

1. In DevTools Network, compare **TTFB** for `POST /api/scan` on the **same code twice** (second hit should use `api_lookup_cache` / manifest fast paths).  
   - Second request **much faster** → first hit dominated by **external** + first-time writes.  
   - **Both slow** → suspect **cross-region Supabase**, **RLS/query cost**, or **Render cold start**.

2. Compare **`X-Scan-Server-Total-Ms`** with **TTFB**. Large gap → network or platform in front of your app code.

3. Use **`X-Scan-Server-Stages-Ms`** (and `SCAN_PERF` logs): if time jumps before `after_fnsku_cache_block` or before `after_trial_gate`, focus on **Supabase** and **auth/trial** helpers; if it jumps after `before_fnsku_external`, focus on **FNSKU** and **Rainforest**.

## Hot paths (for later profiling)

`scan_product` in `app.py` touches cache reads, optional Rainforest on cache enrich, FNSKU AddOrGet/poll, `_build_fnsku_scan_response_and_save`, `log_scan_to_history`, and `api_scan_logs`. When tuning queries, prefer **indexed filters** (e.g. `fnsku`, `upc`, `user_id`) and avoid N+1 patterns inside the scan path.
