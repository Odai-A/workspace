/**
 * Heuristics for messy manifest CSVs: header row detection, fuzzy column names,
 * and inferring identifiers from sample cell values when headers are vague.
 */

const normalizeKey = (str) => {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[#\-_]/g, '')
    .trim();
};

const bigramJaccard = (a, b) => {
  if (!a || !b || a.length < 2 || b.length < 2) return 0;
  const bigrams = (s) => {
    const set = new Set();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  for (const x of A) {
    if (B.has(x)) inter++;
  }
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
};

/** Best fuzzy score between one header and any synonym (0–1). */
export const fuzzyHeaderScore = (header, acceptedVariations) => {
  const h = normalizeKey(header);
  if (!h) return 0;
  let best = 0;
  for (const syn of acceptedVariations) {
    const s = normalizeKey(syn);
    if (!s) continue;
    if (h === s) {
      best = 1;
      break;
    }
    if (h.includes(s) || s.includes(h)) {
      best = Math.max(best, 0.92);
      continue;
    }
    if (s.length >= 3 && h.length >= 3) {
      const j = bigramJaccard(h, s);
      if (j > best) best = j;
    }
  }
  return best;
};

export const findMatchingColumnFuzzy = (headers, acceptedVariations, minScore = 0.72) => {
  let bestHeader = null;
  let bestScore = minScore;
  for (const header of headers) {
    const sc = fuzzyHeaderScore(header, acceptedVariations);
    if (sc > bestScore) {
      bestScore = sc;
      bestHeader = header;
    }
  }
  return bestHeader;
};

const HEADER_HINT_WORDS = [
  'sku',
  'asin',
  'fnsku',
  'upc',
  'ean',
  'gtin',
  'lpn',
  'qty',
  'quantity',
  'msrp',
  'price',
  'cost',
  'description',
  'title',
  'product',
  'item',
  'category',
  'brand',
  'manifest',
  'pallet',
  'warehouse',
  'listing',
];

const scoreLineAsHeader = (line, delimiter) => {
  if (!line || !String(line).trim()) return -100;
  const cells = parseCSVLineQuick(line, delimiter).map((c) => c.trim()).filter(Boolean);
  if (cells.length < 3) return -50;

  let score = cells.length * 2;
  let keywordHits = 0;
  for (const cell of cells) {
    const n = normalizeKey(cell);
    for (const w of HEADER_HINT_WORDS) {
      if (n.includes(w)) {
        keywordHits++;
        break;
      }
    }
  }
  score += keywordHits * 8;

  let numericish = 0;
  for (const cell of cells) {
    if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(cell.replace(/,/g, ''))) numericish++;
    else if (/^\$?\d+[.,]\d{2}$/.test(cell)) numericish++;
  }
  score -= (numericish / Math.max(1, cells.length)) * 15;

  return score;
};

/** Minimal CSV line parse (quotes + delimiter); mirrors ProductImport.parseCSVLine behavior. */
export function parseCSVLineQuick(line, delimiter = ',') {
  const result = [];
  let inQuote = false;
  let field = '';
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && !(i > 0 && line[i - 1] === '\\')) {
      if (i < line.length - 1 && line[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (char === delimiter && !inQuote) {
      result.push(field.trim());
      field = '';
    } else {
      field += char;
    }
  }
  result.push(field.trim());
  return result;
}

const detectDelimiterQuick = (line) => {
  const delimiters = [',', '\t', ';', '|'];
  let max = 0;
  let best = ',';
  for (const d of delimiters) {
    let count = 0;
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && !(i > 0 && line[i - 1] === '\\')) inQ = !inQ;
      else if (ch === d && !inQ) count++;
    }
    if (count > max) {
      max = count;
      best = d;
    }
  }
  return best;
};

/**
 * Pick 0-based header row index from raw file lines (may include blanks).
 * Uses scoring + identifier mapping when taxonomy provided.
 */
