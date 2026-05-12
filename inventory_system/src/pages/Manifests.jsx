import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  PrinterIcon,
  QrCodeIcon,
  ClipboardDocumentListIcon,
  ShoppingBagIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import JsBarcode from 'jsbarcode';
import { toast } from 'react-toastify';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { inventoryService, supabase } from '../config/supabaseClient';
import { productLookupService } from '../services/databaseService';
import {
  getLocationOptions,
  getNextItemNumber,
  getWarehouseLayoutSettings,
  isValidLocationCode,
  formatLocationDisplayForUi,
} from '../utils/warehouseSettings';
import { useAuth } from '../contexts/AuthContext';

/** Rows per page options for manifest table (client-side paging). */
const MANIFEST_PAGE_SIZE_OPTIONS = [50, 100, 500, 1000];

/**
 * Best JsBarcode format guess for a payload (manifest labels always use auto detection).
 * ASIN-like values fall through to CODE128.
 */
function inferJsBarcodeFormat(value) {
  const v = String(value || '').trim();
  if (!v) return 'CODE128';
  if (/^\d{12}$/.test(v)) return 'UPC';
  if (/^\d{13}$/.test(v)) return 'EAN13';
  if (/^\d{8}$/.test(v)) return 'EAN8';
  if (/^\d{5}$/.test(v)) return 'EAN5';
  if (/^\d{2}$/.test(v)) return 'EAN2';
  if (/^\d{14}$/.test(v)) return 'ITF14';
  if (/^\d+$/.test(v) && v.length >= 6 && v.length % 2 === 0 && v.length <= 14) return 'ITF';
  const v39 = v.replace(/\s/g, '');
  if (/^[0-9A-Z\-. $\/+%]+$/i.test(v39) && v39.length > 0 && v39.length <= 43) return 'CODE39';
  return 'CODE128';
}

function jsBarcodeFormatAttempts(formatPref, value) {
  if (formatPref === 'auto') {
    const guess = inferJsBarcodeFormat(value);
    return guess === 'CODE128' ? ['CODE128'] : [guess, 'CODE128'];
  }
  if (formatPref === 'CODE128') return ['CODE128'];
  return [formatPref, 'CODE128'];
}

/** Draw CODE128 / UPC / etc. on an SVG element; returns false if nothing worked. */
function drawJsBarcodeSvg(svg, text, formatPref, dims = {}) {
  const { width = 1.8, height = 44, displayValue = true, fontSize = 10, margin = 2 } = dims;
  const t = String(text ?? '').trim();
  if (!t || !svg) return false;
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  for (const fmt of jsBarcodeFormatAttempts(formatPref, t)) {
    try {
      JsBarcode(svg, t, { format: fmt, width, height, displayValue, fontSize, margin });
      return true;
    } catch {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
    }
  }
  return false;
}

/** localStorage only — hides a manifest from this tab; does not DELETE in Supabase. */
function hiddenManifestStorageKey(userId) {
  return `manifestsTabHidden:${userId || 'anon'}`;
}

function readHiddenManifestKeys(userId) {
  if (typeof window === 'undefined' || !userId) return new Set();
  try {
    const raw = window.localStorage.getItem(hiddenManifestStorageKey(userId));
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((k) => typeof k === 'string' && k.length > 0) : []);
  } catch {
    return new Set();
  }
}

function writeHiddenManifestKeys(userId, keysSet) {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.setItem(
      hiddenManifestStorageKey(userId),
      JSON.stringify([...keysSet])
    );
  } catch {
    /* quota / private mode */
  }
}

function displayName(row) {
  const r = row?.raw_row || {};
  return (
    r.product_name ||
    r.name ||
    row?.product_name ||
    '—'
  );
}

function displayMeta(row) {
  const r = row?.raw_row || {};
  const parts = [];
  if (row?.fnsku || r.fnsku) parts.push(`FNSKU: ${row?.fnsku || r.fnsku}`);
  if (row?.asin || r.asin) parts.push(`ASIN: ${row?.asin || r.asin}`);
  if (row?.lpn || r.lpn) parts.push(`LPN: ${row?.lpn || r.lpn}`);
  return parts.join(' · ');
}

function rawCategory(row) {
  const r = row?.raw_row || {};
  return String(r.category ?? r.Category ?? '').trim();
}

function rawPriceField(row) {
  const r = row?.raw_row || {};
  return r.price ?? r.unit_price ?? r.retail ?? r.msrp ?? r.list_price ?? r.cost;
}

function parseManifestPrice(val) {
  if (val == null || val === '') return null;
  let s = String(val).trim();
  if (!s) return null;
  s = s.replace(/[$€£\s]/g, '');
  // e.g. "12,50" without a dot → decimal comma
  if (/^\d+,\d{1,2}$/.test(s) && !s.includes('.')) {
    s = s.replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function displayPriceCell(row) {
  const v = rawPriceField(row);
  if (v == null || v === '') return '—';
  return String(v);
}

/** 10-char Amazon ASIN from row or raw_row (normalized). */
function rowAsin(row) {
  const r = row?.raw_row || {};
  const a = (row?.asin || r?.asin || '').toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (a.length !== 10) return '';
  return a;
}

function amazonProductUrl(asin) {
  return `https://www.amazon.com/dp/${encodeURIComponent(asin)}`;
}

/** Barcode value on printed labels: ASIN when valid, else FNSKU, else LPN (not LPN-first). */
function labelBarcodeValue(row) {
  const asin = rowAsin(row);
  if (asin) return asin;
  const r = row?.raw_row || {};
  const fn = (row?.fnsku || r.fnsku || '').toString().trim();
  if (fn) return fn;
  const lpn = (row?.lpn || r.lpn || '').toString().trim();
  return lpn || '';
}

function normalizeBucketCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '');
}

function composeManifestStorageLocation(baseLocation, bucketCode = '') {
  const normalizedBase = String(baseLocation || '').trim().toUpperCase();
  const normalizedBucket = normalizeBucketCode(bucketCode);
  if (!normalizedBucket) return normalizedBase;
  return `${normalizedBase}-${normalizedBucket}`;
}

function manifestRowImageUrl(row) {
  const r = row?.raw_row || {};
  const candidates = [
    r.image_url,
    r.imageUrl,
    r.main_image_url,
    r['Image URL'],
    r['image url'],
    r.photo_url,
    r.primary_image,
  ];
  const v = candidates.find((x) => x != null && String(x).trim() !== '');
  return v ? String(v).trim() : '';
}

/** SKU used for `inventory` rows (FNSKU preferred, then merchant SKU, ASIN, LPN). */
function inventorySkuFromManifestRow(row) {
  const r = row?.raw_row || {};
  const fn = (row?.fnsku || r.fnsku || '').toString().trim();
  if (fn) return fn;
  const merchantSku = (r.sku || r.merchant_sku || r['seller sku'] || '').toString().trim();
  if (merchantSku) return merchantSku;
  const asin = rowAsin(row);
  if (asin) return asin;
  const lpn = (row?.lpn || r.lpn || '').toString().trim();
  return lpn || '';
}

function manifestSaveConflictKey(pi) {
  if (pi.fnsku) return 'fnsku';
  if (pi.asin) return 'asin';
  if (pi.lpn) return 'lpn';
  return 'sku';
}

