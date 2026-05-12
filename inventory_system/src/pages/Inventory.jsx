import React, { useState, useEffect, useCallback, useMemo, useRef, startTransition } from 'react';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowDownTrayIcon,
  XMarkIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Table from '../components/ui/Table';
import Pagination from '../components/ui/Pagination';
import AddStockModal from '../components/inventory/AddStockModal';
import Modal from '../components/ui/Modal';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';
import { productLookupService } from '../services/databaseService';
import { inventoryService, supabase, formatSupabaseError } from '../config/supabaseClient';
import { exportMarketplace } from '../utils/marketplaceExport';
import axios from 'axios';
import { getLabelDiscountPercent, getLabelPrinterProfile } from '../utils/labelSettings';
import {
  getLocationOptions,
  getNextItemNumber,
  getWarehouseLayoutSettings,
  isValidLocationCode,
  formatLocationDisplayForUi,
} from '../utils/warehouseSettings';

const EXPORT_ALL_LIMIT = 10000;

const MARKETPLACE_EXPORT_LABELS = {
  facebook: 'Facebook Marketplace',
  shopify: 'Shopify',
  whatnot: 'Whatnot',
  ebay: 'eBay',
  commentsold: 'CommentSold',
  universal: 'Universal',
};
const BUCKET_CODE_OPTIONS = Array.from({ length: 10 }, (_, index) => `B${index + 1}`);

const INVENTORY_PAGE_SIZE_OPTIONS = [25, 50, 75, 100];
const ITEMS_PER_PAGE_STORAGE_KEY = 'inventoryItemsPerPage';

function readStoredItemsPerPage() {
  try {
    const v = parseInt(localStorage.getItem(ITEMS_PER_PAGE_STORAGE_KEY), 10);
    if (INVENTORY_PAGE_SIZE_OPTIONS.includes(v)) return v;
  } catch {
    /* ignore */
  }
  return INVENTORY_PAGE_SIZE_OPTIONS[0];
}

/** Load up to this many rows from each source, merge (avoids broken totals from paging two tables separately). */
const INVENTORY_FETCH_LIMIT = 8000;
/** First paint: load this many rows per source, then optionally fetch up to INVENTORY_FETCH_LIMIT in the background. */
const INVENTORY_QUICK_FETCH_LIMIT = Math.min(400, INVENTORY_FETCH_LIMIT);

/** Minimal manifest columns for merge / FNSKU enrichment (smaller payload than select('*')). */
const MANIFEST_MERGE_SELECT = 'id, "B00 Asin", "Fn Sku", "X-Z ASIN", image_url';

/** Stable row id for selection (inventory and manifest rows can share numeric ids). */
function getInventoryRowKey(item) {
  if (!item || item.id == null) return '';
  const src = item.source === 'manifest_data' ? 'm' : 'i';
  return `${src}:${item.id}`;
}

function getInventoryDisplayName(item) {
  if (!item) return 'Item';
  return item.Description || item['Description'] || item.name || 'Item';
}

