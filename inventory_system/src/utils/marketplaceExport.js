/**
 * Marketplace export: normalize inventory/manifest products and export as
 * Facebook, Shopify, Whatnot, or Universal CSV/XLSX for bulk upload.
 */

import * as XLSX from 'xlsx';
import JSZip from 'jszip';

const UTF8_BOM = '\uFEFF';

/** Turn API image entries (string or { link, url, src }) into a fetchable URL string. */
export function coalesceMediaUrl(entry) {
  if (entry == null) return '';
  if (typeof entry === 'string') return entry.trim();
  if (typeof entry === 'object') {
    const u = entry.link ?? entry.url ?? entry.src ?? entry.href;
    if (typeof u === 'string') return u.trim();
  }
  return '';
}

/** Dedupe URLs that differ only by query string (e.g. Amazon resize params). */
function mediaUrlDedupeKey(url) {
  const s = coalesceMediaUrl(url);
  if (!s) return '';
  try {
    const u = new URL(s);
    return `${u.origin}${u.pathname}`.toLowerCase();
  } catch {
    return s.replace(/\?.*$/, '').toLowerCase();
  }
}

/**
 * Expand one stored field (plain URL, JSON array, or { images, videos }) into URL strings.
 * @param {unknown} value
 * @returns {string[]}
 */
export function expandMediaValueToUrls(value) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) {
    return value.flatMap((v) => expandMediaValueToUrls(v)).map(coalesceMediaUrl).filter(Boolean);
  }
  if (typeof value === 'object') {
    const imgs = Array.isArray(value.images) ? value.images : [];
    const vids = Array.isArray(value.videos) ? value.videos : [];
    return [...imgs, ...vids].map(coalesceMediaUrl).filter(Boolean);
  }
  if (typeof value !== 'string') {
    const one = coalesceMediaUrl(value);
    return one ? [one] : [];
  }
  const t = value.trim();
  if (!t) return [];
  if (t.startsWith('{')) {
    try {
      const obj = JSON.parse(t);
      return expandMediaValueToUrls(obj);
    } catch {
      const one = coalesceMediaUrl(t);
      return one ? [one] : [];
    }
  }
  if (t.startsWith('[')) {
    try {
      const arr = JSON.parse(t);
      return expandMediaValueToUrls(Array.isArray(arr) ? arr : [t]);
    } catch {
      const one = coalesceMediaUrl(t);
      return one ? [one] : [];
    }
  }
  const one = coalesceMediaUrl(t);
  return one ? [one] : [];
}

/**
 * Collect every image/video URL from an Inventory row (merged inventory + manifest + raw DB).
 * Merges top-level fields with _rawData so Scanner multi-image JSON is not lost when manifest adds a single URL.
 * @param {Object} item
 * @returns {string[]}
 */
export function collectProductMediaUrls(item) {
  if (!item || typeof item !== 'object') return [];
  const chunks = [];
  const add = (v) => {
    if (v == null || v === '') return;
    chunks.push(v);
  };
  add(item.image_url);
  add(item['Image URL']);
  if (Array.isArray(item.images)) {
    for (const x of item.images) add(x);
  }
  const raw = item._rawData;
  if (raw && typeof raw === 'object') {
    add(raw.image_url);
    if (Array.isArray(raw.images)) {
      for (const x of raw.images) add(x);
    }
  }

  const seen = new Set();
  const out = [];
  for (const chunk of chunks) {
    for (const u of expandMediaValueToUrls(chunk)) {
      const key = mediaUrlDedupeKey(u);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(u);
    }
  }
  return out;
}

/**
 * Normalize a product row from Inventory page (inventory + manifest shape) to canonical fields.
 * @param {Object} item - Row from combined products list (Description, Fn Sku, B00 Asin, MSRP, etc.)
 * @returns {Object} Canonical row: id, title, description, sku, asin, fnsku, upc, price, quantity, category, condition, availability, image_url, brand, location, images
 */
