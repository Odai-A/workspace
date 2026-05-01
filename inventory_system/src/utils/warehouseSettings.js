const WAREHOUSE_LAYOUT_KEY = 'warehouseLayoutSettings';
const ITEM_NUMBER_SEQUENCE_KEY = 'inventoryItemNumberSequence';

export const DEFAULT_WAREHOUSE_LAYOUT = {
  shelves: 3,
  rowsPerShelf: 5,
  binsPerRow: 0,
  shelfPrefix: 'S',
  rowPrefix: 'R',
  binPrefix: 'B',
  areas: ['STORAGE'],
  customLocations: [],
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const normalizePrefix = (value, fallback) => {
  const clean = String(value || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  return clean || fallback;
};

const normalizeAreaCode = (value) => (
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
);

const sanitizeAreas = (areas) => {
  const areaList = Array.isArray(areas)
    ? areas
    : String(areas || '').split(/[\n,]+/);

  const uniqueAreas = [...new Set(areaList.map(normalizeAreaCode).filter(Boolean))];
  return uniqueAreas.length ? uniqueAreas : [...DEFAULT_WAREHOUSE_LAYOUT.areas];
};

const sanitizeCustomLocations = (locations) => {
  const list = Array.isArray(locations) ? locations : [];
  const normalized = list
    .map((value) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, ''))
    .filter(Boolean);
  return [...new Set(normalized)];
};

const buildLocationSortRegex = (cfg) => (
  new RegExp(`^(?:(.+)-)?${cfg.shelfPrefix}(\\d+)-${cfg.rowPrefix}(\\d+)(?:-${cfg.binPrefix}(\\d+))?$`)
);

const parseLocationParts = (locationCode, cfg) => {
  const normalized = String(locationCode || '').trim().toUpperCase();
  const match = normalized.match(buildLocationSortRegex(cfg));
  if (!match) return null;

  return {
    raw: normalized,
    area: normalizeAreaCode(match[1] || ''),
    shelf: parseInt(match[2], 10) || 0,
    row: parseInt(match[3], 10) || 0,
    bin: match[4] ? (parseInt(match[4], 10) || 0) : 0,
    hasBin: Boolean(match[4]),
  };
};

const compareLocationCodes = (a, b, cfg) => {
  const aParts = parseLocationParts(a, cfg);
  const bParts = parseLocationParts(b, cfg);

  if (!aParts || !bParts) {
    return String(a || '').localeCompare(String(b || ''));
  }

  const areaOrder = cfg.areas.reduce((acc, areaCode, index) => {
    acc[areaCode] = index;
    return acc;
  }, {});

  const aAreaRank = Number.isInteger(areaOrder[aParts.area]) ? areaOrder[aParts.area] : Number.MAX_SAFE_INTEGER;
  const bAreaRank = Number.isInteger(areaOrder[bParts.area]) ? areaOrder[bParts.area] : Number.MAX_SAFE_INTEGER;
  if (aAreaRank !== bAreaRank) return aAreaRank - bAreaRank;

  if (aParts.area !== bParts.area) return aParts.area.localeCompare(bParts.area);
  if (aParts.shelf !== bParts.shelf) return aParts.shelf - bParts.shelf;
  if (aParts.row !== bParts.row) return aParts.row - bParts.row;
  if (aParts.hasBin !== bParts.hasBin) return Number(aParts.hasBin) - Number(bParts.hasBin);
  if (aParts.bin !== bParts.bin) return aParts.bin - bParts.bin;
  return aParts.raw.localeCompare(bParts.raw);
};

export const sanitizeWarehouseLayout = (value = {}) => ({
  shelves: clamp(parseInt(value.shelves, 10) || DEFAULT_WAREHOUSE_LAYOUT.shelves, 1, 999),
  rowsPerShelf: clamp(parseInt(value.rowsPerShelf, 10) || DEFAULT_WAREHOUSE_LAYOUT.rowsPerShelf, 1, 999),
  binsPerRow: clamp(parseInt(value.binsPerRow, 10) || 0, 0, 999),
  shelfPrefix: normalizePrefix(value.shelfPrefix, DEFAULT_WAREHOUSE_LAYOUT.shelfPrefix),
  rowPrefix: normalizePrefix(value.rowPrefix, DEFAULT_WAREHOUSE_LAYOUT.rowPrefix),
  binPrefix: normalizePrefix(value.binPrefix, DEFAULT_WAREHOUSE_LAYOUT.binPrefix),
  areas: sanitizeAreas(value.areas),
  customLocations: sanitizeCustomLocations(value.customLocations),
});

export const getWarehouseLayoutSettings = () => {
  try {
    const raw = localStorage.getItem(WAREHOUSE_LAYOUT_KEY);
    if (!raw) return { ...DEFAULT_WAREHOUSE_LAYOUT };
    return sanitizeWarehouseLayout(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_WAREHOUSE_LAYOUT };
  }
};

export const setWarehouseLayoutSettings = (value) => {
  const sanitized = sanitizeWarehouseLayout(value);
  localStorage.setItem(WAREHOUSE_LAYOUT_KEY, JSON.stringify(sanitized));
  return sanitized;
};

export const getLocationCode = ({ area = null, shelf, row, bin = null }, layout = getWarehouseLayoutSettings()) => {
  const cfg = sanitizeWarehouseLayout(layout);
  const areaCode = normalizeAreaCode(area);
  const s = `${cfg.shelfPrefix}${parseInt(shelf, 10)}`;
  const r = `${cfg.rowPrefix}${parseInt(row, 10)}`;
  const baseLocation = areaCode ? `${areaCode}-${s}-${r}` : `${s}-${r}`;
  if (cfg.binsPerRow > 0 && bin != null && String(bin).trim() !== '') {
    return `${baseLocation}-${cfg.binPrefix}${parseInt(bin, 10)}`;
  }
  return baseLocation;
};

export const getLocationOptions = (layout = getWarehouseLayoutSettings()) => {
  const cfg = sanitizeWarehouseLayout(layout);
  const options = [...cfg.customLocations];
  for (const area of cfg.areas) {
    for (let shelf = 1; shelf <= cfg.shelves; shelf += 1) {
      for (let row = 1; row <= cfg.rowsPerShelf; row += 1) {
        if (cfg.binsPerRow > 0) {
          for (let bin = 1; bin <= cfg.binsPerRow; bin += 1) {
            options.push(getLocationCode({ area, shelf, row, bin }, cfg));
          }
        } else {
          options.push(getLocationCode({ area, shelf, row }, cfg));
        }
      }
    }
  }
  return [...new Set(options)].sort((a, b) => compareLocationCodes(a, b, cfg));
};

export const addShelvesToArea = ({ area, count = 1 }, layout = getWarehouseLayoutSettings()) => {
  const cfg = sanitizeWarehouseLayout(layout);
  const areaCode = normalizeAreaCode(area);
  if (!areaCode) {
    return { layout: cfg, addedLocations: [] };
  }

  const shelvesToAdd = clamp(parseInt(count, 10) || 1, 1, 100);
  const nextAreas = cfg.areas.includes(areaCode) ? cfg.areas : [...cfg.areas, areaCode];
  const shelfRegex = new RegExp(`^${areaCode}-${cfg.shelfPrefix}(\\d+)-${cfg.rowPrefix}\\d+(?:-${cfg.binPrefix}\\d+)?$`);
  const maxCustomShelf = cfg.customLocations.reduce((max, locationCode) => {
    const match = String(locationCode || '').match(shelfRegex);
    if (!match) return max;
    return Math.max(max, parseInt(match[1], 10) || 0);
  }, 0);
  let shelfStart = cfg.areas.includes(areaCode) ? cfg.shelves + 1 : 1;
  shelfStart = Math.max(shelfStart, maxCustomShelf + 1);

  const addedLocations = [];
  for (let shelf = shelfStart; shelf < shelfStart + shelvesToAdd; shelf += 1) {
    for (let row = 1; row <= cfg.rowsPerShelf; row += 1) {
      if (cfg.binsPerRow > 0) {
        for (let bin = 1; bin <= cfg.binsPerRow; bin += 1) {
          addedLocations.push(getLocationCode({ area: areaCode, shelf, row, bin }, cfg));
        }
      } else {
        addedLocations.push(getLocationCode({ area: areaCode, shelf, row }, cfg));
      }
    }
  }

  const updatedLayout = sanitizeWarehouseLayout({
    ...cfg,
    areas: nextAreas,
    customLocations: [...cfg.customLocations, ...addedLocations],
  });

  return { layout: updatedLayout, addedLocations };
};

export const isValidLocationCode = (code, layout = getWarehouseLayoutSettings()) => {
  if (!code || typeof code !== 'string') return false;
  const normalized = code.trim().toUpperCase();
  return getLocationOptions(layout).some((option) => option.toUpperCase() === normalized);
};

export const getNextItemNumber = (locationCode) => {
  const normalizedLocation = String(locationCode || 'UNASSIGNED')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    || 'UNASSIGNED';
  let next = 1;
  try {
    const saved = parseInt(localStorage.getItem(ITEM_NUMBER_SEQUENCE_KEY), 10);
    next = Number.isFinite(saved) ? saved + 1 : 1;
  } catch {
    next = 1;
  }
  localStorage.setItem(ITEM_NUMBER_SEQUENCE_KEY, String(next));
  return `${normalizedLocation}-I${String(next).padStart(6, '0')}`;
};