/** Shape compatible with Scanner `addProductInfoToInventory` / manifest_data save. */
function manifestRowToProductInfo(row) {
  const r = row?.raw_row || {};
  const name = displayName(row);
  const fnsku = (row?.fnsku || r.fnsku || '').toString().trim() || null;
  const asin = rowAsin(row) || null;
  const lpn = (row?.lpn || r.lpn || '').toString().trim() || null;
  const upc = (r.upc || r.UPC || '').toString().trim() || null;
  const sku = fnsku || (r.sku || r.merchant_sku || '').toString().trim() || asin || lpn || '';
  const price = parseManifestPrice(rawPriceField(row));
  const img = manifestRowImageUrl(row);
  return {
    name: name || 'Unknown Product',
    description: name || 'Unknown Product',
    fnsku,
    asin,
    lpn,
    upc,
    sku,
    price: price != null ? price : 0,
    category: rawCategory(row) || 'Uncategorized',
    image_url: img || '',
  };
}

/** Find a row in loaded manifest items by LPN / FNSKU / ASIN (exact, case-insensitive). */
function findManifestRowByScanCodeInItems(items, code) {
  const c = String(code || '').trim();
  if (!c) return null;
  const u = c.toUpperCase();
  return (
    items.find(
      (row) =>
        (row.lpn && String(row.lpn).toUpperCase() === u) ||
        (row.fnsku && String(row.fnsku).toUpperCase() === u) ||
        (row.asin && String(row.asin).toUpperCase() === u)
    ) || null
  );
}

/** Lowercased blob of searchable text for one manifest row. */
function rowSearchBlobLower(row) {
  const r = row.raw_row || {};
  return [
    row.fnsku,
    row.asin,
    row.lpn,
    r.product_name,
    r.name,
    r.category,
    r.brand,
    r.sku,
    r.upc,
    rawPriceField(row),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * Comma = OR (e.g. camera, car). Spaces without comma = AND (e.g. wireless camera).
 * Single phrase with no spaces/comma = substring match.
 */
function matchesManifestKeywordSearch(blobLower, rawQuery) {
  const q = String(rawQuery || '').trim().toLowerCase();
  if (!q) return true;
  if (q.includes(',')) {
    const parts = q
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return true;
    return parts.some((t) => blobLower.includes(t));
  }
  const tokens = q.split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  return tokens.every((t) => blobLower.includes(t));
}

/** Page numbers + ellipsis markers for manifest pagination UI. */
function getManifestPaginationSlots(currentPage, totalPages) {
  if (totalPages <= 1) return [{ type: 'page', n: 1 }];
  const want = new Set([1, totalPages, currentPage]);
  for (let d = -1; d <= 1; d++) {
    const p = currentPage + d;
    if (p >= 1 && p <= totalPages) want.add(p);
  }
  if (currentPage <= 3) {
    for (let p = 2; p <= Math.min(5, totalPages - 1); p++) want.add(p);
  }
  if (currentPage >= totalPages - 2) {
    for (let p = Math.max(2, totalPages - 4); p <= totalPages - 1; p++) want.add(p);
  }
  const sorted = [...want].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const slots = [];
  let prev = 0;
  for (const n of sorted) {
    if (n - prev > 1) slots.push({ type: 'ellipsis', key: `…${prev}-${n}` });
    slots.push({ type: 'page', n, key: `p${n}` });
    prev = n;
  }
  return slots;
}

/** Group import_batches into one row per upload session (or single batch if no session id). */
function groupBatchesIntoManifests(batches) {
  const groups = new Map();
  for (const b of batches || []) {
    const key =
      b.import_session_id && String(b.import_session_id).trim() !== ''
        ? `session:${b.import_session_id}`
        : `batch:${b.id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        sessionId: b.import_session_id || null,
        batchIds: [],
        fileNames: [],
        createdAt: b.created_at,
        rowsValid: 0,
        manifestRows: 0,
        chunks: 0,
      });
    }
    const g = groups.get(key);
    g.batchIds.push(b.id);
    if (b.file_name && !g.fileNames.includes(b.file_name)) g.fileNames.push(b.file_name);
    g.rowsValid += Number(b.rows_valid || 0);
    g.manifestRows += Number(b.manifest_rows_touched || 0);
    g.chunks += 1;
    if (b.created_at && (!g.createdAt || b.created_at > g.createdAt)) g.createdAt = b.created_at;
  }
  return Array.from(groups.values()).sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );
}

/** Zebra 2×1in label CSS — aligned with Scanner `createBatchBarcodeLabelHTML` / `createBarcodeLabelHTML`. */
const MANIFEST_ZEBRA_PRINT_STYLES = `
            @page {
              size: 2in 1in;
              margin: 0;
            }
            * {
              box-sizing: border-box;
              font-family: Arial, sans-serif;
            }
            html, body {
              margin: 0;
              padding: 0;
              width: 2in;
              background: #fff;
            }
            .label-page {
              width: 2in;
              height: 1in;
              margin: 0;
              padding: 0;
              overflow: hidden;
            }
            .label-page + .label-page {
              page-break-before: always;
              break-before: page;
            }
            .label {
              width: 2in;
              height: 1in;
              padding: 0.04in;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              border: 1px solid #111827;
              overflow: hidden;
            }
            .top-row {
              display: flex;
              flex-direction: row;
              align-items: flex-start;
              justify-content: space-between;
              gap: 0.04in;
              flex: 0 0 auto;
              min-height: 0;
              max-height: 0.28in;
            }
            .title {
              flex: 1;
              min-width: 0;
              font-size: 6.5pt;
              line-height: 1.12;
              font-weight: 700;
              overflow: hidden;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
              word-break: break-word;
            }
            .qr-wrap {
              flex-shrink: 0;
              width: 0.34in;
              height: 0.34in;
            }
            .label-qr {
              width: 0.34in;
              height: 0.34in;
              display: block;
              object-fit: contain;
              border: 1px solid #111827;
              background: #fff;
            }
            .barcode-wrap {
              flex: 1 1 auto;
              min-height: 0.28in;
              max-height: 0.38in;
              display: flex;
              align-items: center;
              justify-content: center;
              overflow: hidden;
            }
            .barcode-wrap svg {
              width: 100%;
              height: 100%;
            }
            .code {
              font-size: 7.5pt;
              font-weight: 700;
              text-align: center;
              line-height: 1;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              font-family: Consolas, "Courier New", monospace;
            }
            .fnsku-note {
              font-size: 5.5pt;
              text-align: center;
              color: #374151;
              margin-top: 0.01in;
              line-height: 1.05;
            }
            .print-button {
              position: fixed;
              top: 12px;
              right: 12px;
              padding: 8px 12px;
              border: none;
              border-radius: 6px;
              background: #2563eb;
              color: #fff;
              cursor: pointer;
              z-index: 1000;
            }
            @media print {
              .no-print { display: none; }
              html, body {
                width: 2in !important;
                margin: 0 !important;
                padding: 0 !important;
              }
              .label-page {
                page-break-inside: avoid;
                break-inside: avoid;
              }
            }
          `;

/**
 * Opens the browser print dialog for manifest labels.
 * Barcode jobs use the same 2in×1in Zebra layout as Scanner (JsBarcode height 28 / width 1.15, QR via qrserver).
 * @returns {boolean} false if the pop-up was blocked
 */
function triggerManifestBarcodePrintWindow(items, { title, labelType = 'barcode', includeAmazonQr = false, barcodeFormat = 'auto' } = {}) {
  if (!items?.length) return false;
  const w = window.open('', '_blank');
  if (!w) return false;

  if (labelType === 'barcode') {
    const specs = [];
    const pages = [];
    items.forEach((row, i) => {
      const code = labelBarcodeValue(row);
      if (!code) return;
      const productName = escapeHtml(displayName(row));
      const codeLabel = escapeHtml(String(code));
      const asin = rowAsin(row);
      const amzUrl = asin ? amazonProductUrl(asin) : '';
      const qrSrc =
        includeAmazonQr && amzUrl
          ? `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(amzUrl)}`
          : '';
      const qrBlock = qrSrc
        ? `<div class="qr-wrap" title="Open on Amazon"><img class="label-qr" src="${qrSrc}" alt="Amazon product" /></div>`
        : '';
      const safeId = String(row.id ?? i).replace(/[^a-zA-Z0-9_-]/g, '_');
      const id = `m-bc-${i}-${safeId}`;
      const formats = jsBarcodeFormatAttempts(barcodeFormat, code);
      specs.push({ id, value: String(code), formats });
      const note = asin
        ? 'Barcode = ASIN · QR = Amazon'
        : includeAmazonQr
          ? 'Barcode · No ASIN for QR'
          : 'Manifest label';
      pages.push(`
      <div class="label-page">
        <div class="label">
          <div class="top-row">
            <div class="title">${productName}</div>
            ${qrBlock}
          </div>
          <div class="barcode-wrap">
            <svg id="${id}"></svg>
          </div>
          <div class="code">${codeLabel}</div>
          <div class="fnsku-note">${note}</div>
        </div>
      </div>`);
    });

    if (pages.length === 0) {
      w.document.write(
        `<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title></head><body><p>No printable barcode values.</p></body></html>`
      );
      w.document.close();
      return true;
    }

    const specsJson = JSON.stringify(specs).replace(/</g, '\\u003c');
    const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>${MANIFEST_ZEBRA_PRINT_STYLES}</style>
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
  </head>
  <body>
    <div class="no-print">
      <button class="print-button" type="button" onclick="window.print()">Print labels</button>
    </div>
    ${pages.join('')}
    <script>
      (function () {
        var specs = ${specsJson};
        function init() {
          if (typeof JsBarcode === 'undefined') {
            setTimeout(init, 40);
            return;
          }
          specs.forEach(function (s) {
            if (!s || !s.value) return;
            var fmts = s.formats && s.formats.length ? s.formats : ['CODE128'];
            var ok = false;
            for (var i = 0; i < fmts.length && !ok; i++) {
              try {
                JsBarcode('#' + s.id, s.value, {
                  format: fmts[i],
                  displayValue: false,
                  margin: 0,
                  height: 28,
                  width: 1.15,
                });
                ok = true;
              } catch (e) {}
            }
            if (!ok) {
              var el = document.getElementById(s.id);
              if (el) {
                el.outerHTML =
                  '<div style="font-size:8pt;color:#b91c1c;text-align:center;">Invalid barcode</div>';
              }
            }
          });
        }
        init();
      })();
    </script>
  </body>
</html>`;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
    }, 700);
    return true;
  }

  /* Plain text labels — simple list (non-Zebra) */
  const styles = `
      @page { margin: 10mm; }
      body { font-family: system-ui, sans-serif; color: #111; }
      .sheet-title { font-size: 14px; margin-bottom: 12px; }
      .label {
        border: 1px solid #ccc;
        border-radius: 6px;
        padding: 10px 12px;
        margin-bottom: 12px;
        page-break-inside: avoid;
        max-width: 440px;
      }
      .label h3 { margin: 0 0 4px; font-size: 13px; }
      .label .meta { font-size: 11px; color: #444; margin-bottom: 6px; }
      .label .code { font-size: 12px; font-weight: 600; letter-spacing: 0.02em; }
    `;
  const body = items
    .map((row) => {
      const code = labelBarcodeValue(row);
      const name = displayName(row);
      const meta = displayMeta(row);
      return `<div class="label"><h3>${escapeHtml(name)}</h3><div class="meta">${escapeHtml(meta)}</div><div class="code">${escapeHtml(code || '—')}</div></div>`;
    })
    .join('');
  w.document.write(
    `<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title><style>${styles}</style></head><body><div class="sheet-title">${escapeHtml(title)}</div>${body}</body></html>`
  );
  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
  }, 250);
  return true;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Saves one manifest import line to inventory (manifest_data + inventory).
 * @returns {Promise<{ ok: boolean, sku?: string, message?: string, finalLocation?: string, wasUpdate?: boolean }>}
 */