export function normalizeProductRow(item) {
  const title = (item.name ?? item.title ?? item['Description'] ?? '').trim() || 'Untitled Product';
  const description = (item.description ?? item['Description'] ?? item.name ?? title).trim();
  const fnsku = (item['Fn Sku'] ?? item.fnsku ?? item.sku ?? '').trim();
  const asin = (item['B00 Asin'] ?? item.asin ?? '').trim();
  const lpn = (item['X-Z ASIN'] ?? item.lpn ?? '').trim();
  const quantity = typeof item.Quantity === 'number' ? item.Quantity : (item.quantity != null ? Number(item.quantity) : 0);
  const priceNum = typeof item.MSRP === 'number' ? item.MSRP : (item.price != null ? parseFloat(item.price) : 0);
  const price = Number.isFinite(priceNum) ? priceNum : 0;
  const category = (item.Category ?? item.category ?? '').trim() || 'Uncategorized';
  const rawCondition = (item._rawData?.condition ?? item.condition ?? '').toString().toLowerCase();
  const location = (item.Location ?? item.location ?? '').trim() || '';

  // Facebook/commerce condition: new, refurbished, used
  let condition = 'new';
  if (rawCondition.includes('refurb') || rawCondition === 'refurbished') condition = 'refurbished';
  else if (rawCondition.includes('used') || rawCondition === 'used') condition = 'used';

  const availability = quantity > 0 ? 'in stock' : 'out of stock';

  // Unique id for catalogs (prefer sku/fnsku/asin)
  const id = (fnsku || asin || lpn || item.id || '').toString().trim() || `row-${Math.random().toString(36).slice(2, 11)}`;

  const images = collectProductMediaUrls(item);

  return {
    id,
    title: title.slice(0, 200), // Facebook max 200
    description,
    sku: fnsku || asin || id,
    asin,
    fnsku,
    upc: (item.UPC ?? item.upc ?? '').trim(),
    price,
    quantity,
    category,
    condition,
    availability,
    image_url: coalesceMediaUrl(images[0]) || '',
    images: images.map(coalesceMediaUrl).filter(Boolean),
    brand: (item.brand ?? '').trim() || '',
    location,
  };
}

/** Max number of image/video columns to emit in CSV (platform-specific exports can use more) */
const MAX_MEDIA_COLUMNS = 24;

/**
 * Convert array of Inventory page products to canonical rows (no async enrichment).
 * @param {Array<Object>} products - Combined products from Inventory page
 * @returns {Array<Object>} Canonical rows
 */
export function exportProductRows(products) {
  return (products || []).map(normalizeProductRow);
}