export const findManifestHeaderRowIndex = (rawLines, columnTaxonomy, maxScan = 60) => {
  const limit = Math.min(maxScan, rawLines.length);
  let bestIdx = -1;
  let bestScore = -Infinity;

  for (let i = 0; i < limit; i++) {
    const line = rawLines[i];
    if (!line || !String(line).trim()) continue;
    const delimiter = detectDelimiterQuick(line);
    const headers = parseCSVLineQuick(line, delimiter).map((h) =>
      h.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
    );
    const validHeaders = headers.filter((h) => h && h.trim() !== '');
    if (validHeaders.length < 3) continue;

    if (bestIdx < 0) bestIdx = i;

    let rowScore = scoreLineAsHeader(line, delimiter);

    if (columnTaxonomy) {
      const m = detectColumnMappingsFromTaxonomy(validHeaders, columnTaxonomy);
      if (m.fnsku || m.asin || m.lpn) rowScore += 40;
      if (m.name || m.upc) rowScore += 6;
    }

    const next = rawLines[i + 1];
    if (next && String(next).trim()) {
      const d2 = detectDelimiterQuick(next);
      const cells = parseCSVLineQuick(next, d2);
      if (Math.abs(cells.length - headers.length) <= 2) rowScore += 5;
    }

    if (rowScore > bestScore) {
      bestScore = rowScore;
      bestIdx = i;
    }
  }

  if (columnTaxonomy && bestIdx >= 0) {
    const line = rawLines[bestIdx];
    const delimiter = detectDelimiterQuick(line);
    const headers = parseCSVLineQuick(line, delimiter).map((h) =>
      h.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
    );
    const validHeaders = headers.filter((h) => h && h.trim() !== '');
    const m0 = detectColumnMappingsFromTaxonomy(validHeaders, columnTaxonomy);
    if (!m0.fnsku && !m0.asin && !m0.lpn) {
      for (let i = 0; i < limit; i++) {
        const ln = rawLines[i];
        if (!ln || !String(ln).trim()) continue;
        const d = detectDelimiterQuick(ln);
        const hdrs = parseCSVLineQuick(ln, d)
          .map((h) => h.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1'))
          .filter((h) => h && h.trim() !== '');
        if (hdrs.length < 4) continue;
        const m = detectColumnMappingsFromTaxonomy(hdrs, columnTaxonomy);
        if (m.fnsku || m.asin || m.lpn) return i;
      }
    }
  }

  return bestIdx >= 0 ? bestIdx : 0;
};

export const detectColumnMappingsFromTaxonomy = (headers, columnTaxonomy) => {
  const mappings = {};
  const used = new Set();
  const priority = [
    'fnsku',
    'asin',
    'lpn',
    'upc',
    'name',
    'price',
    'category',
    'subcategory',
    'quantity',
    'brand',
  ];
  const keys = [
    ...priority.filter((k) => k in columnTaxonomy),
    ...Object.keys(columnTaxonomy).filter((k) => !priority.includes(k)),
  ];
  for (const fieldName of keys) {
    const variations = columnTaxonomy[fieldName];
    const available = headers.filter((h) => !used.has(h));
    const matched = findMatchingColumnFuzzy(available, variations, 0.68);
    if (matched) {
      mappings[fieldName] = matched;
      used.add(matched);
    }
  }
  return mappings;
};

const looksLikeAsin = (s) => {
  const t = String(s).trim().toUpperCase().replace(/\s/g, '');
  return t.length === 10 && /^B[0-9A-Z]{9}$/.test(t);
};

const looksLikeFnsku = (s) => {
  const t = String(s).trim().toUpperCase().replace(/\s/g, '');
  if (!t || looksLikeAsin(t)) return false;
  if (/^X[0-9A-Z]{4,}$/.test(t)) return true;
  if (t.length >= 8 && t.length <= 14 && /^[A-Z0-9]+$/.test(t) && t.startsWith('X')) return true;
  return false;
};

const looksLikeLpn = (s) => {
  const t = String(s).trim().toUpperCase().replace(/\s/g, '');
  if (!t || looksLikeAsin(t)) return false;
  if (/^LPN[A-Z0-9]{4,}$/.test(t)) return true;
  if (t.length >= 10 && t.length <= 28 && /^[A-Z0-9]+$/.test(t) && !looksLikeFnsku(t)) return true;
  return false;
};

const looksLikeUpc = (s) => {
  const u = String(s).trim().replace(/,/g, '');
  if (/[eE]/.test(u) && /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(u)) return true;
  if (/^\d{11,14}$/.test(u)) return true;
  return false;
};

const looksLikeMoney = (s) => {
  const t = String(s).trim();
  return /^\$?\d{1,7}([.,]\d{1,2})?$/.test(t.replace(/,/g, ''));
};

const looksLikeSmallQty = (s) => {
  const t = String(s).trim();
  if (!/^\d{1,5}$/.test(t)) return false;
  const n = parseInt(t, 10);
  return n >= 0 && n <= 50000;
};

const looksLikeLongText = (s) => {
  const t = String(s).trim();
  return t.length >= 18 && /[a-zA-Z]/.test(t);
};

const columnSampleScore = (samples, field) => {
  const vals = samples.filter(Boolean).map((v) => String(v).trim()).filter(Boolean);
  if (!vals.length) return 0;
  let hit = 0;
  for (const v of vals) {
    let ok = false;
    switch (field) {
      case 'asin':
        ok = looksLikeAsin(v);
        break;
      case 'fnsku':
        ok = looksLikeFnsku(v);
        break;
      case 'lpn':
        ok = looksLikeLpn(v);
        break;
      case 'upc':
        ok = looksLikeUpc(v);
        break;
      case 'quantity':
        ok = looksLikeSmallQty(v);
        break;
      case 'price':
        ok = looksLikeMoney(v);
        break;
      case 'name':
        ok = looksLikeLongText(v);
        break;
      default:
        ok = false;
    }
    if (ok) hit++;
  }
  return hit / vals.length;
};

/**
 * Merge header-based mappings with value-pattern inference for missing or weak fields.
 */
export const buildAdaptiveColumnMappings = (validHeaders, sampleRows, columnTaxonomy) => {
  let mappings = detectColumnMappingsFromTaxonomy(validHeaders, columnTaxonomy);

  const samplesByHeader = {};
  for (const h of validHeaders) {
    samplesByHeader[h] = sampleRows.map((r) => r[h]).filter((x) => x != null && String(x).trim() !== '');
  }

  const inferBest = (field, minScore, bannedHeaders) => {
    let bestH = null;
    let bestS = minScore;
    for (const h of validHeaders) {
      if (bannedHeaders.has(h)) continue;
      const s = columnSampleScore(samplesByHeader[h] || [], field);
      if (s > bestS) {
        bestS = s;
        bestH = h;
      }
    }
    return bestH;
  };

  const used = new Set(Object.values(mappings).filter(Boolean));

  const needAsin = !mappings.asin || columnSampleScore(samplesByHeader[mappings.asin] || [], 'asin') < 0.25;
  const needFnsku = !mappings.fnsku || columnSampleScore(samplesByHeader[mappings.fnsku] || [], 'fnsku') < 0.2;
  const needLpn = !mappings.lpn || columnSampleScore(samplesByHeader[mappings.lpn] || [], 'lpn') < 0.15;

  if (needAsin) {
    const h = inferBest('asin', 0.45, used);
    if (h) {
      mappings.asin = h;
      used.add(h);
    }
  }
  if (needFnsku) {
    const h = inferBest('fnsku', 0.35, used);
    if (h) {
      mappings.fnsku = h;
      used.add(h);
    }
  }
  if (needLpn) {
    const h = inferBest('lpn', 0.35, used);
    if (h) {
      mappings.lpn = h;
      used.add(h);
    }
  }

  if (!mappings.upc) {
    const h = inferBest('upc', 0.4, used);
    if (h) {
      mappings.upc = h;
      used.add(h);
    }
  }

  if (!mappings.quantity) {
    const h = inferBest('quantity', 0.55, used);
    if (h) {
      mappings.quantity = h;
      used.add(h);
    }
  }

  if (!mappings.price) {
    const h = inferBest('price', 0.45, used);
    if (h) {
      mappings.price = h;
      used.add(h);
    }
  }

  if (!mappings.name) {
    const h = inferBest('name', 0.45, used);
    if (h) {
      mappings.name = h;
      used.add(h);
    }
  }

  return mappings;
};