/** Inline quantity + MSRP editor for inventory rows (inventory table or manifest-only). */
function InventoryQtyPriceEditor({ rowData, patchMetrics }) {
  const rowKey = getInventoryRowKey(rowData);
  const curQ = Number(rowData.Quantity ?? 0) || 0;
  const curP = typeof rowData.MSRP === 'number' ? rowData.MSRP : parseFloat(rowData.MSRP) || 0;
  const [qtyStr, setQtyStr] = useState(String(curQ));
  const [priceStr, setPriceStr] = useState(Number.isFinite(curP) ? curP.toFixed(2) : '0.00');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = Number(rowData.Quantity ?? 0) || 0;
    const p = typeof rowData.MSRP === 'number' ? rowData.MSRP : parseFloat(rowData.MSRP) || 0;
    setQtyStr(String(q));
    setPriceStr(Number.isFinite(p) ? p.toFixed(2) : '0.00');
  }, [rowKey, rowData.Quantity, rowData.MSRP]);

  const parsedQ = parseInt(qtyStr, 10);
  const parsedP = parseFloat(priceStr);
  const dirty =
    Number.isFinite(parsedQ) &&
    Number.isFinite(parsedP) &&
    (parsedQ !== curQ || Math.round((parsedP - curP) * 100) !== 0);

  const valid =
    Number.isFinite(parsedQ) &&
    parsedQ >= 0 &&
    Number.isFinite(parsedP) &&
    parsedP >= 0;

  const handleSave = async (e) => {
    e?.stopPropagation?.();
    if (!valid || !dirty || !rowKey) return;
    setSaving(true);
    try {
      const result = await patchMetrics(rowData, parsedQ, parsedP);
      if (!result?.success) {
        toast.error(result?.error || 'Save failed');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="flex flex-col sm:flex-row sm:items-end gap-2 min-w-[10rem]"
      onClick={(e) => e.stopPropagation()}
    >
      <label className="flex flex-col gap-0.5 text-xs text-gray-600 dark:text-gray-400">
        Qty
        <input
          type="number"
          min={0}
          step={1}
          value={qtyStr}
          onChange={(e) => setQtyStr(e.target.value)}
          className="w-full sm:w-16 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        />
      </label>
      <label className="flex flex-col gap-0.5 text-xs text-gray-600 dark:text-gray-400">
        MSRP
        <input
          type="number"
          min={0}
          step="0.01"
          value={priceStr}
          onChange={(e) => setPriceStr(e.target.value)}
          className="w-full sm:w-24 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        />
      </label>
      <button
        type="button"
        onClick={handleSave}
        disabled={!valid || !dirty || saving || !rowKey}
        className="text-sm px-2 py-1 rounded bg-indigo-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-700 shrink-0"
      >
        {saving ? '…' : 'Save'}
      </button>
    </div>
  );
}

function normalizeRemoveError(err) {
  if (err == null) return 'Remove failed';
  if (typeof err === 'string') return err;
  return formatSupabaseError(err);
}

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseStorageLocation = (location, layout) => {
  const rawLocation = String(location || '').trim();
  if (!rawLocation) return null;
  const shelfPrefix = String(layout?.shelfPrefix || 'S').trim().toUpperCase();
  const rowPrefix = String(layout?.rowPrefix || 'R').trim().toUpperCase();
  const binPrefix = String(layout?.binPrefix || 'B').trim().toUpperCase();
  const hasWarehouseBins = Number.parseInt(layout?.binsPerRow, 10) > 0;
  const matcher = new RegExp(
    `^${escapeRegex(shelfPrefix)}(\\d+)-${escapeRegex(rowPrefix)}(\\d+)(?:-${escapeRegex(binPrefix)}(\\d+))?(?:-${escapeRegex(binPrefix)}(\\d+))?$`,
    'i'
  );
  const match = rawLocation.match(matcher);
  if (!match) return null;
  const firstSegmentValue = match[3] ? Number.parseInt(match[3], 10) : null;
  const secondSegmentValue = match[4] ? Number.parseInt(match[4], 10) : null;
  const firstSegmentCode = Number.isFinite(firstSegmentValue) ? `${binPrefix}${firstSegmentValue}` : '';
  const secondSegmentCode = Number.isFinite(secondSegmentValue) ? `${binPrefix}${secondSegmentValue}` : '';
  return {
    shelf: Number.parseInt(match[1], 10),
    row: Number.parseInt(match[2], 10),
    bucket: hasWarehouseBins ? secondSegmentCode : firstSegmentCode,
  };
};

const extractItemSequence = (item) => {
  const rawItemNumber = String(
    item?.['Item Number'] ||
    item?.item_number ||
    item?.itemNumber ||
    item?._rawData?.item_number ||
    ''
  ).trim();
  if (!rawItemNumber) return null;
  const match = rawItemNumber.match(/I(\d+)/i);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : null;
};

/** PostgREST `in()` batches — avoids huge URLs and keeps latency predictable. */
const IN_QUERY_CHUNK_SIZE = 120;
/** Run this many chunk queries in parallel (sequential chunks were the main inventory load bottleneck). */
const SUPABASE_IN_QUERY_PARALLEL = 8;

async function fetchManifestRowsByIds(ids) {
  const unique = [...new Set((ids || []).filter((id) => id != null).map((id) => String(id)))];
  if (unique.length === 0) return [];
  const chunks = [];
  for (let i = 0; i < unique.length; i += IN_QUERY_CHUNK_SIZE) {
    chunks.push(unique.slice(i, i + IN_QUERY_CHUNK_SIZE));
  }
  const rows = [];
  for (let w = 0; w < chunks.length; w += SUPABASE_IN_QUERY_PARALLEL) {
    const slice = chunks.slice(w, w + SUPABASE_IN_QUERY_PARALLEL);
    const results = await Promise.all(
      slice.map((chunk) => supabase.from('manifest_data').select(MANIFEST_MERGE_SELECT).in('id', chunk))
    );
    for (const { data, error } of results) {
      if (error) console.warn('batch manifest_data by id:', error);
      if (data?.length) rows.push(...data);
    }
  }
  return rows;
}

async function fetchManifestRowsByFnsku(userId, fnskuList) {
  if (!userId) return [];
  const unique = [...new Set((fnskuList || []).map((c) => String(c || '').trim()).filter(Boolean))];
  if (unique.length === 0) return [];
  const chunks = [];
  for (let i = 0; i < unique.length; i += IN_QUERY_CHUNK_SIZE) {
    chunks.push(unique.slice(i, i + IN_QUERY_CHUNK_SIZE));
  }
  const rows = [];
  for (let w = 0; w < chunks.length; w += SUPABASE_IN_QUERY_PARALLEL) {
    const slice = chunks.slice(w, w + SUPABASE_IN_QUERY_PARALLEL);
    const results = await Promise.all(
      slice.map((chunk) =>
        supabase
          .from('manifest_data')
          .select(MANIFEST_MERGE_SELECT)
          .eq('user_id', userId)
          .in('Fn Sku', chunk)
      )
    );
    for (const { data, error } of results) {
      if (error) console.warn('batch manifest_data by Fn Sku:', error);
      if (data?.length) rows.push(...data);
    }
  }
  return rows;
}

async function fetchApiCacheImageMaps(asinSet, fnskuSet) {
  const imageByAsin = new Map();
  const imageByFnsku = new Map();
  const asins = [...asinSet];
  const fnskus = [...fnskuSet];
  if (asins.length === 0 && fnskus.length === 0) {
    return { imageByAsin, imageByFnsku };
  }

  async function fillAsinMap() {
    if (asins.length === 0) return;
    const chunks = [];
    for (let i = 0; i < asins.length; i += IN_QUERY_CHUNK_SIZE) {
      chunks.push(asins.slice(i, i + IN_QUERY_CHUNK_SIZE));
    }
    for (let w = 0; w < chunks.length; w += SUPABASE_IN_QUERY_PARALLEL) {
      const slice = chunks.slice(w, w + SUPABASE_IN_QUERY_PARALLEL);
      const results = await Promise.all(
        slice.map((chunk) =>
          supabase.from('api_lookup_cache').select('asin, fnsku, image_url').in('asin', chunk)
        )
      );
      for (const { data, error } of results) {
        if (error) console.warn('batch api_lookup_cache by asin:', error);
        (data || []).forEach((row) => {
          if (row?.asin && row.image_url && !imageByAsin.has(row.asin)) imageByAsin.set(row.asin, row.image_url);
        });
      }
    }
  }

  async function fillFnskuMap() {
    if (fnskus.length === 0) return;
    const chunks = [];
    for (let i = 0; i < fnskus.length; i += IN_QUERY_CHUNK_SIZE) {
      chunks.push(fnskus.slice(i, i + IN_QUERY_CHUNK_SIZE));
    }
    for (let w = 0; w < chunks.length; w += SUPABASE_IN_QUERY_PARALLEL) {
      const slice = chunks.slice(w, w + SUPABASE_IN_QUERY_PARALLEL);
      const results = await Promise.all(
        slice.map((chunk) =>
          supabase.from('api_lookup_cache').select('asin, fnsku, image_url').in('fnsku', chunk)
        )
      );
      for (const { data, error } of results) {
        if (error) console.warn('batch api_lookup_cache by fnsku:', error);
        (data || []).forEach((row) => {
          if (row?.fnsku && row.image_url && !imageByFnsku.has(row.fnsku)) imageByFnsku.set(row.fnsku, row.image_url);
        });
      }
    }
  }

  await Promise.all([fillAsinMap(), fillFnskuMap()]);
  return { imageByAsin, imageByFnsku };
}

/** Fill image_url from api_lookup_cache after the list is shown (faster time-to-interactive). */
async function hydrateInventoryListImages(items) {
  if (!items?.length) return items;
  const asinSet = new Set();
  const fnskuSet = new Set();
  items.forEach((it) => {
    const img = it.image_url || it['Image URL'] || '';
    if (img) return;
    const asin = it['B00 Asin'] || it.asin || '';
    const fnsku = String(it['Fn Sku'] || it.sku || '').trim();
    if (asin) asinSet.add(String(asin).trim());
    if (fnsku) fnskuSet.add(fnsku);
  });
  const { imageByAsin, imageByFnsku } = await fetchApiCacheImageMaps(asinSet, fnskuSet);
  if (imageByAsin.size === 0 && imageByFnsku.size === 0) return items;
  return items.map((it) => {
    let image_url = it.image_url || it['Image URL'] || '';
    if (image_url) return it;
    const asin = it['B00 Asin'] || it.asin || '';
    const fnsku = String(it['Fn Sku'] || it.sku || '').trim();
    if (asin && imageByAsin.has(asin)) image_url = imageByAsin.get(asin);
    if (!image_url && fnsku && imageByFnsku.has(fnsku)) image_url = imageByFnsku.get(fnsku);
    if (!image_url) return it;
    return { ...it, image_url };
  });
}

/**
 * Combine inventory and manifest results into a single list (used by Inventory load and export-all).
 * Uses batched Supabase queries instead of per-row parallel requests (was very slow on large inventories).
 */
async function combineInventoryAndManifest(inventoryResult, manifestResult, searchTerm, hiddenManifestIds = new Set()) {
  const isAsin = (str) => str && typeof str === 'string' && str.length === 10 && str.startsWith('B0');
  const isFnsku = (str) => str && typeof str === 'string' && (str.startsWith('X') || str.length > 10);

  const rawRows = inventoryResult.data || [];

  const deriveSkuFields = (item) => {
    let asin = item.asin || '';
    let fnsku = '';
    let lpn = '';
    let image_url = item.image_url || '';
    const skuValue = item.sku || '';
    if (isAsin(skuValue)) {
      asin = skuValue;
      fnsku = '';
    } else if (isFnsku(skuValue)) {
      fnsku = skuValue;
    } else {
      fnsku = skuValue;
    }
    return { asin, fnsku, lpn, image_url };
  };

  const productIds = rawRows.map((r) => r.product_id).filter((id) => id != null);
  const manifestRowsByIdList = await fetchManifestRowsByIds(productIds);
  const manifestById = new Map(manifestRowsByIdList.map((row) => [row.id, row]));

  const fnskuNeedingManifest = new Set();
  const staged = rawRows.map((item) => {
    const fields = deriveSkuFields(item);
    let { asin, fnsku, lpn, image_url } = fields;

    if (item.product_id) {
      const manifestData = manifestById.get(item.product_id);
      if (manifestData) {
        if (!asin && manifestData['B00 Asin']) asin = manifestData['B00 Asin'];
        if (!fnsku && manifestData['Fn Sku']) fnsku = manifestData['Fn Sku'];
        if (manifestData['X-Z ASIN']) lpn = manifestData['X-Z ASIN'];
        if (!image_url && manifestData.image_url) image_url = manifestData.image_url;
      }
    }
    if (fnsku && !asin) fnskuNeedingManifest.add(String(fnsku).trim());

    return { item, asin, fnsku, lpn, image_url };
  });

  const manifestByFnsku = new Map();
  if (fnskuNeedingManifest.size > 0) {
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id || null;
    if (!userId) {
      console.warn('combineInventoryAndManifest: no user for FNSKU manifest batch');
    } else {
    const extraRows = await fetchManifestRowsByFnsku(userId, [...fnskuNeedingManifest]);
    extraRows.forEach((row) => {
      const k = row['Fn Sku'];
      if (k && !manifestByFnsku.has(String(k).trim())) manifestByFnsku.set(String(k).trim(), row);
    });
    }
  }

  const inventoryItems = staged.map(({ item, asin: a0, fnsku: f0, lpn: l0, image_url: img0 }) => {
    let asin = a0;
    let fnsku = f0;
    let lpn = l0;
    let image_url = img0;

    if (fnsku && !asin) {
      const md = manifestByFnsku.get(String(fnsku).trim());
      if (md) {
        if (!asin && md['B00 Asin']) asin = md['B00 Asin'];
        if (!lpn && md['X-Z ASIN']) lpn = md['X-Z ASIN'];
        if (!image_url && md.image_url) image_url = md.image_url;
      }
    }

    return {
      id: item.id,
      product_id: item.product_id,
      'Description': item.name || 'Unknown Product',
      'X-Z ASIN': lpn,
      'Fn Sku': fnsku,
      'B00 Asin': asin,
      'Quantity': item.quantity || 0,
      'MSRP': item.price || 0,
      'Category': item.category || 'Uncategorized',
      'Location': item.location || 'Default',
      'Item Number': item.item_number || '',
      image_url,
      source: 'inventory_table',
      _rawData: item
    };
  });

  const manifestItems = (manifestResult.data || [])
    .filter((item) => item?.id != null && !hiddenManifestIds.has(String(item.id)))
    .map((item) => ({
      ...item,
      image_url: item.image_url || item['Image URL'] || '',
      source: 'manifest_data',
    }));

  const combinedItems = [...inventoryItems];
  const keyToInvIdx = new Map();
  inventoryItems.forEach((invItem, idx) => {
    [invItem['Fn Sku'], invItem['X-Z ASIN'], invItem['B00 Asin']]
      .map((k) => (k != null && String(k).trim() ? String(k).trim() : null))
      .filter(Boolean)
      .forEach((k) => {
        if (!keyToInvIdx.has(k)) keyToInvIdx.set(k, idx);
      });
  });
  manifestItems.forEach((manifestItem) => {
    const manifestSku = manifestItem['Fn Sku'] || manifestItem['X-Z ASIN'];
    const manifestAsin = manifestItem['B00 Asin'];
    let existingIndex = -1;
    for (const k of [manifestSku, manifestAsin, manifestItem['Fn Sku'], manifestItem['X-Z ASIN']]) {
      if (k == null || k === '') continue;
      const idx = keyToInvIdx.get(String(k).trim());
      if (idx != null) {
        existingIndex = idx;
        break;
      }
    }
    if (existingIndex >= 0) {
      if (!combinedItems[existingIndex].image_url && manifestItem.image_url) {
        combinedItems[existingIndex].image_url = manifestItem.image_url;
      }
    } else {
      combinedItems.push(manifestItem);
    }
  });

  let filteredItems = combinedItems;
  if (searchTerm && searchTerm.trim()) {
    const searchLower = searchTerm.toLowerCase();
    filteredItems = combinedItems.filter(item => {
      const description = (item['Description'] || item.name || '').toLowerCase();
      const asin = (item['B00 Asin'] || item.asin || '').toLowerCase();
      const fnsku = (item['Fn Sku'] || item.sku || '').toLowerCase();
      const lpn = (item['X-Z ASIN'] || item.lpn || '').toLowerCase();
      return description.includes(searchLower) || asin.includes(searchLower) || fnsku.includes(searchLower) || lpn.includes(searchLower);
    });
  }

  return filteredItems.map(item => ({
    ...item,
    image_url: item.image_url || item['Image URL'] || item._rawData?.image_url || ''
  }));
}

const Inventory = () => {
  const { apiClient } = useAuth();
  /** Cancels stale image hydration when a newer load starts. */
  const inventoryLoadGenRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [augmentingList, setAugmentingList] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [appliedSearchTerm, setAppliedSearchTerm] = useState('');
  const searchDebounceRef = useRef(null);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(readStoredItemsPerPage);
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [showMarketplaceExportModal, setShowMarketplaceExportModal] = useState(false);
  const [marketplaceExportFormat, setMarketplaceExportFormat] = useState('facebook');
  const [marketplaceExportScope, setMarketplaceExportScope] = useState('current');
  const [marketplaceUniversalFormat, setMarketplaceUniversalFormat] = useState('xlsx');
  const [isExportingMarketplace, setIsExportingMarketplace] = useState(false);
  const [warehouseLayout, setWarehouseLayout] = useState(() => getWarehouseLayoutSettings());
  const [locationOptions, setLocationOptions] = useState(() => getLocationOptions(getWarehouseLayoutSettings()));
  const [shelfFilter, setShelfFilter] = useState('all');
  const [rowFilter, setRowFilter] = useState('all');
  const [bucketFilter, setBucketFilter] = useState('all');
  
  useEffect(() => {
    const syncWarehouseSettings = () => {
      const layout = getWarehouseLayoutSettings();
      setWarehouseLayout(layout);
      setLocationOptions(getLocationOptions(layout));
    };
    syncWarehouseSettings();
    window.addEventListener('storage', syncWarehouseSettings);
    return () => window.removeEventListener('storage', syncWarehouseSettings);
  }, []);

  const shelfOptions = useMemo(
    () => Array.from({ length: Number(warehouseLayout?.shelves || 0) }, (_, idx) => String(idx + 1)),
    [warehouseLayout?.shelves]
  );
  const rowOptions = useMemo(
    () => Array.from({ length: Number(warehouseLayout?.rowsPerShelf || 0) }, (_, idx) => String(idx + 1)),
    [warehouseLayout?.rowsPerShelf]
  );

  const applyShelfRowFilters = useCallback((items = []) => {
    if (shelfFilter === 'all' && rowFilter === 'all') return items;
    const shelfTarget = shelfFilter === 'all' ? null : Number.parseInt(shelfFilter, 10);
    const rowTarget = rowFilter === 'all' ? null : Number.parseInt(rowFilter, 10);
    return items.filter((item) => {
      const locationValue = item?.Location || item?._rawData?.location || item?.location || '';
      const parsed = parseStorageLocation(locationValue, warehouseLayout);
      if (!parsed) return false;
      if (shelfTarget != null && parsed.shelf !== shelfTarget) return false;
      if (rowTarget != null && parsed.row !== rowTarget) return false;
      return true;
    });
  }, [shelfFilter, rowFilter, warehouseLayout]);

  const applyBucketFilter = useCallback((items = []) => {
    if (bucketFilter === 'all') return items;
    return items.filter((item) => {
      const locationValue = item?.Location || item?._rawData?.location || item?.location || '';
      const parsed = parseStorageLocation(locationValue, warehouseLayout);
      const bucketCode = parsed?.bucket || '';
      if (bucketFilter === 'bucketed') return Boolean(bucketCode);
      if (bucketFilter === 'unbucketed') return !bucketCode;
      return bucketCode === bucketFilter;
    });
  }, [bucketFilter, warehouseLayout]);

  /** Full merged list for current search; UI paginates client-side over filtered results. */
  const [fullCombinedList, setFullCombinedList] = useState([]);
  const filteredInventoryList = useMemo(() => {
    const filtered = applyBucketFilter(applyShelfRowFilters(fullCombinedList));
    return [...filtered].sort((a, b) => {
      const seqA = extractItemSequence(a);
      const seqB = extractItemSequence(b);
      if (seqA != null || seqB != null) {
        if (seqA == null) return 1;
        if (seqB == null) return -1;
        return seqA - seqB;
      }
      // Keep relative order stable for rows without item numbers.
      return 0;
    });
  }, [applyShelfRowFilters, applyBucketFilter, fullCombinedList]);
  const filteredOrderIndexMap = useMemo(() => {
    const map = new Map();
    filteredInventoryList.forEach((item, idx) => {
      map.set(getInventoryRowKey(item), idx);
    });
    return map;
  }, [filteredInventoryList]);

  const totalFilteredCount = filteredInventoryList.length;
  const totalPages = Math.max(1, Math.ceil(totalFilteredCount / itemsPerPage) || 1);

  const paginatedInventoryList = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredInventoryList.slice(start, start + itemsPerPage);
  }, [filteredInventoryList, currentPage, itemsPerPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const loadInventoryData = useCallback(async () => {
    const loadGen = ++inventoryLoadGenRef.current;
    setLoading(true);
    setAugmentingList(false);
    setError(null);
    try {
      const fetchWave = async (limit) => {
        const [inventoryResult, manifestResult, hiddenManifestList] = await Promise.all([
          inventoryService.getInventory({
            page: 1,
            limit,
            searchQuery: appliedSearchTerm,
          }),
          productLookupService.getProducts({
            page: 1,
            limit,
            searchQuery: appliedSearchTerm,
            listSelect: 'inventory',
          }),
          inventoryService.getHiddenManifestIds(),
        ]);
        if (loadGen !== inventoryLoadGenRef.current) return null;
        const hiddenManifestIds = new Set(hiddenManifestList);
        const combined = await combineInventoryAndManifest(
          inventoryResult,
          manifestResult,
          appliedSearchTerm,
          hiddenManifestIds
        );
        if (loadGen !== inventoryLoadGenRef.current) return null;
        return { inventoryResult, manifestResult, combined };
      };

      const quickLimit = INVENTORY_QUICK_FETCH_LIMIT;
      const quickWave = await fetchWave(quickLimit);
      if (!quickWave) return;

      let { inventoryResult, manifestResult, combined } = quickWave;
      setFullCombinedList(combined);
      setLoading(false);

      /** Merge image URLs by row key so a slow quick-wave hydrate cannot overwrite a newer full list. */
      const runImageHydrate = (rowsSnapshot) => {
        void (async () => {
          try {
            const withImages = await hydrateInventoryListImages(rowsSnapshot);
            if (loadGen !== inventoryLoadGenRef.current) return;
            const urlByKey = new Map();
            withImages.forEach((r) => {
              const k = getInventoryRowKey(r);
              if (k && r.image_url) urlByKey.set(k, r.image_url);
            });
            if (urlByKey.size === 0) return;
            startTransition(() => {
              setFullCombinedList((prev) =>
                prev.map((row) => {
                  const k = getInventoryRowKey(row);
                  const u = urlByKey.get(k);
                  if (!u) return row;
                  const has =
                    (row.image_url && String(row.image_url).trim()) ||
                    (row['Image URL'] && String(row['Image URL']).trim());
                  if (has) return row;
                  return { ...row, image_url: u };
                })
              );
            });
          } catch (imgErr) {
            console.warn('Inventory image hydrate failed:', imgErr);
          }
        })();
      };
      runImageHydrate(combined);

      const invLen = (inventoryResult.data || []).length;
      const manLen = (manifestResult.data || []).length;
      const needFullBackground =
        quickLimit < INVENTORY_FETCH_LIMIT && (invLen >= quickLimit || manLen >= quickLimit);

      if (needFullBackground) {
        setAugmentingList(true);
        const fullWave = await fetchWave(INVENTORY_FETCH_LIMIT);
        setAugmentingList(false);
        if (!fullWave) return;
        inventoryResult = fullWave.inventoryResult;
        manifestResult = fullWave.manifestResult;
        combined = fullWave.combined;
        if (loadGen !== inventoryLoadGenRef.current) return;
        setFullCombinedList(combined);
        runImageHydrate(combined);
      }

      const invCap = (inventoryResult.data || []).length >= INVENTORY_FETCH_LIMIT;
      const manCap = (manifestResult.data || []).length >= INVENTORY_FETCH_LIMIT;
      if (invCap || manCap) {
        toast.info(
          `Showing up to ${INVENTORY_FETCH_LIMIT.toLocaleString()} items per source. Narrow search if something is missing.`,
          { autoClose: 5000 }
        );
      }
    } catch (err) {
      console.error('Error loading inventory:', err);
      setError('Failed to load inventory data');
      toast.error('Failed to load inventory data. Please try again.');
      setFullCombinedList([]);
    } finally {
      if (loadGen === inventoryLoadGenRef.current) {
        setLoading(false);
        setAugmentingList(false);
      }
    }
  }, [appliedSearchTerm]);

  useEffect(() => {
    void loadInventoryData();
  }, [loadInventoryData]);

  /** Apply search after typing pauses (PostgREST queries run on applied term). Enter still flushes immediately. */
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      searchDebounceRef.current = null;
      setAppliedSearchTerm(searchTerm.trim());
    }, 400);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchTerm]);

  useEffect(() => {
    setSelectedItems(new Set());
    setCurrentPage(1);
  }, [appliedSearchTerm, shelfFilter, rowFilter, bucketFilter]);

  useEffect(() => {
    if (marketplaceExportScope === 'selected' && selectedItems.size === 0) {
      setMarketplaceExportScope('current');
    }
  }, [marketplaceExportScope, selectedItems.size]);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString(); // Simpler date format
    } catch (error) {
      return 'Invalid Date';
    }
  };

  /** Resolve first image URL from image_url (plain URL or JSON { images, videos } or array) */
  const resolveFirstImageUrl = (imageUrl) => {
    if (!imageUrl) return '';
    const s = typeof imageUrl === 'string' ? imageUrl.trim() : '';
    if (!s) return '';
    if (s.startsWith('{')) {
      try {
        const obj = JSON.parse(imageUrl);
        const imgs = obj?.images;
        if (Array.isArray(imgs) && imgs.length > 0) return imgs[0];
      } catch { /* ignore */ }
    }
    if (s.startsWith('[')) {
      try {
        const arr = JSON.parse(imageUrl);
        if (Array.isArray(arr) && arr.length > 0) return arr[0];
      } catch { /* ignore */ }
    }
    return imageUrl;
  };

  // REMOVED: fetchImageFromRainforest function
  // We no longer automatically fetch from Rainforest API to avoid charges
  // Images should come from:
  // 1. manifest_data table (image_url column)
  // 2. api_lookup_cache table (cached from previous scans)
  // If you need to fetch images, do it manually via the Scanner page where it's cached

  const escapeHtml = (text) => {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  };

  /** Same shape as the per-row green print button — ensures Code128 uses FNSKU and layout matches. */
  const inventoryRowToLabelProductInfo = (rowData) => ({
    name: rowData?.['Description'] || rowData?.Description || 'Unknown Product',
    fnsku: rowData?.['Fn Sku'] || rowData?.['FNSKU'] || rowData?.FNSKU || rowData?._rawData?.fnsku || '',
    location: rowData?.['Location'] || rowData?._rawData?.location || 'UNASSIGNED',
    item_number: rowData?.['Item Number'] || rowData?._rawData?.item_number || '',
    asin: rowData?.['B00 Asin'] || rowData?._rawData?.asin || '',
  });

  const getPrimaryProductCode = (productInfo) =>
    productInfo?.asin || productInfo?.upc || productInfo?.fnsku || productInfo?.code || productInfo?.item_number || '';

  /** Prefer FNSKU in Code128 so scans resolve like Scanner labels. */
  const getFnskuForBarcodeLabel = (productInfo) => {
    const raw = String(
      productInfo?.fnsku ?? productInfo?.sku ?? productInfo?.code ?? ''
    ).trim().toUpperCase();
    return raw;
  };

  const getBarcodePayloadForPrint = (productInfo) =>
    getFnskuForBarcodeLabel(productInfo)
    || String(getPrimaryProductCode(productInfo) || '').trim().toUpperCase();

  const getAmazonQrData = (productInfo) => {
    const asin = String(productInfo?.asin || '').trim();
    if (asin) return `https://www.amazon.com/dp/${encodeURIComponent(asin)}`;

    const fallbackCode = String(productInfo?.upc || productInfo?.fnsku || productInfo?.code || '').trim();
    if (fallbackCode) return `https://www.amazon.com/s?k=${encodeURIComponent(fallbackCode)}`;

    return getPrimaryProductCode(productInfo) || String(productInfo?.name || 'Product');
  };

  const stripLocationPrefixFromItemNumber = (itemNumber, location) => {
    const rawItem = String(itemNumber || '').trim();
    const rawLocation = String(location || '').trim();
    if (!rawItem || !rawLocation) return rawItem;

    const normalizedItem = rawItem.toUpperCase();
    const normalizedLocation = rawLocation.toUpperCase();
    const locationPrefix = `${normalizedLocation}-`;

    if (normalizedItem.startsWith(locationPrefix)) {
      return rawItem.slice(rawLocation.length + 1).trim();
    }
    return rawItem;
  };

  const truncateToWordCount = (value, maxWords = 5) => {
    const words = String(value || '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '';
    return words.slice(0, maxWords).join(' ');
  };

  const ZEBRA_LABEL_WIDTH = '1.59in';
  const ZEBRA_LABEL_HEIGHT = '1in';
  const BASIC_INVENTORY_LABEL_WIDTH = '1.59in';
  const BASIC_INVENTORY_LABEL_HEIGHT = '1in';

  const getLabelSizeConfig = (profile = '4x6') => {
    if (profile === '2inch') {
      return {
        width: ZEBRA_LABEL_WIDTH,
        height: ZEBRA_LABEL_HEIGHT,
        titleSize: '7.8pt',
        metaSize: '6pt',
        retailSize: '6pt',
        priceSize: '12pt',
        padding: '0.035in',
        qrSize: '0.44in',
        qrPixelSize: 200,
      };
    }
    return {
      width: '4in',
      height: '6in',
      titleSize: '9pt',
      metaSize: '9pt',
      priceSize: '18pt',
      padding: '0.08in',
      qrSize: '80px',
      qrPixelSize: 80,
    };
  };

  const createBatchPrintLabelHTML = (items, profile = '4x6') => {
    const size = getLabelSizeConfig(profile);
    const discountPercent = getLabelDiscountPercent();
    const isZebraSmall = profile === '2inch';
    const pageWidth = size.width;
    const pageHeight = size.height;
    const pages = items.map((productInfo) => {
      const productCode = getPrimaryProductCode(productInfo);
      const retailPrice = parseFloat(productInfo.price) || 0;
      const ourPrice = retailPrice * ((100 - discountPercent) / 100);
      const qrData = getAmazonQrData(productInfo);
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size.qrPixelSize}x${size.qrPixelSize}&data=${encodeURIComponent(qrData)}`;
      const bcPayload = getBarcodePayloadForPrint(productInfo);
      const barcodeBlock = bcPayload
        ? `<div class="label-barcode-wrap"><svg class="inv-print-barcode" data-bc="${escapeHtml(bcPayload)}"></svg></div>`
        : '';
      return `
        <div class="sheet">
          <div class="label-page">
            <div class="header-row">
              <div class="title-wrap">
                <div class="label-title">${escapeHtml(productInfo.name || 'Product')}</div>
                <div class="label-meta">${escapeHtml(productInfo.asin ? `ASIN: ${productInfo.asin}` : (productInfo.fnsku ? `FNSKU: ${productInfo.fnsku}` : (productInfo.upc ? `UPC: ${productInfo.upc}` : 'CODE')))}</div>
                <div class="label-meta">LOC: ${escapeHtml(formatLocationDisplayForUi(productInfo.location || 'UNASSIGNED'))}</div>
                <div class="label-meta">ITEM: ${escapeHtml(productInfo.item_number || 'N/A')}</div>
              </div>
              <img class="qr" src="${qrCodeUrl}" alt="QR" />
            </div>
            ${barcodeBlock}
            <div class="price-block">
              <div class="retail">Retail: $${retailPrice.toFixed(2)}</div>
              <div class="price">$${ourPrice.toFixed(2)}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (isZebraSmall) {
      const zebraPages = items.map((productInfo) => {
        const productCode = getPrimaryProductCode(productInfo);
        const retailPrice = parseFloat(productInfo.price) || 0;
        const ourPrice = retailPrice * ((100 - discountPercent) / 100);
        const qrData = getAmazonQrData(productInfo);
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size.qrPixelSize}x${size.qrPixelSize}&data=${encodeURIComponent(qrData)}`;
        const bcPayload = getBarcodePayloadForPrint(productInfo);
        const zebraBarcode = bcPayload
          ? `<div class="zebra-bc-wrap"><svg class="inv-print-barcode" data-bc="${escapeHtml(bcPayload)}"></svg></div>`
          : '';
        return `
          <div class="label-print-root">
            <div class="label-print-frame">
              <div class="zebra-main">
                <div class="zebra-title">${escapeHtml(productInfo.name || 'Product')}</div>
                <div class="zebra-meta">${escapeHtml(productInfo.asin ? `ASIN: ${productInfo.asin}` : (productInfo.fnsku ? `FNSKU: ${productInfo.fnsku}` : (productInfo.upc ? `UPC: ${productInfo.upc}` : 'CODE')))}</div>
                <div class="zebra-meta">LOC: ${escapeHtml(formatLocationDisplayForUi(productInfo.location || 'UNASSIGNED'))}</div>
                <div class="zebra-meta">ITEM: ${escapeHtml(productInfo.item_number || 'N/A')}</div>
                ${zebraBarcode}
                <div class="zebra-retail">Retail: $${retailPrice.toFixed(2)}</div>
                <div class="zebra-price">$${ourPrice.toFixed(2)}</div>
              </div>
              <div class="zebra-side">
                <div class="zebra-qr-wrap">
                  <img class="zebra-qr" src="${qrCodeUrl}" alt="QR" />
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');

      return `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Zebra Labels</title>
            <style>
              @page {
                size: ${pageWidth} ${pageHeight};
                margin: 0;
              }

              * {
                box-sizing: border-box;
                font-family: Arial, sans-serif;
              }

              html, body {
                margin: 0;
                padding: 0;
                background: #fff;
              }

              .label-print-root {
                width: ${pageWidth};
                height: ${pageHeight};
                margin: 0;
                padding: 0;
                overflow: hidden;
                position: relative;
                break-after: page;
                page-break-after: always;
              }

              .label-print-root:last-child {
                break-after: auto;
                page-break-after: auto;
              }

              .label-print-frame {
                width: ${pageWidth};
                height: ${pageHeight};
                padding: ${size.padding};
                position: absolute;
                top: 0;
                left: 0;
                display: grid;
                grid-template-columns: minmax(0, 1fr) ${size.qrSize};
                column-gap: 0.03in;
                align-items: stretch;
                overflow: hidden;
              }

              .zebra-main {
                min-width: 0;
                display: flex;
                flex-direction: column;
                gap: 0.01in;
                overflow: hidden;
              }

              .zebra-side {
                width: ${size.qrSize};
                display: flex;
                align-items: center;
                justify-content: center;
              }

              .zebra-title {
                font-size: ${size.titleSize};
                font-weight: 700;
                line-height: 1.12;
                margin: 0;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
                word-break: break-word;
              }

              .zebra-meta {
                font-size: ${size.metaSize};
                line-height: 1.12;
                margin: 0;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              }

              .zebra-qr-wrap {
                display: flex;
                justify-content: center;
                align-items: center;
                margin: 0;
                flex: 0 0 auto;
              }

              .zebra-qr {
                width: ${size.qrSize};
                height: ${size.qrSize};
                object-fit: contain;
                border: 1.5px solid #000;
                background: #fff;
                display: block;
                image-rendering: pixelated;
              }

              .zebra-retail {
                font-size: ${size.retailSize};
                line-height: 1.1;
                color: #334155;
                margin: 0;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              }

              .zebra-price {
                font-size: ${size.priceSize};
                line-height: 1;
                font-weight: 700;
                color: #047857;
                margin: 0;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              }

              .zebra-bc-wrap {
                max-height: 0.2in;
                min-height: 0.14in;
                overflow: hidden;
                margin: 0.01in 0;
                display: flex;
                align-items: center;
              }
              .zebra-bc-wrap svg {
                max-width: 100%;
                height: auto;
                display: block;
              }

              @media screen {
                body {
                  padding: 12px;
                  background: #f1f5f9;
                }

                .label-print-root {
                  margin-bottom: 10px;
                  box-shadow: 0 0 0 1px #94a3b8;
                  background: #fff;
                }
              }

              @media print {
                html, body {
                  width: ${pageWidth} !important;
                  min-width: ${pageWidth} !important;
                  max-width: ${pageWidth} !important;
                  height: ${pageHeight} !important;
                  min-height: ${pageHeight} !important;
                  max-height: ${pageHeight} !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  overflow: hidden !important;
                }

                body {
                  position: relative !important;
                  display: block !important;
                  left: 0 !important;
                  top: 0 !important;
                }

                .label-print-root {
                  margin: 0 !important;
                  padding: 0 !important;
                  page-break-inside: avoid !important;
                  break-inside: avoid !important;
                  transform: none !important;
                  zoom: 1 !important;
                }

                * {
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                }
              }
            </style>
            <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
          </head>
          <body>
            ${zebraPages}
            <script>
              (function () {
                function init() {
                  if (typeof JsBarcode === 'undefined') {
                    setTimeout(init, 40);
                    return;
                  }
                  document.querySelectorAll('.inv-print-barcode').forEach(function (svg) {
                    var v = svg.getAttribute('data-bc');
                    if (!v) return;
                    try {
                      JsBarcode(svg, v, {
                        format: 'CODE128',
                        displayValue: false,
                        margin: 0,
                        height: 18,
                        width: 0.9
                      });
                    } catch (e) {}
                  });
                }
                init();
              })();
            </script>
          </body>
        </html>
      `;
    }

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Inventory Labels</title>
          <style>
            @page {
              size: ${pageWidth} ${pageHeight};
              margin: 0 !important;
            }
            @media print {
              .no-print { display: none; }
              html, body {
                width: ${pageWidth} !important;
                height: ${pageHeight} !important;
                margin: 0 !important;
                padding: 0 !important;
              }
              .sheet { page-break-after: always; break-after: page; }
              .sheet:last-child { page-break-after: auto; break-after: auto; }
            }
            * {
              box-sizing: border-box;
              font-family: Arial, sans-serif;
              color: #000;
              -webkit-font-smoothing: none;
              text-rendering: geometricPrecision;
            }
            html, body { margin: 0; padding: 0; }
            body {
              width: ${pageWidth};
              max-width: ${pageWidth};
              background: #fff;
            }
            .toolbar { padding: 12px; display: flex; justify-content: flex-end; }
            .print-button { background: #2563eb; color: #fff; border: none; border-radius: 6px; padding: 8px 12px; cursor: pointer; }
            .sheet {
              width: ${pageWidth};
              height: ${pageHeight};
              margin: 0;
              padding: 0;
              overflow: hidden;
              position: relative;
            }
            .label-page {
              width: ${pageWidth};
              height: ${pageHeight};
              padding: ${size.padding};
              border: 0;
              display: flex;
              flex-direction: column;
              justify-content: flex-start;
              overflow: hidden;
              margin: 0;
              page-break-inside: avoid;
              break-inside: avoid;
            }
            .header-row { display: flex; gap: 8px; justify-content: space-between; }
            .title-wrap { flex: 1; min-width: 0; }
            .label-title { font-size: ${size.titleSize}; font-weight: 700; line-height: 1.2; margin-bottom: 3px; word-break: break-word; }
            .label-meta { font-size: ${size.metaSize}; line-height: 1.2; margin-bottom: 2px; }
            .qr { width: ${size.qrSize}; height: ${size.qrSize}; border: 1px solid #000; background: #fff; }
            .price-block { text-align: left; margin-top: 3px; }
            .retail { font-size: ${size.metaSize}; color: #444; }
            .price { font-size: ${size.priceSize}; font-weight: 700; color: #047857; line-height: 1.1; }
            .label-barcode-wrap {
              display: flex;
              justify-content: flex-start;
              align-items: center;
              max-height: 0.55in;
              overflow: hidden;
              margin: 4px 0 2px 0;
              flex-shrink: 0;
            }
            .label-barcode-wrap svg {
              max-width: 100%;
              height: auto;
              display: block;
            }
            ${profile === '2inch' ? `
            .toolbar { padding: 8px 6px; }
            .label-page {
              gap: 2px;
            }
            .header-row { gap: 2px; }
            .label-title {
              margin-bottom: 1px;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
              overflow: hidden;
            }
            .label-meta { margin-bottom: 1px; }
            .price-block { margin-top: 2px; }
            .price {
              margin-top: 0;
            }
            ` : ''}
          </style>
          <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
        </head>
        <body>
          <div class="toolbar no-print">
            <button class="print-button" onclick="window.print()">Print Labels</button>
          </div>
          ${pages}
          <script>
            (function () {
              function init() {
                if (typeof JsBarcode === 'undefined') {
                  setTimeout(init, 40);
                  return;
                }
                document.querySelectorAll('.inv-print-barcode').forEach(function (svg) {
                  var v = svg.getAttribute('data-bc');
                  if (!v) return;
                  try {
                    JsBarcode(svg, v, {
                      format: 'CODE128',
                      displayValue: false,
                      margin: 0,
                      height: 32,
                      width: 1.1
                    });
                  } catch (e) {}
                });
              }
              init();
            })();
          </script>
        </body>
      </html>
    `;
  };

  // Create print label HTML (single label wrapper around batch-capable template)
  const createBasicInventoryLabelHTML = (items = []) => {
    const labels = (items || []).map((item) => {
      const fnskuDisplay = String(
        item?.fnsku || item?.['Fn Sku'] || item?.FNSKU || item?._rawData?.fnsku || ''
      ).trim();
      const barcodeRaw = getBarcodePayloadForPrint(item);
      const rawLoc = item?.location || item?.Location || item?._rawData?.location || 'UNASSIGNED';
      return {
        name: escapeHtml(truncateToWordCount(item?.name || item?.Description || 'Unknown Product', 5)),
        barcodeRaw,
        fnskuLine: escapeHtml(fnskuDisplay || 'N/A'),
        location: escapeHtml(formatLocationDisplayForUi(rawLoc)),
        itemNumber: escapeHtml(
          stripLocationPrefixFromItemNumber(
            item?.item_number || item?.itemNumber || item?.['Item Number'] || item?._rawData?.item_number || 'N/A',
            rawLoc
          ) || 'N/A'
        ),
      };
    });

    if (labels.length === 0) {
      return '<html><body><p>No labels to print.</p></body></html>';
    }

    const pages = labels.map((label) => `
      <div class="label-root">
        <div class="label-frame">
          <div class="label-title">${label.name}</div>
          <div class="label-meta">FNSKU: ${label.fnskuLine}</div>
          ${label.barcodeRaw ? `<div class="inv-barcode-wrap"><svg class="inv-basic-barcode" data-bc="${escapeHtml(label.barcodeRaw)}"></svg></div>` : ''}
          <div class="label-meta label-meta-strong">LOC: ${label.location}</div>
          <div class="label-meta label-meta-strong">ITEM: ${label.itemNumber}</div>
        </div>
      </div>
    `).join('');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Inventory Labels</title>
          <style>
            @page {
              size: ${BASIC_INVENTORY_LABEL_WIDTH} ${BASIC_INVENTORY_LABEL_HEIGHT};
              margin: 0;
            }

            * { box-sizing: border-box; font-family: Arial, sans-serif; }

            html, body {
              margin: 0;
              padding: 0;
              background: #fff;
            }

            .label-root {
              width: ${BASIC_INVENTORY_LABEL_WIDTH};
              height: ${BASIC_INVENTORY_LABEL_HEIGHT};
              margin: 0;
              padding: 0;
              overflow: hidden;
              page-break-after: always;
              break-after: page;
              position: relative;
            }

            .label-root:last-child {
              page-break-after: auto;
              break-after: auto;
            }

            .label-frame {
              position: absolute;
              inset: 0;
              padding: 0.045in 0.04in 0.035in 0.025in;
              display: flex;
              flex-direction: column;
              justify-content: flex-start;
              align-items: stretch;
              text-align: left;
              gap: 0.012in;
              overflow: hidden;
            }

            .label-title {
              font-size: 7.75pt;
              line-height: 1.38;
              font-weight: 600;
              margin: 0;
              flex: 0 0 auto;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
              overflow: hidden;
              word-break: break-word;
              /* Fixed two-line box so flex siblings don’t shrink the title (was clipping line 2) */
              min-height: calc(2 * 1.38em);
              max-height: calc(2 * 1.38em);
            }

            .label-meta {
              font-size: 8.5pt;
              line-height: 1.15;
              margin: 0;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              font-weight: 500;
            }

            .label-meta-strong {
              font-size: 10.4pt;
              line-height: 1.16;
              font-weight: 600;
            }

            .inv-barcode-wrap {
              flex: 0 0 auto;
              display: flex;
              justify-content: flex-start;
              align-items: center;
              max-height: 0.24in;
              min-height: 0.16in;
              overflow: hidden;
              margin: 0.008in 0;
            }
            .inv-barcode-wrap svg {
              max-width: 100%;
              height: auto;
              display: block;
            }

            @media print {
              html, body {
                width: ${BASIC_INVENTORY_LABEL_WIDTH} !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: visible !important;
              }

              body {
                width: auto !important;
                height: auto !important;
              }

              .label-root {
                transform: none !important;
                zoom: 1 !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
            }
          </style>
          <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
        </head>
        <body>
          ${pages}
          <script>
            (function () {
              function init() {
                if (typeof JsBarcode === 'undefined') {
                  setTimeout(init, 40);
                  return;
                }
                document.querySelectorAll('.inv-basic-barcode').forEach(function (svg) {
                  var v = svg.getAttribute('data-bc');
                  if (!v) return;
                  try {
                    JsBarcode(svg, v, {
                      format: 'CODE128',
                      displayValue: false,
                      margin: 0,
                      height: 18,
                      width: 0.92
                    });
                  } catch (e) {}
                });
              }
              init();
            })();
          </script>
        </body>
      </html>
    `;
  };

  const createPrintLabelHTML = (productInfo) => {
    if (!productInfo) {
      return '<html><body><p>Error: Product information not available</p></body></html>';
    }
    return createBasicInventoryLabelHTML([productInfo]);
  };

  const openPrintWindow = (html) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Could not open print window. Check popup blocker settings.');
      return null;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    return printWindow;
  };
  
  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
  };

  const flushAppliedSearch = useCallback(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
    setAppliedSearchTerm(searchTerm.trim());
  }, [searchTerm]);

  const handleSearchSubmit = () => {
    flushAppliedSearch();
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      flushAppliedSearch();
    }
  };

  // Reset filters
  const handleResetFilters = () => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
    setSearchTerm('');
    setAppliedSearchTerm('');
    setShelfFilter('all');
    setRowFilter('all');
    setBucketFilter('all');
    setCurrentPage(1);
    toast.info('Filters have been reset to default values.');
  };

  const handleItemsPerPageChange = (e) => {
    const next = Number(e.target.value);
    if (!INVENTORY_PAGE_SIZE_OPTIONS.includes(next)) return;
    try {
      localStorage.setItem(ITEMS_PER_PAGE_STORAGE_KEY, String(next));
    } catch {
      /* ignore */
    }
    setItemsPerPage(next);
    setCurrentPage(1);
  };

  const handlePageChange = (page) => {
    const p = Number(page);
    if (!Number.isFinite(p) || p < 1 || p > totalPages) return;
    setCurrentPage(p);
  };

  const getSelectedProductRows = () =>
    filteredInventoryList
      .filter((p) => selectedItems.has(getInventoryRowKey(p)))
      .sort((a, b) => {
        const seqA = extractItemSequence(a);
        const seqB = extractItemSequence(b);
        if (seqA != null || seqB != null) {
          if (seqA == null) return 1;
          if (seqB == null) return -1;
        return seqA - seqB; // Lower sequence = earlier scanned item.
        }
        const idxA = filteredOrderIndexMap.get(getInventoryRowKey(a)) ?? Number.MAX_SAFE_INTEGER;
        const idxB = filteredOrderIndexMap.get(getInventoryRowKey(b)) ?? Number.MAX_SAFE_INTEGER;
        return idxA - idxB;
      });

  const handlePrintSelectedBasicLabels = () => {
    const rows = getSelectedProductRows();
    if (rows.length === 0) {
      toast.warning('Select at least one row to print labels.');
      return;
    }
    const labelItems = rows.map((row) => inventoryRowToLabelProductInfo(row));
    const printWindow = openPrintWindow(createBasicInventoryLabelHTML(labelItems));
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  };

  /** Fetch all products for export (current filters) */
  const fetchAllProductsForExport = useCallback(async () => {
    const [inventoryResult, manifestResult, hiddenManifestList] = await Promise.all([
      inventoryService.getInventory({
        page: 1,
        limit: EXPORT_ALL_LIMIT,
        searchQuery: appliedSearchTerm,
      }),
      productLookupService.getProducts({
        page: 1,
        limit: EXPORT_ALL_LIMIT,
        searchQuery: appliedSearchTerm,
        listSelect: 'inventory',
      }),
      inventoryService.getHiddenManifestIds(),
    ]);
    const combined = await combineInventoryAndManifest(
      inventoryResult,
      manifestResult,
      appliedSearchTerm,
      new Set(hiddenManifestList)
    );
    const withImages = await hydrateInventoryListImages(combined);
    return applyBucketFilter(applyShelfRowFilters(withImages));
  }, [appliedSearchTerm, applyShelfRowFilters, applyBucketFilter]);

  const handleMarketplaceExportDownload = async () => {
    setIsExportingMarketplace(true);
    try {
      let list;
      if (marketplaceExportScope === 'all') {
        list = await fetchAllProductsForExport();
      } else if (marketplaceExportScope === 'selected') {
        list = getSelectedProductRows();
      } else {
        list = paginatedInventoryList;
      }
      if (!list || list.length === 0) {
        toast.warning('No products to export.');
        return;
      }
      await exportMarketplace(list, marketplaceExportFormat, marketplaceUniversalFormat);
      toast.success(
        `Exported ${list.length} product(s) for ${MARKETPLACE_EXPORT_LABELS[marketplaceExportFormat] || marketplaceExportFormat}.`
      );
      setShowMarketplaceExportModal(false);
    } catch (err) {
      console.error('Marketplace export failed:', err);
      toast.error('Export failed. Please try again.');
    } finally {
      setIsExportingMarketplace(false);
    }
  };

  // Handle adding stock - open modal
  const handleAddStock = () => {
    setShowAddStockModal(true);
  };

  // Handle adding new items through the modal
  const handleAddItems = async (newItems, options = {}) => {
    const printLabels = options?.printLabels !== false;
    const profile = options?.labelPrinterProfile || getLabelPrinterProfile();
    const labelCopyMode = options?.labelCopyMode || 'one_per_item';
    const labelsToPrint = [];
    let successCount = 0;
    let failureCount = 0;

    try {
      for (const newItem of newItems) {
        const sku = String(newItem.sku || '').trim();
        const name = String(newItem.name || '').trim();
        const location = String(newItem.location || '').trim().toUpperCase();
        const quantity = parseInt(newItem.quantity, 10) || 0;
        const category = newItem.category || 'Uncategorized';

        if (!sku || !name || !location || quantity < 1) {
          failureCount += 1;
          continue;
        }
        if (!isValidLocationCode(location, warehouseLayout)) {
          failureCount += 1;
          toast.error(`Invalid location "${location}". Update Warehouse Layout settings or select a valid location.`);
          continue;
        }

        const existingInventory = await inventoryService.getInventoryBySku(sku);
        const itemNumber = existingInventory?.item_number || getNextItemNumber(location);
        const result = await inventoryService.addOrUpdateInventory({
          sku,
          name,
          quantity,
          location,
          category,
          condition: 'New',
          item_number: itemNumber,
        });

        if (!result) {
          failureCount += 1;
          continue;
        }

        successCount += 1;
        if (printLabels) {
          const copies = labelCopyMode === 'per_quantity' ? quantity : 1;
          for (let i = 0; i < copies; i += 1) {
            labelsToPrint.push({
              name,
              fnsku: sku,
              price: result.price ?? 0,
              location,
              item_number: copies > 1 ? `${itemNumber}-${String(i + 1).padStart(2, '0')}` : itemNumber,
            });
          }
        }
      }

      if (printLabels && labelsToPrint.length > 120) {
        const proceed = window.confirm(
          `You are about to print ${labelsToPrint.length} labels. Continue?`
        );
        if (!proceed) {
          toast.info('Printing canceled. Inventory was still added.');
          await loadInventoryData();
          return;
        }
      }

      if (labelsToPrint.length > 0) {
        const printWindow = openPrintWindow(createBatchPrintLabelHTML(labelsToPrint, profile));
        if (printWindow) {
          setTimeout(() => {
            printWindow.focus();
            printWindow.print();
          }, 500);
        }
      }

      await loadInventoryData();
      if (successCount > 0) {
        toast.success(`Added ${successCount} item(s) to inventory.${printLabels ? ` Prepared ${labelsToPrint.length} label(s).` : ''}`);
      }
      if (failureCount > 0) {
        toast.warning(`${failureCount} row(s) could not be added. Check SKU/name/location values.`);
      }
    } catch (error) {
      console.error('Error adding inventory items:', error);
      toast.error('Failed to add items to inventory. Please verify the data and try again.');
    }
  };

  // Remove from inventory list only (no DELETE of inventory or manifest_data rows in Supabase)
  const handleDeleteItem = async (item) => {
    const rowKey = getInventoryRowKey(item);
    if (!rowKey) {
      toast.error('Cannot remove: missing row id');
      return;
    }
    const label = getInventoryDisplayName(item);
    if (!window.confirm(
      `Remove "${label}" from your inventory list?\n\nYour product catalog and scan cache are not deleted — this only hides the row here. Scanning the item again can show full details.`
    )) {
      return;
    }

    setIsDeleting(true);
    try {
      let result;
      if (item.source === 'inventory_table' && item.id != null) {
        result = await inventoryService.hideInventoryItem(item.id);
      } else if (item.source === 'manifest_data' && item.id != null) {
        result = await inventoryService.hideManifestFromInventoryList(item.id);
      } else {
        toast.error('Cannot remove: item source unknown or missing ID');
        return;
      }

      if (result?.success === true) {
        setFullCombinedList((prev) => prev.filter((i) => getInventoryRowKey(i) !== rowKey));
        setSelectedItems((prev) => {
          const next = new Set(prev);
          next.delete(rowKey);
          return next;
        });

        toast.success(`"${label}" removed from list (catalog and scan data kept)`);
        loadInventoryData();
      } else {
        throw new Error(normalizeRemoveError(result?.error));
      }
    } catch (error) {
      console.error('Error removing inventory row:', error);
      toast.error(`Failed to remove from list: ${error.message || 'Unknown error'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Bulk remove from list only (no DELETE in Supabase for inventory or manifest_data)
  const handleBulkDelete = async () => {
    if (selectedItems.size === 0) {
      toast.warning('Please select at least one item to remove');
      return;
    }

    const selectedArray = Array.from(selectedItems);
    const selectedProducts = filteredInventoryList.filter((p) => selectedArray.includes(getInventoryRowKey(p)));
    const itemNames = selectedProducts.map(p => p.Description || 'Unknown').join(', ');
    
    if (!window.confirm(
      `Remove ${selectedItems.size} item(s) from your inventory list?\n\n${itemNames}\n\nNothing is deleted from the database; rows are only hidden from this view.`
    )) {
      return;
    }

    setIsDeleting(true);
    try {
      const inventoryItems = selectedProducts.filter(p => p.source === 'inventory_table' && p.id);
      const manifestItems = selectedProducts.filter(p => p.source === 'manifest_data' && p.id);

      let removedCount = 0;
      const errors = [];

      if (inventoryItems.length > 0) {
        const inventoryIds = inventoryItems.map(i => i.id);
        const result = await inventoryService.hideInventoryItems(inventoryIds);
        if (result.success) {
          removedCount += result.hiddenCount ?? 0;
        } else {
          errors.push(normalizeRemoveError(result.error) || `Failed to hide ${inventoryItems.length} inventory row(s)`);
        }
      }

      if (manifestItems.length > 0) {
        const manifestIds = manifestItems.map((i) => i.id);
        const result = await inventoryService.hideManifestFromInventoryListBulk(manifestIds);
        if (result.success) {
          removedCount += result.hiddenCount ?? 0;
        } else {
          errors.push(normalizeRemoveError(result.error) || `Failed to hide ${manifestItems.length} manifest row(s) from list`);
        }
      }

      if (removedCount > 0) {
        toast.success(`Removed ${removedCount} item(s) from list (data kept in database)`);
        setSelectedItems(new Set());
        loadInventoryData();
      }

      if (errors.length > 0) {
        toast.error(errors.join(' '));
      }
    } catch (error) {
      console.error('Error in bulk remove:', error);
      toast.error(`Failed to remove items: ${error.message || 'Unknown error'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  /** Soft-hide every row in the current merged list (respects search). Does not DELETE catalog or api_lookup_cache. */
  const handleDeleteAllFromInventoryList = async () => {
    const list = fullCombinedList;
    if (list.length === 0) {
      toast.info('Nothing to remove.');
      return;
    }

    const inventoryRows = list.filter((p) => p.source === 'inventory_table' && p.id != null);
    const manifestRows = list.filter((p) => p.source === 'manifest_data' && p.id != null);
    const n = list.length;

    const firstConfirm =
      `Remove ALL ${n} item(s) from your inventory list?\n\n` +
      `This uses the items currently loaded (including your search filter). Up to ${INVENTORY_FETCH_LIMIT.toLocaleString()} rows are loaded per source.\n\n` +
      `• manifest_data and api_lookup_cache are NOT deleted — products and scan history stay in the database.\n` +
      `• Only this inventory view is cleared (rows are hidden, not erased).\n` +
      `• Scanning or adding stock again can bring items back with full details.\n\n` +
      `Press OK for the next confirmation step.`;

    if (!window.confirm(firstConfirm)) {
      return;
    }

    if (!window.confirm(`Final confirmation: remove ${n} item(s) from the list only?`)) {
      return;
    }

    setIsDeleting(true);
    try {
      let removedCount = 0;
      const errors = [];

      if (inventoryRows.length > 0) {
        const ids = inventoryRows.map((i) => i.id);
        const result = await inventoryService.hideInventoryItems(ids);
        if (result.success) {
          removedCount += result.hiddenCount ?? 0;
          if (result.hiddenCount != null && result.hiddenCount < ids.length) {
            toast.warning(
              `${ids.length - result.hiddenCount} inventory row(s) could not be updated (wrong user or missing column hidden_from_inventory_list).`,
              { autoClose: 8000 }
            );
          }
        } else {
          errors.push(normalizeRemoveError(result.error) || 'Inventory bulk hide failed');
        }
      }

      if (manifestRows.length > 0) {
        const manifestIds = manifestRows.map((i) => i.id);
        const result = await inventoryService.hideManifestFromInventoryListBulk(manifestIds);
        if (result.success) {
          removedCount += result.hiddenCount ?? 0;
        } else {
          errors.push(normalizeRemoveError(result.error) || 'Manifest bulk hide failed');
        }
      }

      if (removedCount > 0) {
        toast.success(`Removed ${removedCount} item(s) from the list. Catalog and scan data were not deleted.`);
        setSelectedItems(new Set());
        loadInventoryData();
      }

      if (errors.length > 0) {
        toast.error(errors.join(' '), { autoClose: 8000 });
      } else if (removedCount === 0 && n > 0) {
        toast.error('No rows were updated. Check the database migration for hidden_from_inventory_list and inventory_hidden_manifest.');
      }
    } catch (error) {
      console.error('Error removing all from inventory list:', error);
      toast.error(`Failed: ${error.message || 'Unknown error'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle item selection
  const handleSelectItem = (rowKey) => {
    if (!rowKey) return;
    const newSelected = new Set(selectedItems);
    if (newSelected.has(rowKey)) {
      newSelected.delete(rowKey);
    } else {
      newSelected.add(rowKey);
    }
    setSelectedItems(newSelected);
  };

  // Select all rows on the current page (pagination).
  const handleSelectAll = () => {
    const keysOnPage = paginatedInventoryList.map(getInventoryRowKey).filter(Boolean);
    const allSelected =
      keysOnPage.length > 0 && keysOnPage.every((k) => selectedItems.has(k));
    if (allSelected) {
      const next = new Set(selectedItems);
      keysOnPage.forEach((k) => next.delete(k));
      setSelectedItems(next);
      return;
    }
    const next = new Set(selectedItems);
    keysOnPage.forEach((k) => next.add(k));
    setSelectedItems(next);
  };

  const selectedOnPageCount = paginatedInventoryList.filter((p) =>
    selectedItems.has(getInventoryRowKey(p))
  ).length;
  const allOnPageSelected =
    paginatedInventoryList.length > 0 && selectedOnPageCount === paginatedInventoryList.length;
  const someOnPageSelected =
    selectedOnPageCount > 0 && selectedOnPageCount < paginatedInventoryList.length;

  const patchInventoryMetrics = useCallback(async (rowData, quantity, price) => {
    const key = getInventoryRowKey(rowData);
    if (!key || rowData.id == null) {
      return { success: false, error: 'Cannot save this row' };
    }
    if (rowData.source === 'inventory_table') {
      const r = await inventoryService.patchInventoryItem(rowData.id, { quantity, price });
      if (r.success) {
        setFullCombinedList((prev) =>
          prev.map((row) => {
            if (getInventoryRowKey(row) !== key) return row;
            const next = {
              ...row,
              Quantity: quantity,
              MSRP: price,
            };
            if (row._rawData && typeof row._rawData === 'object') {
              next._rawData = { ...row._rawData, quantity, price };
            }
            return next;
          })
        );
        toast.success('Saved quantity and price');
      }
      return r.success ? { success: true } : { success: false, error: r.error || 'Update failed' };
    }
    if (rowData.source === 'manifest_data') {
      const r = await productLookupService.updateManifestQuantityAndPrice(rowData.id, {
        quantity,
        price,
      });
      if (r.success) {
        setFullCombinedList((prev) =>
          prev.map((row) => {
            if (getInventoryRowKey(row) !== key) return row;
            return { ...row, Quantity: quantity, MSRP: price };
          })
        );
        toast.success('Saved quantity and price');
      }
      return r.success ? { success: true } : { success: false, error: r.error || 'Update failed' };
    }
    return { success: false, error: 'This row cannot be edited here' };
  }, []);

  // Define table columns
  const columns = [
    {
      id: 'select',
      header: () => (
        <div className="flex items-center">
          <input
            type="checkbox"
            aria-label="Select all rows on this page"
            checked={allOnPageSelected}
            ref={(el) => {
              if (el) el.indeterminate = someOnPageSelected;
            }}
            onChange={handleSelectAll}
            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ),
      accessor: 'select',
      cell: (props) => {
        const rowData = props.row.original;
        const rowKey = getInventoryRowKey(rowData);
        if (!rowKey) return null;
        return (
          <input
            type="checkbox"
            aria-label={`Select ${rowData.Description || 'row'}`}
            checked={selectedItems.has(rowKey)}
            onChange={() => handleSelectItem(rowKey)}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
          />
        );
      },
    },
    {
      header: 'Product Description',
      accessor: 'Description',
      cell: (props) => {
        const rowData = props.row.original;
            const rawImageUrl = rowData.image_url ||
                           rowData._rawData?.image_url ||
                           (rowData.source === 'manifest_data' ? (rowData['Image URL'] || rowData.image_url) : '') ||
                           '';
            const imageUrl = resolveFirstImageUrl(rawImageUrl);
        // console.log("[Inventory.jsx Cell] Product Description Data:", rowData.Description, "LPN:", rowData['X-Z ASIN'], "Image:", imageUrl);
        return (
          <div className="flex items-start space-x-3">
            {imageUrl && (
              <div className="flex-shrink-0">
                <img
                  src={imageUrl}
                  alt={rowData.Description || 'Product'}
                  width={64}
                  height={64}
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                  className="w-16 h-16 object-contain border border-gray-200 rounded bg-white"
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate max-w-xs" title={rowData.Description}>{rowData.Description || 'N/A'}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">LPN: {rowData['X-Z ASIN'] || 'N/A'}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">FNSKU: {rowData['Fn Sku'] || 'N/A'}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">ASIN: {rowData['B00 Asin'] || 'N/A'}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Location: {formatLocationDisplayForUi(rowData['Location'] || rowData._rawData?.location || 'N/A')}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Item #: {
                  stripLocationPrefixFromItemNumber(
                    rowData['Item Number'] || rowData._rawData?.item_number || '',
                    rowData['Location'] || rowData._rawData?.location || ''
                  ) || 'N/A'
                }
              </div>
            </div>
          </div>
        );
      },
    },
    {
      header: 'Qty / MSRP',
      accessor: 'Quantity',
      cell: (props) => (
        <InventoryQtyPriceEditor
          rowData={props.row.original}
          patchMetrics={patchInventoryMetrics}
        />
      ),
    },
    {
      header: 'Category',
      accessor: 'Category',
    },
    {
      header: 'Actions',
      accessor: 'actions',
      cell: (props) => {
        const rowData = props.row.original;
        
        // Handle print label
        const handlePrintLabel = (e) => {
          e.stopPropagation();

          const productInfo = inventoryRowToLabelProductInfo(rowData);
          const printLabelHTML = createPrintLabelHTML(productInfo);
          const printWindow = openPrintWindow(printLabelHTML);
          if (printWindow) {
            printWindow.onload = () => {
              printWindow.print();
            };
          }
        };
        
        return (
          <div className="flex items-center justify-end space-x-1">
            {rowData['B00 Asin'] && (
              <button
                onClick={(e) => { 
                  e.stopPropagation();
                  window.open(`https://www.amazon.com/dp/${rowData['B00 Asin']}`, '_blank');
                }}
                className="p-1 text-yellow-600 hover:text-yellow-800"
                title="View on Amazon"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path d="M10.75 1.915H13.25V4.18H11.875V2.95833H9.97917V1.915H10.75Z" />
                  <path fillRule="evenodd" d="M3.8075 18C3.62783 18 3.4725 17.9083 3.38083 17.765C3.28917 17.6217 0.8075 13.9867 0.8075 10.99C0.8075 8.605 1.57417 6.78667 3.1575 5.62C4.23583 4.78167 5.6075 4.375 7.18083 4.375C9.27417 4.375 10.5575 5.13167 11.4575 6.105C12.3575 7.07833 12.8075 8.45 12.8075 10.62C12.8075 10.8733 12.7908 11.1783 12.7575 11.62C12.6825 12.4367 12.4825 13.305 11.9742 14.335C11.5575 15.2033 11.0075 15.96 10.3242 16.55C9.64083 17.1483 8.8075 17.5767 7.78083 17.795C7.53583 17.8367 7.18083 17.86 6.68083 17.86C6.18083 17.86 5.77417 17.8283 5.47417 17.765C5.34917 17.7433 4.99083 17.7033 4.76583 17.63C4.19917 17.49 3.74083 17.2567 3.39083 16.915C2.89083 16.415 2.58583 15.7217 2.58583 14.785C2.58583 13.99 2.93583 13.2517 3.42417 12.785C3.9125 12.3183 4.62417 12.085 5.5575 12.085C6.32417 12.085 6.94917 12.2517 7.4075 12.585C7.87417 12.9183 8.19083 13.405 8.3575 14.04C8.3825 14.155 8.4075 14.2867 8.4075 14.4317C8.4075 14.685 8.33583 14.8967 8.19917 15.065C8.05417 15.2333 7.85417 15.3183 7.59917 15.3183C7.39917 15.3183 7.22417 15.255 7.07417 15.1233C6.91583 15.0083 6.76583 14.785 6.62417 14.4517C6.4825 14.1183 6.31583 13.8733 6.12417 13.715C5.9325 13.5567 5.7075 13.4783 5.44917 13.4783C4.9325 13.4783 4.5075 13.6533 4.17417 14.0033C3.8325 14.3533 3.66583 14.8183 3.66583 15.4C3.66583 15.9167 3.81583 16.3233 4.11583 16.62C4.41583 16.9167 4.82417 17.065 5.34083 17.065C5.7075 17.065 6.02417 16.99 6.29083 16.84C6.5575 16.69 6.79083 16.4817 6.99083 16.215C7.19083 15.9483 7.32417 15.6433 7.39083 15.295C7.4575 14.9467 7.49083 14.5733 7.49083 14.1767C7.49083 12.4717 7.07417 11.1367 6.24083 10.1733C5.4075 9.21 4.2575 8.72833 2.79083 8.72833C1.44083 8.72833 0.374167 9.15667 -0.509167 10.0133C-1.2825 10.7517 -1.67417 11.8683 -1.67417 13.3633C-1.67417 15.8717 -0.450833 18.8117 0.990833 20.015C1.11583 20.1583 1.17417 20.2817 1.17417 20.37C1.17417 20.5233 1.1075 20.6217 0.9825 20.6217L0.974167 20.62Z" clipRule="evenodd" />
                </svg>
              </button>
            )}
            <button
              onClick={handlePrintLabel}
              className="p-1 text-green-600 hover:text-green-800"
              title="Print Label"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.007M6.34 18H5.332m0 0a3.001 3.001 0 00-1.743-2.634M5.332 18h13.305m0 0a3.004 3.004 0 001.743-2.634M18.637 11.03a1.5 1.5 0 00-1.5-1.5h-1.382m0 0a3.004 3.004 0 00-1.792-2.549M15.755 9.57l-1.5-1.5m0 0a3.004 3.004 0 00-1.743-2.634m1.743 2.634L12 6.75m-6.637 4.28a3.004 3.004 0 001.743 2.634l-.229 2.523M19.5 12c.243 0 .477.03.707.085M19.5 12l-1.5-1.5m1.5 1.5l-1.5 1.5" />
              </svg>
            </button>
            <button
                onClick={(e) => { 
                  e.stopPropagation(); 
                  handleDeleteItem(rowData); 
                }}
                className="p-1 text-red-600 hover:text-red-800"
                title="Remove from list (keeps data in database)"
                disabled={isDeleting}
            >
                <TrashIcon className="h-5 w-5" />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      {error && (
        <div
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            <Button variant="outline" className="shrink-0 self-start sm:self-auto" onClick={() => void loadInventoryData()}>
              Retry
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Inventory</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Track and manage stock levels across all locations
            {augmentingList && (
              <span className="ml-2 text-blue-600 dark:text-blue-400">Loading additional rows…</span>
            )}
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap items-stretch sm:items-center">
          {selectedItems.size > 0 && (
            <span className="text-sm text-gray-600 dark:text-gray-400 self-center">
              {selectedItems.size} selected
            </span>
          )}
          {selectedItems.size > 0 && (
            <Button 
              variant="danger"
              className="flex items-center"
              onClick={handleBulkDelete}
              disabled={isDeleting}
            >
              <TrashIcon className="h-5 w-5 mr-2" />
              Remove selected ({selectedItems.size})
            </Button>
          )}
          {fullCombinedList.length > 0 && (
            <Button
              variant="danger"
              className="flex items-center"
              onClick={handleDeleteAllFromInventoryList}
              disabled={isDeleting}
              title="Hides every row in the current loaded list (respects search). Does not delete products or scan cache."
            >
              <TrashIcon className="h-5 w-5 mr-2" />
              Remove all from list ({fullCombinedList.length})
            </Button>
          )}
          {selectedItems.size > 0 && (
            <Button
              variant="outline"
              className="flex items-center"
              onClick={handlePrintSelectedBasicLabels}
            >
              Print selected labels
            </Button>
          )}
          <Button 
            variant="outline" 
            className="flex items-center"
            onClick={() => setShowMarketplaceExportModal(true)}
          >
            <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
            Export for marketplace
          </Button>
          <Button 
            variant="primary"
            className="flex items-center"
            onClick={handleAddStock}
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            Add Stock
          </Button>
        </div>
      </div>
      
      <Card>
        <div className="p-4">
          <div className="flex-1 relative mb-4">
            <input
              type="text"
              placeholder="Search by LPN, FNSKU, ASIN, or Description..."
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              value={searchTerm}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKeyDown}
            />
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-2">
            <select
              value={shelfFilter}
              onChange={(e) => {
                setShelfFilter(e.target.value);
              }}
              className="px-3 py-2 border border-gray-300 rounded-md bg-white dark:bg-gray-800 dark:border-gray-600"
            >
              <option value="all">All shelves</option>
              {shelfOptions.map((shelf) => (
                <option key={shelf} value={shelf}>
                  {warehouseLayout.shelfPrefix}{shelf}
                </option>
              ))}
            </select>
            <select
              value={rowFilter}
              onChange={(e) => {
                setRowFilter(e.target.value);
              }}
              className="px-3 py-2 border border-gray-300 rounded-md bg-white dark:bg-gray-800 dark:border-gray-600"
            >
              <option value="all">All rows</option>
              {rowOptions.map((row) => (
                <option key={row} value={row}>
                  {warehouseLayout.rowPrefix}{row}
                </option>
              ))}
            </select>
            <select
              value={bucketFilter}
              onChange={(e) => {
                setBucketFilter(e.target.value);
              }}
              className="px-3 py-2 border border-gray-300 rounded-md bg-white dark:bg-gray-800 dark:border-gray-600"
            >
              <option value="all">All buckets</option>
              <option value="bucketed">In bucket only</option>
              <option value="unbucketed">No bucket</option>
              {BUCKET_CODE_OPTIONS.map((bucketCode) => (
                <option key={bucketCode} value={bucketCode}>
                  {bucketCode}
                </option>
              ))}
            </select>
            <Button variant="outline" onClick={handleResetFilters}>
              Reset filters
            </Button>
          </div>
        </div>
        
        {loading && filteredInventoryList.length === 0 ? (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
        ) : !loading && filteredInventoryList.length === 0 && !error ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No inventory items found. Try a different search.
            </div>
        ) : (
            <>
              <Table 
                  data={paginatedInventoryList}
                  columns={columns}
                  loading={loading && filteredInventoryList.length === 0}
                  pagination={false}
                  virtualized
                  getRowId={(row) => getInventoryRowKey(row)}
                  estimatedRowHeight={176}
                  virtualOverscan={10}
                  noDataMessage="No inventory items found. Try a different search."
              />
            </>
        )}

        {!loading && filteredInventoryList.length > 0 && (
          <div className="p-4 flex flex-col gap-4 border-t border-gray-200 dark:border-gray-700 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <label htmlFor="inventory-items-per-page" className="font-medium text-gray-700 dark:text-gray-300">
                Rows per page
              </label>
              <select
                id="inventory-items-per-page"
                value={itemsPerPage}
                onChange={handleItemsPerPageChange}
                className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              >
                {INVENTORY_PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span className="text-gray-500 dark:text-gray-500">
                Showing{' '}
                {totalFilteredCount === 0
                  ? '0'
                  : `${((currentPage - 1) * itemsPerPage + 1).toLocaleString()}–${Math.min(
                      currentPage * itemsPerPage,
                      totalFilteredCount
                    ).toLocaleString()}`}{' '}
                of {totalFilteredCount.toLocaleString()}
                {augmentingList ? ' · updating list…' : ''}
              </span>
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
              totalItems={totalFilteredCount}
              itemsPerPage={itemsPerPage}
              className="mt-0"
            />
          </div>
        )}
      </Card>

      {/* Marketplace export modal */}
      <Modal
        isOpen={showMarketplaceExportModal}
        onClose={() => !isExportingMarketplace && setShowMarketplaceExportModal(false)}
        title="Export for marketplace"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Format</label>
            <select
              value={marketplaceExportFormat}
              onChange={(e) => setMarketplaceExportFormat(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              <option value="facebook">Facebook Marketplace (template + image pack)</option>
              <option value="shopify">Shopify</option>
              <option value="whatnot">Whatnot</option>
              <option value="ebay">eBay (Product feed)</option>
              <option value="commentsold">CommentSold (CSV, classic product import)</option>
              <option value="universal">Universal (all columns)</option>
            </select>
          </div>
          {marketplaceExportFormat === 'commentsold' && (
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
              Matches CommentSold&apos;s classic CSV import: public image URLs (comma-separated in{' '}
              <span className="font-medium">Product Images</span>), no duplicate SKUs, and text fields
              stripped of quotes, slashes, and commas. Required columns are included;{' '}
              <span className="font-medium">Inventory Cost</span> uses your product cost when present,
              otherwise 60% of retail as a placeholder—edit before import if needed. Official templates
              and &quot;new product screen&quot; column names:{' '}
              <a
                href="https://help.commentsold.com/hc/en-us/articles/4403921966612-Import-Products-Using-CSV-Files-on-Classic-Product-Screens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 underline"
              >
                Classic import help
              </a>
              {' · '}
              <a
                href="https://help.commentsold.com/hc/en-us/articles/43440522690452-Import-Products-Using-a-CSV-File-on-New-Product-Screens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 underline"
              >
                New product screens
              </a>
              .
            </p>
          )}
          {marketplaceExportFormat === 'universal' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">File type</label>
              <select
                value={marketplaceUniversalFormat}
                onChange={(e) => setMarketplaceUniversalFormat(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                <option value="xlsx">Excel (.xlsx)</option>
                <option value="csv">CSV</option>
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Scope</label>
            <div className="space-y-2">
              {selectedItems.size > 0 && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="exportScope"
                    checked={marketplaceExportScope === 'selected'}
                    onChange={() => setMarketplaceExportScope('selected')}
                    className="rounded border-gray-300"
                  />
                  <span className="text-gray-700 dark:text-gray-300">Selected rows ({selectedItems.size})</span>
                </label>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="exportScope"
                  checked={marketplaceExportScope === 'current'}
                  onChange={() => setMarketplaceExportScope('current')}
                  className="rounded border-gray-300"
                />
                <span className="text-gray-700 dark:text-gray-300">
                  Current page ({paginatedInventoryList.length} of {itemsPerPage} rows on this page)
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="exportScope"
                  checked={marketplaceExportScope === 'all'}
                  onChange={() => setMarketplaceExportScope('all')}
                  className="rounded border-gray-300"
                />
                <span className="text-gray-700 dark:text-gray-300">All (current filters)</span>
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowMarketplaceExportModal(false)} disabled={isExportingMarketplace}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleMarketplaceExportDownload} disabled={isExportingMarketplace}>
              {isExportingMarketplace ? 'Exporting…' : 'Download'}
            </Button>
          </div>
        </div>
      </Modal>

      <AddStockModal 
        isOpen={showAddStockModal}
        onClose={() => setShowAddStockModal(false)}
        onAddItems={handleAddItems} 
      />
    </div>
  );
};

export default Inventory;