/**
 * Marketplace export: normalize inventory/manifest products and export as
 * Facebook, Shopify, Whatnot, or Universal CSV/XLSX for bulk upload.
 */

import * as XLSX from 'xlsx';

const UTF8_BOM = '\uFEFF';

/**
 * Normalize a product row from Inventory page (inventory + manifest shape) to canonical fields.
 * @param {Object} item - Row from combined products list (Description, Fn Sku, B00 Asin, MSRP, etc.)
 * @returns {Object} Canonical row: id, title, description, sku, asin, fnsku, upc, price, quantity, category, condition, availability, image_url, brand, location, images
 */
export function normalizeProductRow(item) {
  const title = (item['Description'] ?? item.name ?? '').trim() || 'Untitled Product';
  const description = (item.description ?? item['Description'] ?? item.name ?? title).trim();
  const fnsku = (item['Fn Sku'] ?? item.fnsku ?? item.sku ?? '').trim();
  const asin = (item['B00 Asin'] ?? item.asin ?? '').trim();
  const lpn = (item['X-Z ASIN'] ?? item.lpn ?? '').trim();
  const quantity = typeof item.Quantity === 'number' ? item.Quantity : (item.quantity != null ? Number(item.quantity) : 0);
  const priceNum = typeof item.MSRP === 'number' ? item.MSRP : (item.price != null ? parseFloat(item.price) : 0);
  const price = Number.isFinite(priceNum) ? priceNum : 0;
  const category = (item.Category ?? item.category ?? '').trim() || 'Uncategorized';
  const imageUrl = (item.image_url ?? item['Image URL'] ?? '').trim();
  const rawCondition = (item._rawData?.condition ?? item.condition ?? '').toString().toLowerCase();
  const location = (item.Location ?? item.location ?? '').trim() || '';

  // Facebook/commerce condition: new, refurbished, used
  let condition = 'new';
  if (rawCondition.includes('refurb') || rawCondition === 'refurbished') condition = 'refurbished';
  else if (rawCondition.includes('used') || rawCondition === 'used') condition = 'used';

  const availability = quantity > 0 ? 'in stock' : 'out of stock';

  // Unique id for catalogs (prefer sku/fnsku/asin)
  const id = (fnsku || asin || lpn || item.id || '').toString().trim() || `row-${Math.random().toString(36).slice(2, 11)}`;

  // Image array: support single URL, JSON array [...], or JSON object { images: [...], videos: [...] }
  let images = [];
  if (imageUrl) {
    const raw = typeof imageUrl === 'string' ? imageUrl.trim() : '';
    if (raw.startsWith('{')) {
      try {
        const obj = JSON.parse(imageUrl);
        const imgs = Array.isArray(obj.images) ? obj.images : [];
        const videos = Array.isArray(obj.videos) ? obj.videos : [];
        images = [...imgs, ...videos];
      } catch {
        images = [imageUrl];
      }
    } else if (raw.startsWith('[')) {
      try {
        const arr = JSON.parse(imageUrl);
        images = Array.isArray(arr) ? arr : [imageUrl];
      } catch {
        images = [imageUrl];
      }
    } else {
      images = [imageUrl];
    }
  }

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
    image_url: images[0] || '',
    images, // all image + video URLs in one array for exports
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

/**
 * Facebook Commerce Manager CSV: id, title, description, availability, condition, price, image_link, additional_image_link.
 * image_link = primary image (required). additional_image_link = comma-separated list of up to 20 extra images/videos (max 2000 chars).
 */
export function toFacebookCSV(canonicalRows) {
  const headers = ['id', 'title', 'description', 'availability', 'condition', 'price', 'image_link', 'additional_image_link'];
  const headerLine = headers.join(',');
  const priceFormat = (p) => (Number.isFinite(p) ? `${Number(p).toFixed(2)} USD` : '0.00 USD');
  const rows = canonicalRows.map((r) => {
    const allMedia = r.images || [];
    const imageLink = allMedia[0] || '';
    const additional = allMedia.slice(1, 21).join(','); // Facebook: up to 20 additional
    return {
      id: r.id,
      title: r.title,
      description: r.description || r.title,
      availability: r.availability,
      condition: r.condition,
      price: priceFormat(r.price),
      image_link: imageLink,
      additional_image_link: additional.slice(0, 2000), // max 2000 chars
    };
  });
  const dataLines = rows.map((row) => csvRow(row, headers));
  return UTF8_BOM + [headerLine, ...dataLines].join('\r\n');
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
          image_src: url || '',
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
    const allMedia = r.images || [];
    const row = {
      title: r.title,
      description: r.description || r.title,
      price: Number.isFinite(r.price) ? Number(r.price).toFixed(2) : '0.00',
      condition: r.condition,
      quantity: String(r.quantity),
    };
    allMedia.slice(0, MAX_MEDIA_COLUMNS).forEach((url, i) => {
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
export function exportMarketplace(products, format, universalFormat = 'xlsx') {
  const rows = exportProductRows(products);
  const date = getDateSuffix();

  if (format === 'facebook') {
    const csv = toFacebookCSV(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `inventory_facebook_${date}.csv`);
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