function escapeCsvCell(value) {
  if (value == null) return '';
  const s = String(value);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(row, headerOrder) {
  return headerOrder.map((h) => escapeCsvCell(row[h] ?? '')).join(',');
}

function toFacebookTemplateCondition(condition) {
  const c = (condition || '').toLowerCase();
  if (c === 'refurbished') return 'Used - Like New';
  if (c === 'used') return 'Used - Good';
  return 'New';
}

function toFacebookMarketplaceCategory(category, title, description) {
  const raw = (category || '').trim();
  if (raw.includes('//')) return raw;

  const haystack = `${raw} ${title || ''} ${description || ''}`.toLowerCase();
  const rules = [
    { match: /(shirt|t-shirt|hoodie|jacket|pants|jeans|dress|clothing|apparel)/, value: "Clothing, Shoes & Accessories//Men's Clothing//Shirts" },
    { match: /(shoe|sneaker|boot|sandal)/, value: "Clothing, Shoes & Accessories//Shoes" },
    { match: /(phone|iphone|android|samsung|mobile|cell)/, value: 'Electronics//Cell Phones & Smartphones' },
    { match: /(laptop|notebook|macbook|chromebook)/, value: 'Electronics//Computers & Tablets//Laptops' },
    { match: /(tv|television|monitor)/, value: 'Electronics//TVs & Video Equipment//TVs' },
    { match: /(headphone|earbud|speaker|audio)/, value: 'Electronics//Audio' },
    { match: /(desk|chair|sofa|table|furniture)/, value: 'Home & Garden//Furniture' },
    { match: /(toy|lego|doll|game)/, value: 'Toys & Games' },
    { match: /(book|novel|textbook)/, value: 'Books, Movies & Music//Books' },
    { match: /(tool|drill|saw|hardware)/, value: 'Home Improvement Supplies//Tools' },
    { match: /(watch|jewelry|ring|necklace)/, value: 'Jewelry & Accessories' },
    { match: /(bike|bicycle|cycling)/, value: 'Sporting Goods//Bicycles' },
  ];

  for (const rule of rules) {
    if (rule.match.test(haystack)) return rule.value;
  }
  return 'Miscellaneous';
}

function toFacebookMarketplaceTitle(title, description) {
  const source = (title || '').trim() || (description || '').trim() || 'Untitled Product';
  // Keep titles concise for Marketplace review and reduce auto-rejection risk.
  return source.replace(/\s+/g, ' ').slice(0, 80);
}

/**
 * Facebook Commerce Manager CSV feed with image URLs.
 * This format supports image_link/additional_image_link so photos can import.
 */
export function toFacebookCommerceCSV(canonicalRows) {
  const headers = [
    'id',
    'title',
    'description',
    'availability',
    'condition',
    'price',
    'image_link',
    'additional_image_link',
    'google_product_category',
  ];
  const rows = canonicalRows.map((r) => ({
    id: r.id,
    title: toFacebookMarketplaceTitle(r.title, r.description),
    description: (r.description || r.title || '').slice(0, 5000),
    availability: r.availability || 'in stock',
    condition: toFacebookTemplateCondition(r.condition),
    price: Number.isFinite(r.price) ? `${Number(r.price).toFixed(2)} USD` : '0.00 USD',
    image_link: coalesceMediaUrl((r.images && r.images[0]) || r.image_url) || '',
    additional_image_link: (r.images || []).slice(1, 21).map(coalesceMediaUrl).filter(Boolean).join(',').slice(0, 2000),
    google_product_category: toFacebookMarketplaceCategory(r.category, r.title, r.description),
  }));
  const headerLine = headers.join(',');
  const dataLines = rows.map((row) => csvRow(row, headers));
  return UTF8_BOM + [headerLine, ...dataLines].join('\r\n');
}

function toFacebookMarketplaceTemplateXLSX(canonicalRows) {
  const guidance = [
    'REQUIRED | Plain text (up to 150 characters',
    'REQUIRED | A whole number in $',
    'REQUIRED | Supported values: "New"; "Used - Like New"; "Used - Good"; "Used - Fair"',
    'OPTIONAL | Plain text (up to 5000 characters)',
    'OPTIONAL | Type of listing',
    'OPTIONAL | ',
  ];
  const headers = ['TITLE', 'PRICE', 'CONDITION', 'DESCRIPTION', 'CATEGORY', 'OFFER SHIPPING'];
  const rows = canonicalRows.map((r) => ([
    toFacebookMarketplaceTitle(r.title, r.description).slice(0, 150),
    Number.isFinite(r.price) ? Math.max(0, Math.round(Number(r.price))) : 0,
    toFacebookTemplateCondition(r.condition),
    (r.description || r.title || '').slice(0, 5000),
    toFacebookMarketplaceCategory(r.category, r.title, r.description),
    '',
  ]));

  const ws = XLSX.utils.aoa_to_sheet([
    ['Facebook Marketplace Bulk Upload Template'],
    ['You can create up to 50 listings at once. When you are finished, be sure to save or export this as an XLS/XLSX file.'],
    guidance,
    headers,
    ...rows,
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bulk Upload Template');
  return wb;
}

function safeFileSegment(input) {
  return (input || 'item')
    .toString()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60) || 'item';
}

function inferImageExtension(url, contentType) {
  const byType = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  const ct = (contentType || '').toLowerCase().split(';')[0].trim();
  if (byType[ct]) return byType[ct];
  const urlStr = coalesceMediaUrl(url);
  const m = urlStr.match(/\.([a-zA-Z0-9]{2,5})(?:[?#]|$)/);
  return m ? m[1].toLowerCase() : 'jpg';
}

async function fetchImageAsBlob(url) {
  const urlStr = coalesceMediaUrl(url);
  if (!urlStr) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(urlStr, { mode: 'cors', signal: controller.signal });
    if (!res.ok) return null;
    const blob = await res.blob();
    return { blob, contentType: res.headers.get('content-type') || '' };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function exportFacebookMarketplacePackage(canonicalRows, date) {
  const zip = new JSZip();
  const wb = toFacebookMarketplaceTemplateXLSX(canonicalRows);
  const xlsxBytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  zip.file(`marketplace_template_${date}.xlsx`, xlsxBytes);

  const imagesFolder = zip.folder('images');
  const imageManifestHeaders = ['ROW', 'TITLE', 'SKU', 'IMAGE_FILE', 'SOURCE_URL', 'STATUS'];
  const imageManifestRows = [];

  for (let pi = 0; pi < canonicalRows.length; pi += 1) {
    const row = canonicalRows[pi];
    // Prefix matches spreadsheet row order when the images folder is sorted by name; title before SKU in the stem for easy Facebook uploads.
    const rowPrefix = String(pi + 1).padStart(3, '0');
    const titlePart = safeFileSegment(toFacebookMarketplaceTitle(row.title, row.description));
    const skuPart = safeFileSegment(row.sku || row.id);
    const baseName = `${rowPrefix}-${titlePart}-${skuPart}`;
    const media = (
      Array.isArray(row.images) && row.images.length > 0
        ? row.images
        : row.image_url
          ? [row.image_url]
          : []
    )
      .map(coalesceMediaUrl)
      .filter(Boolean);

    if (!media.length) {
      imageManifestRows.push({
        ROW: String(pi + 1),
        TITLE: toFacebookMarketplaceTitle(row.title, row.description),
        SKU: row.sku || row.id,
        IMAGE_FILE: '',
        SOURCE_URL: '',
        STATUS: 'missing_image_url',
      });
      continue;
    }

    for (let i = 0; i < media.length; i += 1) {
      const url = coalesceMediaUrl(media[i]);
      const fetched = url ? await fetchImageAsBlob(url) : null;
      const fileIndex = i + 1;
      if (!fetched) {
        imageManifestRows.push({
          ROW: String(pi + 1),
          TITLE: toFacebookMarketplaceTitle(row.title, row.description),
          SKU: row.sku || row.id,
          IMAGE_FILE: '',
          SOURCE_URL: url,
          STATUS: 'download_failed_or_blocked',
        });
        continue;
      }
      const ext = inferImageExtension(url, fetched.contentType);
      const fileName = `${baseName}-${String(fileIndex).padStart(2, '0')}.${ext}`;
      imagesFolder.file(fileName, fetched.blob);
      imageManifestRows.push({
        ROW: String(pi + 1),
        TITLE: toFacebookMarketplaceTitle(row.title, row.description),
        SKU: row.sku || row.id,
        IMAGE_FILE: `images/${fileName}`,
        SOURCE_URL: url,
        STATUS: 'downloaded',
      });
    }
  }

  const headerLine = imageManifestHeaders.join(',');
  const dataLines = imageManifestRows.map((r) => csvRow(r, imageManifestHeaders));
  zip.file('image_manifest.csv', UTF8_BOM + [headerLine, ...dataLines].join('\r\n'));
  zip.file(
    'README.txt',
    [
      'Facebook Marketplace upload package',
      '',
      '1) Upload marketplace_template_*.xlsx in Facebook Marketplace bulk upload.',
      '2) Open images/ folder from this zip and sort by name (default in File Explorer).',
      '   Files are named 001-title-sku-01.jpg, 002-..., so order matches the rows in marketplace_template_*.xlsx;',
      '   all images for one listing are consecutive (01, 02, ...).',
      '3) On Facebook listing review/edit step, drag images from images/ onto each matching listing.',
      '4) Use image_manifest.csv (ROW column = spreadsheet row) to match TITLE/SKU to image files quickly.',
      '',
      'Note: some source URLs block browser download via CORS; those rows appear as download_failed_or_blocked in image_manifest.csv.',
    ].join('\r\n')
  );

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(zipBlob, `facebook_marketplace_upload_package_${date}.zip`);
}

/**
 * Shopify product CSV: one row per product image/video so all media upload.
 * First row per product has full data; additional rows have same handle + image_src + image_position (2, 3, ...).
 */
export function toShopifyCSV(canonicalRows) {
  const headers = [
    'handle',
    'title',
    'body_html',
    'vendor',
    'type',
    'tags',
    'published',
    'variant_sku',
    'variant_price',
    'image_src',
    'image_position',
  ];
  const headerLine = headers.join(',');
  const rows = [];
  for (const r of canonicalRows) {
    const handle = (r.title || r.sku || r.id)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || r.id;
    const bodyHtml = r.description ? `<p>${r.description.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;')}</p>` : '';
    const allMedia = r.images || (r.image_url ? [r.image_url] : []);
    const base = {
      handle,
      title: r.title,
      body_html: bodyHtml,
      vendor: r.brand || 'Unknown',
      type: r.category,
      tags: '',
      published: 'true',
      variant_sku: r.sku,
      variant_price: Number.isFinite(r.price) ? Number(r.price).toFixed(2) : '0.00',
    };
    if (allMedia.length === 0) {
      rows.push({ ...base, image_src: '', image_position: '1' });
    } else {
      allMedia.forEach((url, idx) => {
        rows.push({
          ...base,
          image_src: url,
          image_position: String(idx + 1),
        });
      });
    }
  }
  const dataLines = rows.map((row) => csvRow(row, headers));
  return UTF8_BOM + [headerLine, ...dataLines].join('\r\n');
}

/**
 * Whatnot-style CSV: title, description, price, condition, quantity, then image_url, image_2 .. image_24 so all images and videos upload (one column per URL, in order).
 */
export function toWhatnotCSV(canonicalRows) {
  const imageHeaders = ['image_url'];
  for (let i = 2; i <= MAX_MEDIA_COLUMNS; i++) imageHeaders.push(`image_${i}`);
  const headers = ['title', 'description', 'price', 'condition', 'quantity', ...imageHeaders];
  const headerLine = headers.join(',');
  const rows = canonicalRows.map((r) => {
    const allMedia = (r.images || []).map(coalesceMediaUrl).filter(Boolean);
    const row = {
      title: r.title,
      description: r.description || r.title,
      price: Number.isFinite(r.price) ? Number(r.price).toFixed(2) : '0.00',
      condition: r.condition,
      quantity: String(r.quantity),
    };
    allMedia.slice(0, MAX_MEDIA_COLUMNS).forEach((raw, i) => {
      const url = coalesceMediaUrl(raw);
      row[i === 0 ? 'image_url' : `image_${i + 1}`] = url || '';
    });
    imageHeaders.forEach((h) => { if (row[h] === undefined) row[h] = ''; });
    return row;
  });
  const dataLines = rows.map((row) => csvRow(row, headers));
  return UTF8_BOM + [headerLine, ...dataLines].join('\r\n');
}

/**
 * Map our canonical condition to eBay Product feed condition enum.
 * eBay values: NEW, LIKE_NEW, NEW_OTHER, NEW_WITH_DEFECTS, CERTIFIED_REFURBISHED, EXCELLENT_REFURBISHED, VERY_GOOD_REFURBISHED, USED_GOOD, USED_VERY_GOOD, USED_ACCEPTABLE
 */
function toEbayCondition(condition) {
  const c = (condition || '').toLowerCase();
  if (c === 'refurbished') return 'CERTIFIED_REFURBISHED';
  if (c === 'used') return 'USED_GOOD';
  return 'NEW';
}

/**
 * eBay Product feed CSV (bulk listing upload).
 * Required: SKU (max 50), Title (max 80), Product Description, Condition, at least one Picture URL.
 * Optional: Picture URL 2–12, UPC, Brand. Price/Quantity included for reference (may be used in inventory feed).
 * @see https://developer.ebay.com/api-docs/user-guides/static/mip-user-guide/mip-definitions-product-feed.html
 */
export function toEbayCSV(canonicalRows) {
  const pictureHeaders = [];
  for (let n = 1; n <= 12; n++) {
    pictureHeaders.push(`Picture URL ${n}`);
  }
  const headers = ['SKU', 'Title', 'Product Description', 'Condition', ...pictureHeaders, 'UPC', 'Brand', 'Price', 'Quantity'];
  const headerLine = headers.join(',');
  const rows = canonicalRows.map((r) => {
    const sku = (r.sku || r.id || '').toString().slice(0, 50);
    const title = (r.title || '').slice(0, 80);
    const productDescription = r.description || r.title || '';
    const condition = toEbayCondition(r.condition);
    const row = {
      'SKU': sku,
      'Title': title,
      'Product Description': productDescription,
      'Condition': condition,
    };
    pictureHeaders.forEach((h, i) => {
      row[h] = r.images[i] || '';
    });
    row['UPC'] = r.upc || '';
    row['Brand'] = r.brand || '';
    row['Price'] = Number.isFinite(r.price) ? Number(r.price).toFixed(2) : '';
    row['Quantity'] = String(r.quantity ?? '');
    return row;
  });
  const dataLines = rows.map((row) => csvRow(row, headers));
  return UTF8_BOM + [headerLine, ...dataLines].join('\r\n');
}

/**
 * Universal CSV: superset of columns for any platform
 */
const UNIVERSAL_HEADERS = [
  'id',
  'title',
  'description',
  'sku',
  'asin',
  'fnsku',
  'upc',
  'price',
  'quantity',
  'category',
  'condition',
  'availability',
  'image_url',
  'brand',
  'location',
];

export function toUniversalCSV(canonicalRows) {
  const headerLine = UNIVERSAL_HEADERS.join(',');
  const rows = canonicalRows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    sku: r.sku,
    asin: r.asin,
    fnsku: r.fnsku,
    upc: r.upc,
    price: Number.isFinite(r.price) ? Number(r.price).toFixed(2) : '',
    quantity: r.quantity,
    category: r.category,
    condition: r.condition,
    availability: r.availability,
    image_url: r.image_url,
    brand: r.brand,
    location: r.location,
  }));
  const dataLines = rows.map((row) => csvRow(row, UNIVERSAL_HEADERS));
  return UTF8_BOM + [headerLine, ...dataLines].join('\r\n');
}

/**
 * Universal XLSX workbook (one sheet) for download
 */
export function toUniversalXLSX(canonicalRows) {
  const rows = canonicalRows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    sku: r.sku,
    asin: r.asin,
    fnsku: r.fnsku,
    upc: r.upc,
    price: Number.isFinite(r.price) ? r.price : '',
    quantity: r.quantity,
    category: r.category,
    condition: r.condition,
    availability: r.availability,
    image_url: r.image_url,
    brand: r.brand,
    location: r.location,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Products');
  return wb;
}

/**
 * Date suffix for filenames: YYYY-MM-DD
 */
export function getDateSuffix() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Trigger browser download of a blob
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export products in the chosen format and trigger download
 * @param {Array<Object>} products - Combined products from Inventory page
 * @param {'facebook'|'shopify'|'whatnot'|'ebay'|'universal'} format
 * @param {'csv'|'xlsx'} universalFormat - For 'universal', use 'csv' or 'xlsx'
 */
export async function exportMarketplace(products, format, universalFormat = 'xlsx') {
  const rows = exportProductRows(products);
  const date = getDateSuffix();

  if (format === 'facebook') {
    await exportFacebookMarketplacePackage(rows, date);
    return;
  }
  if (format === 'shopify') {
    const csv = toShopifyCSV(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `inventory_shopify_${date}.csv`);
    return;
  }
  if (format === 'whatnot') {
    const csv = toWhatnotCSV(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `inventory_whatnot_${date}.csv`);
    return;
  }
  if (format === 'ebay') {
    const csv = toEbayCSV(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `inventory_ebay_${date}.csv`);
    return;
  }
  if (format === 'universal') {
    if (universalFormat === 'xlsx') {
      const wb = toUniversalXLSX(rows);
      XLSX.writeFile(wb, `inventory_export_universal_${date}.xlsx`);
    } else {
      const csv = toUniversalCSV(rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      downloadBlob(blob, `inventory_export_universal_${date}.csv`);
    }
  }
}