async function persistManifestRowToInventory(row, { quantity, location, bucket, condition }) {
  const sku = inventorySkuFromManifestRow(row);
  if (!sku) {
    return { ok: false, message: 'Missing inventory SKU' };
  }
  const qty = parseInt(String(quantity), 10);
  if (!qty || qty < 1) {
    return { ok: false, sku, message: 'Invalid quantity' };
  }
  const layout = getWarehouseLayoutSettings();
  const normalizedLoc = String(location || '').trim().toUpperCase();
  if (!normalizedLoc || !isValidLocationCode(normalizedLoc, layout)) {
    return { ok: false, sku, message: 'Invalid location' };
  }
  const finalLocation = composeManifestStorageLocation(normalizedLoc, bucket);

  const pi = manifestRowToProductInfo(row);
  const conflictKey = manifestSaveConflictKey(pi);

  let existingProduct = await productLookupService.getProductByFnsku(pi.fnsku || pi.sku);
  if (!existingProduct && pi.lpn) {
    existingProduct = await productLookupService.getProductByLpn(pi.lpn);
  }
  let productId = existingProduct?.id || null;
  if (!productId) {
    try {
      const productData = {
        name: pi.name,
        sku: pi.fnsku || pi.sku,
        fnsku: pi.fnsku,
        asin: pi.asin,
        lpn: pi.lpn,
        upc: pi.upc,
        price: pi.price,
        category: pi.category || 'Uncategorized',
        description: pi.description || pi.name,
        image_url: pi.image_url || null,
        condition: condition || 'New',
        source: 'Manifest',
        created_at: new Date().toISOString(),
      };
      const saved = await productLookupService.saveProductToManifest(productData, { conflictKey });
      productId = saved?.id || null;
    } catch (e) {
      console.warn('Manifest: saveProductToManifest', e);
    }
  }

  const existingInventory = await inventoryService.getInventoryBySku(sku);
  const discountPct =
    parseFloat(typeof localStorage !== 'undefined' ? localStorage.getItem('labelDiscountPercent') : '') || 50;
  const costMult = (100 - discountPct) / 100;
  const priceNum = pi.price != null && !Number.isNaN(Number(pi.price)) ? Number(pi.price) : 0;
  const imageUrlForInventory = pi.image_url || '';

  const nextItemNumber =
    (existingInventory?.item_number ? existingInventory.item_number : null) ||
    getNextItemNumber(finalLocation);

  const inventoryItem = {
    sku,
    name: pi.name || 'Unknown Product',
    quantity: qty,
    location: finalLocation,
    condition: condition || 'New',
    price: priceNum,
    cost: priceNum * costMult,
    image_url: imageUrlForInventory,
    item_number: nextItemNumber,
  };
  if (productId) inventoryItem.product_id = productId;

  const result = await inventoryService.addOrUpdateInventory(inventoryItem);
  if (result) {
    return {
      ok: true,
      sku,
      finalLocation,
      wasUpdate: !!existingInventory,
    };
  }
  return { ok: false, sku, message: inventoryService.lastInventoryError || 'Could not save inventory.' };
}

