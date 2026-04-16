const WAREHOUSE_LAYOUT_KEY = 'warehouseLayoutSettings';
const ITEM_NUMBER_SEQUENCE_KEY = 'inventoryItemNumberSequence';

export const DEFAULT_WAREHOUSE_LAYOUT = {
  shelves: 3,
  rowsPerShelf: 5,
  binsPerRow: 0,
  shelfPrefix: 'S',
  rowPrefix: 'R',
  binPrefix: 'B',
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const normalizePrefix = (value, fallback) => {
  const clean = String(value || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  return clean || fallback;
};

export const sanitizeWarehouseLayout = (value = {}) => ({
  shelves: clamp(parseInt(value.shelves, 10) || DEFAULT_WAREHOUSE_LAYOUT.shelves, 1, 999),
  rowsPerShelf: clamp(parseInt(value.rowsPerShelf, 10) || DEFAULT_WAREHOUSE_LAYOUT.rowsPerShelf, 1, 999),
  binsPerRow: clamp(parseInt(value.binsPerRow, 10) || 0, 0, 999),
  shelfPrefix: normalizePrefix(value.shelfPrefix, DEFAULT_WAREHOUSE_LAYOUT.shelfPrefix),
  rowPrefix: normalizePrefix(value.rowPrefix, DEFAULT_WAREHOUSE_LAYOUT.rowPrefix),
  binPrefix: normalizePrefix(value.binPrefix, DEFAULT_WAREHOUSE_LAYOUT.binPrefix),
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

export const getLocationCode = ({ shelf, row, bin = null }, layout = getWarehouseLayoutSettings()) => {
  const cfg = sanitizeWarehouseLayout(layout);
  const s = `${cfg.shelfPrefix}${parseInt(shelf, 10)}`;
  const r = `${cfg.rowPrefix}${parseInt(row, 10)}`;
  if (cfg.binsPerRow > 0 && bin != null && String(bin).trim() !== '') {
    return `${s}-${r}-${cfg.binPrefix}${parseInt(bin, 10)}`;
  }
  return `${s}-${r}`;
};

export const getLocationOptions = (layout = getWarehouseLayoutSettings()) => {
  const cfg = sanitizeWarehouseLayout(layout);
  const options = [];
  for (let shelf = 1; shelf <= cfg.shelves; shelf += 1) {
    for (let row = 1; row <= cfg.rowsPerShelf; row += 1) {
      if (cfg.binsPerRow > 0) {
        for (let bin = 1; bin <= cfg.binsPerRow; bin += 1) {
          options.push(getLocationCode({ shelf, row, bin }, cfg));
        }
      } else {
        options.push(getLocationCode({ shelf, row }, cfg));
      }
    }
  }
  return options;
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