export default function Manifests() {
  const { user } = useAuth();
  const { sessionKey } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState([]);
  const [manifestGroups, setManifestGroups] = useState([]);

  const [detailLoading, setDetailLoading] = useState(false);
  const [batchIds, setBatchIds] = useState([]);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterPriceMin, setFilterPriceMin] = useState('');
  const [filterPriceMax, setFilterPriceMax] = useState('');
  const [scanCode, setScanCode] = useState('');
  const [scanHit, setScanHit] = useState(null);
  const [scanPrintList, setScanPrintList] = useState([]);
  const scanPrintListRef = useRef([]);
  const [autoPrintBarcodeOnScan, setAutoPrintBarcodeOnScan] = useState(false);
  const scanInputRef = useRef(null);
  const [hiddenManifestKeys, setHiddenManifestKeys] = useState(() => new Set());
  const [invModalRow, setInvModalRow] = useState(null);
  const [invQty, setInvQty] = useState(1);
  const [invLocation, setInvLocation] = useState('');
  const [invBucket, setInvBucket] = useState('');
  const [invCondition, setInvCondition] = useState('New');
  const [invSubmitting, setInvSubmitting] = useState(false);
  const [bulkInventoryOpen, setBulkInventoryOpen] = useState(false);
  const [tablePageSize, setTablePageSize] = useState(100);
  const [tablePage, setTablePage] = useState(1);

  const scanListInventoryRows = useMemo(
    () => scanPrintList.filter((r) => inventorySkuFromManifestRow(r)),
    [scanPrintList]
  );

  useEffect(() => {
    scanPrintListRef.current = scanPrintList;
  }, [scanPrintList]);

  useEffect(() => {
    if (!user?.id) {
      setHiddenManifestKeys(new Set());
      return;
    }
    setHiddenManifestKeys(readHiddenManifestKeys(user.id));
  }, [user?.id]);

  const removeManifestFromTabOnly = useCallback(
    (manifestKey) => {
      if (!user?.id || !manifestKey) return;
      setHiddenManifestKeys((prev) => {
        const next = new Set(prev);
        next.add(manifestKey);
        writeHiddenManifestKeys(user.id, next);
        return next;
      });
      toast.success(
        'Removed from your Manifests tab. Your Supabase data (import history, products, manifest rows) was not deleted.'
      );
    },
    [user?.id]
  );

  const restoreManifestToTab = useCallback(
    (manifestKey) => {
      if (!user?.id || !manifestKey) return;
      setHiddenManifestKeys((prev) => {
        const next = new Set(prev);
        next.delete(manifestKey);
        writeHiddenManifestKeys(user.id, next);
        return next;
      });
      toast.info('Manifest is shown in this tab again.');
    },
    [user?.id]
  );

  const visibleManifestGroups = useMemo(
    () => manifestGroups.filter((g) => !hiddenManifestKeys.has(g.key)),
    [manifestGroups, hiddenManifestKeys]
  );

  const isCurrentManifestHidden = sessionKey ? hiddenManifestKeys.has(sessionKey) : false;

  const loadBatches = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('import_batches')
        .select(
          'id, import_session_id, file_name, created_at, rows_valid, manifest_rows_touched, chunk_index, status'
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(400);

      if (error) throw error;
      setBatches(data || []);
      setManifestGroups(groupBatchesIntoManifests(data || []));
    } catch (e) {
      console.error(e);
      toast.error('Could not load manifests. If this is new, run database migrations for import_batches.');
      setBatches([]);
      setManifestGroups([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  const activeGroup = useMemo(() => {
    if (!sessionKey) return null;
    return manifestGroups.find((g) => g.key === sessionKey) || null;
  }, [sessionKey, manifestGroups]);

  const loadItemsForGroup = useCallback(async (group) => {
    if (!group?.batchIds?.length) {
      setItems([]);
      setBatchIds([]);
      return;
    }
    setDetailLoading(true);
    setBatchIds(group.batchIds);
    setScanHit(null);
    setScanPrintList([]);
    setSearch('');
    setFilterCategory('');
    setFilterPriceMin('');
    setFilterPriceMax('');
    try {
      const all = [];
      const PAGE = 1000;
      for (const bid of group.batchIds) {
        let from = 0;
        for (;;) {
          const { data, error } = await supabase
            .from('import_batch_items')
            .select('id, import_batch_id, row_index, fnsku, asin, lpn, raw_row')
            .eq('import_batch_id', bid)
            .order('row_index', { ascending: true })
            .range(from, from + PAGE - 1);
          if (error) throw error;
          const chunk = data || [];
          all.push(...chunk);
          if (chunk.length < PAGE) break;
          from += PAGE;
        }
      }
      all.sort((a, b) => (a.row_index ?? 0) - (b.row_index ?? 0));
      setItems(all);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load manifest lines.');
      setItems([]);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionKey && activeGroup) {
      loadItemsForGroup(activeGroup);
    } else {
      setItems([]);
      setBatchIds([]);
    }
  }, [sessionKey, activeGroup, loadItemsForGroup]);

  const categoryOptions = useMemo(() => {
    const set = new Set();
    for (const row of items) {
      const c = rawCategory(row);
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [items]);

  const filteredItems = useMemo(() => {
    const minBound = filterPriceMin.trim() !== '' ? parseManifestPrice(filterPriceMin) : null;
    const maxBound = filterPriceMax.trim() !== '' ? parseManifestPrice(filterPriceMax) : null;
    const hasMin = minBound != null;
    const hasMax = maxBound != null;

    return items.filter((row) => {
      if (filterCategory) {
        if (rawCategory(row) !== filterCategory) return false;
      }
      if (hasMin || hasMax) {
        const n = parseManifestPrice(rawPriceField(row));
        if (n == null) return false;
        if (hasMin && n < minBound) return false;
        if (hasMax && n > maxBound) return false;
      }
      const blob = rowSearchBlobLower(row);
      return matchesManifestKeywordSearch(blob, search);
    });
  }, [items, search, filterCategory, filterPriceMin, filterPriceMax]);

  const manifestTableTotalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredItems.length / tablePageSize)),
    [filteredItems.length, tablePageSize]
  );

  const paginatedTableRows = useMemo(() => {
    const start = (tablePage - 1) * tablePageSize;
    return filteredItems.slice(start, start + tablePageSize);
  }, [filteredItems, tablePage, tablePageSize]);

  const manifestPaginationSlots = useMemo(
    () => getManifestPaginationSlots(tablePage, manifestTableTotalPages),
    [tablePage, manifestTableTotalPages]
  );

  const tableRangeStart = filteredItems.length === 0 ? 0 : (tablePage - 1) * tablePageSize + 1;
  const tableRangeEnd = filteredItems.length === 0 ? 0 : Math.min(tablePage * tablePageSize, filteredItems.length);

  const manifestPagerResetSig = `${sessionKey}|${search}|${filterCategory}|${filterPriceMin}|${filterPriceMax}`;
  const prevManifestPagerResetSig = useRef('');

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredItems.length / tablePageSize));
    if (prevManifestPagerResetSig.current !== manifestPagerResetSig) {
      prevManifestPagerResetSig.current = manifestPagerResetSig;
      setTablePage(1);
      return;
    }
    setTablePage((p) => Math.min(Math.max(1, p), totalPages));
  }, [manifestPagerResetSig, filteredItems.length, tablePageSize]);

  const clearTableFilters = () => {
    setSearch('');
    setFilterCategory('');
    setFilterPriceMin('');
    setFilterPriceMax('');
  };

  const printManifestRowLabel = useCallback(
    (row) => {
      const v = labelBarcodeValue(row);
      if (!v) {
        toast.warning('No ASIN/FNSKU/LPN to print on this row.');
        return;
      }
      const ok = triggerManifestBarcodePrintWindow([row], {
        title: `${displayName(row)} · label`,
        labelType: 'barcode',
        includeAmazonQr: true,
        barcodeFormat: 'auto',
      });
      if (!ok) toast.error('Pop-up blocked. Allow pop-ups to print labels.');
    },
    []
  );

  const openManifestInventoryModal = useCallback(
    (row) => {
      if (!user?.id) {
        toast.error('Sign in to add inventory.');
        return;
      }
      const sku = inventorySkuFromManifestRow(row);
      if (!sku) {
        toast.warning('This row needs an FNSKU, merchant SKU, ASIN, or LPN to use as the inventory SKU.');
        return;
      }
      const opts = getLocationOptions(getWarehouseLayoutSettings());
      if (!opts.length) {
        toast.error('No shelf locations are configured. Set them in Settings → Warehouse layout.');
        return;
      }
      setInvModalRow(row);
      setBulkInventoryOpen(false);
      setInvQty(1);
      setInvLocation(opts[0] || '');
      setInvBucket('');
      setInvCondition('New');
    },
    [user?.id]
  );

  const closeManifestInventoryModal = useCallback(() => {
    if (invSubmitting) return;
    setInvModalRow(null);
    setBulkInventoryOpen(false);
  }, [invSubmitting]);

  const openBulkScanListInventoryModal = useCallback(() => {
    if (!user?.id) {
      toast.error('Sign in to add inventory.');
      return;
    }
    if (!scanListInventoryRows.length) {
      toast.warning('No scanned rows have an inventory SKU (FNSKU, merchant SKU, ASIN, or LPN).');
      return;
    }
    const opts = getLocationOptions(getWarehouseLayoutSettings());
    if (!opts.length) {
      toast.error('No shelf locations are configured. Set them in Settings → Warehouse layout.');
      return;
    }
    setInvModalRow(null);
    setBulkInventoryOpen(true);
    setInvQty(1);
    setInvLocation(opts[0] || '');
    setInvBucket('');
    setInvCondition('New');
  }, [user?.id, scanListInventoryRows]);

  const submitManifestInventory = useCallback(async () => {
    const rows = bulkInventoryOpen ? scanListInventoryRows : invModalRow ? [invModalRow] : [];
    if (!rows.length) {
      toast.warning('Nothing to add.');
      return;
    }
    const qty = parseInt(String(invQty), 10);
    if (!qty || qty < 1) {
      toast.warning('Enter a quantity of at least 1.');
      return;
    }
    const layout = getWarehouseLayoutSettings();
    const normalizedLoc = String(invLocation || '').trim().toUpperCase();
    if (!normalizedLoc || !isValidLocationCode(normalizedLoc, layout)) {
      toast.error('Choose a valid shelf/row location from your warehouse layout.');
      return;
    }

    setInvSubmitting(true);
    try {
      if (rows.length === 1) {
        const r = await persistManifestRowToInventory(rows[0], {
          quantity: qty,
          location: invLocation,
          bucket: invBucket,
          condition: invCondition,
        });
        if (r.ok) {
          toast.success(
            r.wasUpdate
              ? `Updated stock for ${r.sku} (+${qty}) at ${formatLocationDisplayForUi(r.finalLocation)}.`
              : `Added ${qty} to inventory at ${formatLocationDisplayForUi(r.finalLocation)}.`
          );
          setInvModalRow(null);
          setBulkInventoryOpen(false);
        } else {
          toast.error(r.message || 'Could not save inventory.');
        }
      } else {
        let ok = 0;
        let fail = 0;
        const failedLines = [];
        for (const row of rows) {
          const r = await persistManifestRowToInventory(row, {
            quantity: qty,
            location: invLocation,
            bucket: invBucket,
            condition: invCondition,
          });
          if (r.ok) ok += 1;
          else {
            fail += 1;
            failedLines.push(r.sku ? `${r.sku}: ${r.message || 'failed'}` : (r.message || 'failed'));
          }
        }
        const locDisp = formatLocationDisplayForUi(composeManifestStorageLocation(normalizedLoc, invBucket));
        if (ok) {
          toast.success(`Added ${ok} scanned line(s) to inventory at ${locDisp} (${qty} each).`);
        }
        if (fail) {
          toast.warning(
            `${fail} line(s) could not be saved.${failedLines.length ? ` First errors: ${failedLines.slice(0, 3).join('; ')}` : ''}`
          );
        }
        setInvModalRow(null);
        setBulkInventoryOpen(false);
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to add inventory.');
    } finally {
      setInvSubmitting(false);
    }
  }, [
    bulkInventoryOpen,
    invModalRow,
    scanListInventoryRows,
    invQty,
    invLocation,
    invBucket,
    invCondition,
  ]);

  const removeScanPrintRow = useCallback((id) => {
    setScanPrintList((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const clearScanPrintList = useCallback(() => {
    setScanPrintList([]);
    toast.info('Scan list cleared.');
  }, []);

  const runScanLookup = useCallback(async () => {
    const code = scanCode.trim();
    if (!code) {
      toast.warning('Enter or scan a code (LPN, FNSKU, or ASIN).');
      return;
    }

    const applyFound = (found) => {
      setScanHit(found);
      const existed = scanPrintListRef.current.some((r) => r.id === found.id);
      if (!existed) {
        setScanPrintList((prev) => [...prev, found]);
        toast.success('Added to scan list.');
        if (autoPrintBarcodeOnScan) {
          const v = labelBarcodeValue(found);
          if (v) {
            const ok = triggerManifestBarcodePrintWindow([found], {
              title: `${displayName(found)} · label`,
              labelType: 'barcode',
              includeAmazonQr: true,
              barcodeFormat: 'auto',
            });
            if (!ok) toast.error('Pop-up blocked. Allow pop-ups to auto-print barcodes.');
          } else {
            toast.warning('No ASIN/FNSKU/LPN to print on this row.');
          }
        }
      } else {
        toast.info('Already in scan list.');
      }
      setScanCode('');
      queueMicrotask(() => scanInputRef.current?.focus());
    };

    const local = findManifestRowByScanCodeInItems(items, code);
    if (local) {
      applyFound(local);
      return;
    }
    if (!batchIds.length) {
      setScanHit(null);
      toast.info('Not found in this manifest. Try Scanner for full database lookup.');
      return;
    }
    const tryVals = Array.from(
      new Set([
        code,
        code.toUpperCase(),
        code.toLowerCase(),
        code.replace(/[^A-Za-z0-9]/g, ''),
        code.toUpperCase().replace(/[^A-Z0-9]/g, ''),
      ].filter((v) => v && v.length <= 80))
    );
    if (!tryVals.length) {
      toast.error('Enter a valid scan code.');
      return;
    }
    try {
      let found = null;
      outer: for (const val of tryVals) {
        for (const col of ['lpn', 'fnsku', 'asin']) {
          const { data, error } = await supabase
            .from('import_batch_items')
            .select('id, import_batch_id, row_index, fnsku, asin, lpn, raw_row')
            .in('import_batch_id', batchIds)
            .eq(col, val)
            .limit(1);
          if (error) throw error;
          if (data?.length) {
            found = data[0];
            break outer;
          }
        }
      }
      if (found) {
        applyFound(found);
      } else {
        setScanHit(null);
        toast.info('Not found in this manifest. Try Scanner for full database lookup.');
      }
    } catch (e) {
      console.error(e);
      toast.error('Lookup failed.');
    }
  }, [items, batchIds, scanCode, autoPrintBarcodeOnScan]);

  if (sessionKey && loading) {
    return (
      <div className="container mx-auto px-4 py-16 text-center text-gray-500">Loading manifest…</div>
    );
  }

  if (sessionKey && !activeGroup && !loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Button variant="secondary" onClick={() => navigate('/manifests')} className="mb-4">
          <ArrowLeftIcon className="h-4 w-4 mr-2" />
          All manifests
        </Button>
        <Card>
          <p className="p-6 text-gray-600 dark:text-gray-400">Manifest not found or was removed.</p>
        </Card>
      </div>
    );
  }

  if (!sessionKey) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="flex items-center gap-3 mb-6">
          <ClipboardDocumentListIcon className="h-9 w-9 text-indigo-600 dark:text-indigo-400" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Manifests</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Each upload from Product Import is listed here. Open a manifest to search, print labels, or look up a
              scanned code within that file. Use <strong>Remove from tab</strong> to hide an entry from this list only —
              nothing is deleted from Supabase.
            </p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-3">
          <Link to="/product-import">
            <Button variant="secondary">Upload new manifest</Button>
          </Link>
          <Link to="/scanner">
            <Button variant="secondary">
              <QrCodeIcon className="h-5 w-5 mr-2 inline" />
              Open scanner (all sources)
            </Button>
          </Link>
        </div>

        <Card>
          {loading ? (
            <p className="p-6 text-gray-500">Loading…</p>
          ) : manifestGroups.length === 0 ? (
            <div className="p-6">
              <p className="text-gray-700 dark:text-gray-300 mb-2">No import history yet.</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                After you import a CSV on Product Import, batches appear here grouped by upload session.
              </p>
            </div>
          ) : visibleManifestGroups.length === 0 ? (
            <div className="p-6">
              <p className="text-gray-700 dark:text-gray-300 mb-2">All manifests are hidden from this tab.</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                Remove from tab only hides entries in your browser; your database is unchanged.
              </p>
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  if (!user?.id) return;
                  setHiddenManifestKeys(new Set());
                  writeHiddenManifestKeys(user.id, new Set());
                  toast.success('All manifests are visible in this tab again.');
                }}
              >
                Show all manifests again
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {visibleManifestGroups.map((g) => (
                <li key={g.key} className="flex items-stretch gap-0">
                  <Link
                    to={`/manifests/${encodeURIComponent(g.key)}`}
                    className="flex flex-1 flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/60 min-w-0"
                  >
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">
                        {g.fileNames[0] || 'Manifest upload'}
                        {g.fileNames.length > 1 && (
                          <span className="text-gray-500 font-normal"> +{g.fileNames.length - 1} file(s)</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {g.createdAt ? new Date(g.createdAt).toLocaleString() : ''}
                        {g.chunks > 1 && ` · ${g.chunks} chunks`}
                      </div>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-300 sm:text-right shrink-0">
                      {g.rowsValid > 0 && <span>{g.rowsValid} rows imported</span>}
                      {g.manifestRows > 0 && (
                        <span className="ml-2">· {g.manifestRows} manifest lines</span>
                      )}
                    </div>
                  </Link>
                  <div className="flex items-center pr-2 sm:pr-4 border-l border-gray-200 dark:border-gray-700">
                    <button
                      type="button"
                      title="Remove from this tab only (does not delete from Supabase)"
                      onClick={() => removeManifestFromTabOnly(g.key)}
                      className="p-2 rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <Button variant="secondary" onClick={() => navigate('/manifests')} className="mb-4">
        <ArrowLeftIcon className="h-4 w-4 mr-2" />
        All manifests
      </Button>

      <div className="mb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {activeGroup?.fileNames?.[0] || 'Manifest'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {activeGroup?.createdAt && new Date(activeGroup.createdAt).toLocaleString()}
            {activeGroup?.sessionId && (
              <span className="ml-2 font-mono text-xs">session {activeGroup.sessionId.slice(0, 8)}…</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {isCurrentManifestHidden ? (
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                restoreManifestToTab(sessionKey);
              }}
            >
              Show in tab again
            </Button>
          ) : (
            <Button
              variant="danger"
              type="button"
              onClick={() => {
                if (!sessionKey) return;
                removeManifestFromTabOnly(sessionKey);
                navigate('/manifests');
              }}
            >
              <TrashIcon className="h-5 w-5 mr-2 inline" />
              Remove from tab
            </Button>
          )}
        </div>
      </div>

      {isCurrentManifestHidden && (
        <div className="mb-4 p-3 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 text-sm text-amber-900 dark:text-amber-200">
          This manifest is hidden from your Manifests list. Your data in Supabase is unchanged. Use &quot;Show in tab
          again&quot; to bring it back to the list.
        </div>
      )}

      <div className="mb-6">
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
            <MagnifyingGlassIcon className="h-5 w-5" />
            Scan in this manifest
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Each successful scan is <strong>added to the scan list</strong> and the field clears for the next code. Use{' '}
            <strong>Print label</strong> or <strong>Add to inventory</strong> on the match below (or on each scan-list row).
            Turn on <strong>Auto-print on scan</strong> to open the print window automatically after each find.
          </p>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Button
              type="button"
              variant={autoPrintBarcodeOnScan ? 'primary' : 'secondary'}
              onClick={() => setAutoPrintBarcodeOnScan((v) => !v)}
            >
              <PrinterIcon className="h-5 w-5 mr-2 inline" />
              {autoPrintBarcodeOnScan ? 'Auto-print on scan: ON' : 'Auto-print on scan: OFF'}
            </Button>
            {autoPrintBarcodeOnScan && (
              <span className="text-[11px] text-amber-800 dark:text-amber-200 max-w-md">
                Browser may block repeated print windows — allow pop-ups for this site.
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={scanInputRef}
              className="flex-1 min-w-[12rem] rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
              placeholder="Scan or enter code…"
              value={scanCode}
              onChange={(e) => setScanCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runScanLookup()}
            />
            <Button type="button" onClick={runScanLookup}>
              Find
            </Button>
          </div>
          {scanHit && (
            <div className="mt-4 p-3 rounded-lg bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900">
              <div className="flex flex-wrap items-start gap-2 justify-between">
                <div className="font-medium text-gray-900 dark:text-white min-w-0 flex-1">{displayName(scanHit)}</div>
                {rowAsin(scanHit) ? (
                  <a
                    href={amazonProductUrl(rowAsin(scanHit))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 inline-flex items-center gap-0.5 rounded-md border border-amber-300/80 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-950 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-100 dark:hover:bg-amber-900/80"
                    title={`Open ASIN ${rowAsin(scanHit)} on Amazon (new tab)`}
                  >
                    Amazon
                    <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 opacity-80" aria-hidden />
                  </a>
                ) : (
                  <span
                    className="shrink-0 text-[10px] text-gray-500 dark:text-gray-400 px-1.5 py-0.5"
                    title="No ASIN on this row"
                  >
                    —
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">{displayMeta(scanHit)}</div>
              <div className="text-xs font-mono mt-2">Barcode: {labelBarcodeValue(scanHit) || '—'}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!labelBarcodeValue(scanHit)}
                  onClick={() => printManifestRowLabel(scanHit)}
                  title={
                    labelBarcodeValue(scanHit)
                      ? 'Print 2×1in Zebra label (barcode + Amazon QR when ASIN exists)'
                      : 'No ASIN/FNSKU/LPN for barcode'
                  }
                >
                  <PrinterIcon className="h-4 w-4 mr-1 inline" aria-hidden />
                  <QrCodeIcon className="h-4 w-4 mr-1 inline text-gray-600 dark:text-gray-300" aria-hidden />
                  Print label
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!inventorySkuFromManifestRow(scanHit)}
                  onClick={() => openManifestInventoryModal(scanHit)}
                  title={
                    inventorySkuFromManifestRow(scanHit)
                      ? 'Add this line to inventory (choose shelf / bucket)'
                      : 'Need FNSKU, merchant SKU, ASIN, or LPN'
                  }
                >
                  <ShoppingBagIcon className="h-4 w-4 mr-1 inline" aria-hidden />
                  Add to inventory
                </Button>
              </div>
            </div>
          )}
          <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-3">
            <div className="flex flex-wrap items-center justify-end gap-2 mb-2">
              <h3 className="text-xs font-semibold text-gray-800 dark:text-gray-200 mr-auto">
                Scan list ({scanPrintList.length})
              </h3>
              <Button
                variant="secondary"
                type="button"
                size="sm"
                onClick={openBulkScanListInventoryModal}
                disabled={!scanListInventoryRows.length}
                title="Add every scanned line that has an inventory SKU, using one shelf/bucket for all"
              >
                <ShoppingBagIcon className="h-4 w-4 mr-1 inline" aria-hidden />
                Add all ({scanListInventoryRows.length})
              </Button>
              <Button variant="secondary" type="button" size="sm" onClick={clearScanPrintList} disabled={!scanPrintList.length}>
                Clear list
              </Button>
            </div>
            {scanPrintList.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">No items yet — find rows and add them here.</p>
            ) : (
              <ul className="max-h-40 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 text-xs">
                {scanPrintList.map((row) => (
                  <li key={row.id} className="flex items-center gap-2 px-2 py-1.5 bg-white dark:bg-gray-900">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-gray-900 dark:text-white block truncate">{displayName(row)}</span>
                      <span className="text-gray-500 font-mono">{labelBarcodeValue(row) || '—'}</span>
                    </span>
                    <div className="shrink-0 flex items-center gap-1">
                      {rowAsin(row) ? (
                        <a
                          href={amazonProductUrl(rowAsin(row))}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 rounded-md border border-amber-300/80 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-950 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-100 dark:hover:bg-amber-900/80"
                          title={`Open on Amazon`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          Amazon
                          <ArrowTopRightOnSquareIcon className="h-3 w-3 opacity-80 shrink-0" aria-hidden />
                        </a>
                      ) : null}
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        className="p-1.5 rounded text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-35 disabled:pointer-events-none"
                        title="Print label"
                        disabled={!labelBarcodeValue(row)}
                        onClick={() => printManifestRowLabel(row)}
                      >
                        <PrinterIcon className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="p-1.5 rounded text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 disabled:opacity-35 disabled:pointer-events-none"
                        title="Add to inventory"
                        disabled={!inventorySkuFromManifestRow(row)}
                        onClick={() => openManifestInventoryModal(row)}
                      >
                        <ShoppingBagIcon className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="p-1.5 rounded text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                        title="Remove from list"
                        onClick={() => removeScanPrintRow(row.id)}
                      >
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-4 mb-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative flex-1 min-w-[12rem]">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Search items (name, SKU, ASIN, category…)
              </label>
              <div className="relative">
                <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  className="w-full pl-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                  placeholder="e.g. camera or camera, car"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="shrink-0 min-w-[11rem] max-w-full sm:min-w-[180px]">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Category</label>
              <select
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
              >
                <option value="">All categories</option>
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Min price</label>
              <input
                type="text"
                inputMode="decimal"
                className="w-28 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                placeholder="Min"
                value={filterPriceMin}
                onChange={(e) => setFilterPriceMin(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Max price</label>
              <input
                type="text"
                inputMode="decimal"
                className="w-28 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                placeholder="Max"
                value={filterPriceMax}
                onChange={(e) => setFilterPriceMax(e.target.value)}
              />
            </div>
            <Button variant="secondary" type="button" onClick={clearTableFilters} className="shrink-0">
              Clear filters
            </Button>
          </div>
        </div>

        {detailLoading ? (
          <p className="text-gray-500 py-8 text-center">Loading lines…</p>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3 mb-3 text-xs text-gray-600 dark:text-gray-400">
              <div>
                <span className="font-medium text-gray-800 dark:text-gray-200">
                  {filteredItems.length === 0
                    ? 'No matching rows'
                    : `Rows ${tableRangeStart}–${tableRangeEnd} of ${filteredItems.length} matching`}
                </span>
                {filteredItems.length !== items.length && items.length > 0 && (
                  <span className="text-gray-500"> ({items.length} in manifest)</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 whitespace-nowrap">
                  <span className="text-gray-500 dark:text-gray-400">Per page</span>
                  <select
                    className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm"
                    value={tablePageSize}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (MANIFEST_PAGE_SIZE_OPTIONS.includes(v)) setTablePageSize(v);
                    }}
                  >
                    {MANIFEST_PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  Page {tablePage} of {manifestTableTotalPages}
                </span>
              </div>
            </div>
            <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg max-h-[min(75vh,900px)] overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 shadow-sm">
                  <tr>
                    <th className="text-left px-3 py-2">Product</th>
                    <th className="text-right px-3 py-2 whitespace-nowrap w-[1%]" scope="col">
                      Label
                    </th>
                    <th className="text-right px-3 py-2 whitespace-nowrap w-[1%]" scope="col">
                      Inventory
                    </th>
                    <th className="text-left px-3 py-2">Category</th>
                    <th className="text-right px-3 py-2 whitespace-nowrap">Price</th>
                    <th className="text-left px-3 py-2">LPN</th>
                    <th className="text-left px-3 py-2">FNSKU</th>
                    <th className="text-left px-3 py-2">ASIN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
                  {paginatedTableRows.map((row) => {
                    const r = row.raw_row || {};
                    const asin = rowAsin(row);
                    return (
                      <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-3 py-2 max-w-md align-top" title={displayName(row)}>
                          <div className="flex flex-wrap items-start gap-2">
                            <span className="line-clamp-2 min-w-0 flex-1">{displayName(row)}</span>
                            {asin ? (
                              <a
                                href={amazonProductUrl(asin)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0 inline-flex items-center gap-0.5 rounded-md border border-amber-300/80 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-950 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-100 dark:hover:bg-amber-900/80"
                                title={`Open ASIN ${asin} on Amazon (new tab)`}
                              >
                                Amazon
                                <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 opacity-80" aria-hidden />
                              </a>
                            ) : (
                              <span
                                className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500 px-1.5 py-0.5"
                                title="No ASIN on this row"
                              >
                                —
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => printManifestRowLabel(row)}
                            disabled={!labelBarcodeValue(row)}
                            title={
                              labelBarcodeValue(row)
                                ? 'Print 2×1in label: barcode + Amazon QR when ASIN exists'
                                : 'No ASIN/FNSKU/LPN to encode'
                            }
                            className="inline-flex items-center gap-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-xs font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:pointer-events-none"
                          >
                            <PrinterIcon className="h-4 w-4 shrink-0" aria-hidden />
                            <QrCodeIcon className="h-4 w-4 shrink-0 text-gray-600 dark:text-gray-300" aria-hidden />
                          </button>
                        </td>
                        <td className="px-3 py-2 align-top text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openManifestInventoryModal(row)}
                            disabled={!inventorySkuFromManifestRow(row)}
                            title={
                              inventorySkuFromManifestRow(row)
                                ? 'Add to inventory — choose shelf/row and optional bucket'
                                : 'Need FNSKU, merchant SKU, ASIN, or LPN'
                            }
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1.5 text-xs font-medium text-emerald-900 dark:text-emerald-100 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 disabled:opacity-40 disabled:pointer-events-none"
                          >
                            <ShoppingBagIcon className="h-4 w-4 shrink-0" aria-hidden />
                            Add
                          </button>
                        </td>
                        <td className="px-3 py-2 max-w-[10rem] align-top text-gray-700 dark:text-gray-300" title={rawCategory(row)}>
                          {rawCategory(row) || '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs align-top whitespace-nowrap">
                          {displayPriceCell(row)}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs align-top">{row.lpn || r.lpn || '—'}</td>
                        <td className="px-3 py-2 font-mono text-xs align-top">{row.fnsku || r.fnsku || '—'}</td>
                        <td className="px-3 py-2 font-mono text-xs align-top">{row.asin || r.asin || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {manifestTableTotalPages > 1 && (
              <nav
                className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                aria-label="Manifest table pages"
              >
                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    variant="secondary"
                    type="button"
                    size="sm"
                    disabled={tablePage <= 1}
                    onClick={() => setTablePage(1)}
                    className="!px-2"
                  >
                    First
                  </Button>
                  <Button
                    variant="secondary"
                    type="button"
                    size="sm"
                    disabled={tablePage <= 1}
                    onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                    className="!px-2"
                    aria-label="Previous page"
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                  </Button>
                  {manifestPaginationSlots.map((slot) =>
                    slot.type === 'ellipsis' ? (
                      <span key={slot.key} className="px-1 text-gray-400 select-none">
                        …
                      </span>
                    ) : (
                      <button
                        key={slot.key}
                        type="button"
                        onClick={() => setTablePage(slot.n)}
                        className={`min-w-[2.25rem] rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                          tablePage === slot.n
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        {slot.n}
                      </button>
                    )
                  )}
                  <Button
                    variant="secondary"
                    type="button"
                    size="sm"
                    disabled={tablePage >= manifestTableTotalPages}
                    onClick={() => setTablePage((p) => Math.min(manifestTableTotalPages, p + 1))}
                    className="!px-2"
                    aria-label="Next page"
                  >
                    <ChevronRightIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    type="button"
                    size="sm"
                    disabled={tablePage >= manifestTableTotalPages}
                    onClick={() => setTablePage(manifestTableTotalPages)}
                    className="!px-2"
                  >
                    Last
                  </Button>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 sm:text-right">
                  Only this page of rows is rendered for speed. Use the per-page control or filters to narrow results.
                </p>
              </nav>
            )}
          </>
        )}
      </Card>

      {(invModalRow || bulkInventoryOpen) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manifest-inv-modal-title"
          >
            <div className="flex justify-between items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h2 id="manifest-inv-modal-title" className="text-lg font-semibold text-gray-900 dark:text-white">
                {bulkInventoryOpen ? `Add scan list (${scanListInventoryRows.length})` : 'Add to inventory'}
              </h2>
              <button
                type="button"
                onClick={closeManifestInventoryModal}
                className="p-1 rounded-md text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                disabled={invSubmitting}
                aria-label="Close"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {bulkInventoryOpen ? (
                <div className="p-3 rounded-md bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {scanListInventoryRows.length} scanned line(s) ready for inventory
                  </p>
                  {scanPrintList.length > scanListInventoryRows.length ? (
                    <p className="text-xs text-amber-800 dark:text-amber-200 mt-1">
                      {scanPrintList.length - scanListInventoryRows.length} other line(s) have no SKU and are skipped.
                    </p>
                  ) : null}
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    The same quantity, shelf/row, bucket, and condition below applies to each line.
                  </p>
                </div>
              ) : (
                <div className="p-3 rounded-md bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700">
                  <p className="text-sm font-medium text-gray-900 dark:text-white line-clamp-3">
                    {displayName(invModalRow)}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 font-mono">
                    SKU: {inventorySkuFromManifestRow(invModalRow)}
                    {rowAsin(invModalRow) && ` · ASIN: ${rowAsin(invModalRow)}`}
                  </p>
                </div>
              )}

              <div>
                <label htmlFor="manifest-inv-qty" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Quantity {bulkInventoryOpen ? '(per line)' : ''}
                </label>
                <input
                  id="manifest-inv-qty"
                  type="number"
                  min={1}
                  value={invQty}
                  onChange={(e) => setInvQty(parseInt(e.target.value, 10) || 1)}
                  disabled={invSubmitting}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="manifest-inv-loc" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Shelf / row (location code)
                </label>
                <select
                  id="manifest-inv-loc"
                  value={invLocation}
                  onChange={(e) => setInvLocation(e.target.value)}
                  disabled={invSubmitting}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                >
                  {getLocationOptions(getWarehouseLayoutSettings()).map((code) => (
                    <option key={code} value={code}>
                      {formatLocationDisplayForUi(code)}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  Codes come from your warehouse layout.{' '}
                  <Link to="/settings" className="text-indigo-600 dark:text-indigo-400 underline">
                    Open settings
                  </Link>
                  .
                </p>
              </div>

              <div>
                <label htmlFor="manifest-inv-bucket" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Bucket (optional)
                </label>
                <input
                  id="manifest-inv-bucket"
                  type="text"
                  value={invBucket}
                  onChange={(e) => setInvBucket(normalizeBucketCode(e.target.value))}
                  placeholder="e.g. BK1"
                  disabled={invSubmitting}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-mono uppercase"
                />
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  Appended to the location as an extra segment (same as Scanner).
                </p>
              </div>

              <div>
                <label htmlFor="manifest-inv-cond" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Condition
                </label>
                <select
                  id="manifest-inv-cond"
                  value={invCondition}
                  onChange={(e) => setInvCondition(e.target.value)}
                  disabled={invSubmitting}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                >
                  <option value="New">New</option>
                  <option value="Refurbished">Refurbished</option>
                  <option value="Used">Used</option>
                </select>
              </div>

              <p className="text-xs text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/50 rounded-md p-2">
                {bulkInventoryOpen
                  ? 'Each SKU is added or merged like a single add. Failures are reported without stopping the rest.'
                  : 'If this SKU already exists in inventory, the quantity is added and the row is shown in the list again.'}
              </p>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="secondary" type="button" onClick={closeManifestInventoryModal} disabled={invSubmitting}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="success"
                  onClick={submitManifestInventory}
                  disabled={invSubmitting || !invLocation}
                >
                  {invSubmitting ? 'Saving…' : bulkInventoryOpen ? `Add all (${scanListInventoryRows.length})` : 'Add to inventory'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
