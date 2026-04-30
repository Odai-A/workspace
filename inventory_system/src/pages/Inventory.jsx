import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowDownTrayIcon,
  ChevronDownIcon,
  XMarkIcon,
  AdjustmentsHorizontalIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Table from '../components/ui/Table';
import Pagination from '../components/ui/Pagination';
import InventoryLevelBadge from '../components/inventory/InventoryLevelBadge';
import AddStockModal from '../components/inventory/AddStockModal';
import Modal from '../components/ui/Modal';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';
import { productLookupService, apiCacheService } from '../services/databaseService';
import { inventoryService, supabase, formatSupabaseError } from '../config/supabaseClient';
import { exportMarketplace } from '../utils/marketplaceExport';
import axios from 'axios';
import { getLabelDiscountPercent, getLabelPrinterProfile } from '../utils/labelSettings';
import {
  getLocationOptions,
  getNextItemNumber,
  getWarehouseLayoutSettings,
  isValidLocationCode,
} from '../utils/warehouseSettings';

const INVENTORY_PAGE_SIZE_OPTIONS = [25, 50, 75, 100];
const EXPORT_ALL_LIMIT = 10000;
const ITEMS_PER_PAGE_STORAGE_KEY = 'inventoryItemsPerPage';
const BUCKET_CODE_OPTIONS = Array.from({ length: 10 }, (_, index) => `B${index + 1}`);

function readStoredItemsPerPage() {
  try {
    const v = parseInt(localStorage.getItem(ITEMS_PER_PAGE_STORAGE_KEY), 10);
    if (INVENTORY_PAGE_SIZE_OPTIONS.includes(v)) return v;
  } catch {
    /* ignore */
  }
  return INVENTORY_PAGE_SIZE_OPTIONS[0];
}
/** Load up to this many rows from each source, merge, then paginate in the UI (avoids broken totals from paging two tables separately). */
const INVENTORY_FETCH_LIMIT = 10000;

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

/**
 * Combine inventory and manifest results into a single list (used by Inventory load and export-all).
 */
async function combineInventoryAndManifest(inventoryResult, manifestResult, searchTerm, hiddenManifestIds = new Set()) {
  const isAsin = (str) => str && typeof str === 'string' && str.length === 10 && str.startsWith('B0');
  const isFnsku = (str) => str && typeof str === 'string' && (str.startsWith('X') || str.length > 10);

  const inventoryItems = await Promise.all((inventoryResult.data || []).map(async (item) => {
    let asin = item.asin || '';
    let fnsku = '';
    let lpn = '';
    // Keep inventory.image_url first (often JSON with all Scanner images); manifest fills gaps only.
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
    if (item.product_id) {
      try {
        const { data: manifestData, error } = await supabase
          .from('manifest_data')
          .select('*')
          .eq('id', item.product_id)
          .maybeSingle();
        if (manifestData && !error) {
          if (!asin && manifestData['B00 Asin']) asin = manifestData['B00 Asin'];
          if (!fnsku && manifestData['Fn Sku']) fnsku = manifestData['Fn Sku'];
          if (manifestData['X-Z ASIN']) lpn = manifestData['X-Z ASIN'];
          if (!image_url && manifestData.image_url) image_url = manifestData.image_url;
        } else if (fnsku && !asin) {
          const manifestProduct = await productLookupService.getProductByFnsku(fnsku);
          if (manifestProduct) {
            if (!asin && manifestProduct.asin) asin = manifestProduct.asin;
            if (!lpn && manifestProduct.lpn) lpn = manifestProduct.lpn;
            if (!image_url && manifestProduct.image_url) image_url = manifestProduct.image_url;
          }
        }
      } catch (err) {
        console.warn('Could not fetch data from manifest_data:', err);
      }
    } else if (fnsku && !asin) {
      try {
        const manifestProduct = await productLookupService.getProductByFnsku(fnsku);
        if (manifestProduct) {
          if (!asin && manifestProduct.asin) asin = manifestProduct.asin;
          if (!lpn && manifestProduct.lpn) lpn = manifestProduct.lpn;
          if (!image_url && manifestProduct.image_url) image_url = manifestProduct.image_url;
        }
      } catch (err) {
        console.warn('Could not fetch ASIN from manifest_data:', err);
      }
    }
    if (asin && !image_url) {
      try {
        const cachedData = await apiCacheService.getCachedLookup(asin);
        if (cachedData && cachedData.image_url) image_url = cachedData.image_url;
        else if (fnsku) {
          const cachedByFnsku = await apiCacheService.getCachedLookup(fnsku);
          if (cachedByFnsku && cachedByFnsku.image_url) image_url = cachedByFnsku.image_url;
        }
      } catch (err) {
        console.warn('Could not fetch image from cache:', err);
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
  }));

  const manifestItems = (manifestResult.data || [])
    .filter((item) => item?.id != null && !hiddenManifestIds.has(String(item.id)))
    .map((item) => ({
      ...item,
      image_url: item.image_url || item['Image URL'] || '',
      source: 'manifest_data',
    }));

  const combinedItems = [...inventoryItems];
  manifestItems.forEach(manifestItem => {
    const manifestSku = manifestItem['Fn Sku'] || manifestItem['X-Z ASIN'];
    const manifestAsin = manifestItem['B00 Asin'];
    const existingIndex = combinedItems.findIndex(invItem =>
      (invItem['Fn Sku'] === manifestSku || invItem['X-Z ASIN'] === manifestSku || invItem['B00 Asin'] === manifestAsin)
    );
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
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(readStoredItemsPerPage);
  const [totalItems, setTotalItems] = useState(0);
  const [error, setError] = useState(null);
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

  // Debounce search term
  useEffect(() => {
    const timerId = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1); // Reset to first page on new search
    }, 500);
    return () => clearTimeout(timerId);
  }, [searchTerm]);

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

  /** Full merged list for current search; UI shows one page via slice (see effect below). */
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

  const loadInventoryData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const inventoryResult = await inventoryService.getInventory({
        page: 1,
        limit: INVENTORY_FETCH_LIMIT,
        searchQuery: debouncedSearchTerm,
      });

      const manifestResult = await productLookupService.getProducts({
        page: 1,
        limit: INVENTORY_FETCH_LIMIT,
        searchQuery: debouncedSearchTerm,
      });

      const hiddenManifestList = await inventoryService.getHiddenManifestIds();
      const hiddenManifestIds = new Set(hiddenManifestList);

      const combined = await combineInventoryAndManifest(
        inventoryResult,
        manifestResult,
        debouncedSearchTerm,
        hiddenManifestIds
      );

      setFullCombinedList(combined);

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
      setProducts([]);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchTerm]);

  useEffect(() => {
    void loadInventoryData();
  }, [loadInventoryData]);

  useEffect(() => {
    const total = filteredInventoryList.length;
    const totalPages = Math.max(1, Math.ceil(total / itemsPerPage) || 1);
    if (total > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
      return;
    }
    const start = (currentPage - 1) * itemsPerPage;
    setProducts(filteredInventoryList.slice(start, start + itemsPerPage));
    setTotalItems(total);
  }, [filteredInventoryList, currentPage, itemsPerPage]);

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

  useEffect(() => {
    setSelectedItems(new Set());
  }, [currentPage, debouncedSearchTerm, itemsPerPage, shelfFilter, rowFilter, bucketFilter]);

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

  const getPrimaryProductCode = (productInfo) =>
    productInfo?.asin || productInfo?.upc || productInfo?.fnsku || productInfo?.code || productInfo?.item_number || '';

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
      return `
        <div class="sheet">
          <div class="label-page">
            <div class="header-row">
              <div class="title-wrap">
                <div class="label-title">${escapeHtml(productInfo.name || 'Product')}</div>
                <div class="label-meta">${escapeHtml(productInfo.asin ? `ASIN: ${productInfo.asin}` : (productInfo.fnsku ? `FNSKU: ${productInfo.fnsku}` : (productInfo.upc ? `UPC: ${productInfo.upc}` : 'CODE')))}</div>
                <div class="label-meta">LOC: ${escapeHtml(productInfo.location || 'UNASSIGNED')}</div>
                <div class="label-meta">ITEM: ${escapeHtml(productInfo.item_number || 'N/A')}</div>
              </div>
              <img class="qr" src="${qrCodeUrl}" alt="QR" />
            </div>
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
        return `
          <div class="label-print-root">
            <div class="label-print-frame">
              <div class="zebra-main">
                <div class="zebra-title">${escapeHtml(productInfo.name || 'Product')}</div>
                <div class="zebra-meta">${escapeHtml(productInfo.asin ? `ASIN: ${productInfo.asin}` : (productInfo.fnsku ? `FNSKU: ${productInfo.fnsku}` : (productInfo.upc ? `UPC: ${productInfo.upc}` : 'CODE')))}</div>
                <div class="zebra-meta">LOC: ${escapeHtml(productInfo.location || 'UNASSIGNED')}</div>
                <div class="zebra-meta">ITEM: ${escapeHtml(productInfo.item_number || 'N/A')}</div>
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
          </head>
          <body>${zebraPages}</body>
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
        </head>
        <body>
          <div class="toolbar no-print">
            <button class="print-button" onclick="window.print()">Print Labels</button>
          </div>
          ${pages}
        </body>
      </html>
    `;
  };

  // Create print label HTML (single label wrapper around batch-capable template)
  const createBasicInventoryLabelHTML = (items = []) => {
    const labels = (items || []).map((item) => ({
      name: escapeHtml(truncateToWordCount(item?.name || item?.Description || 'Unknown Product', 5)),
      fnsku: escapeHtml(item?.fnsku || item?.['Fn Sku'] || item?.FNSKU || item?._rawData?.fnsku || 'N/A'),
      location: escapeHtml(item?.location || item?.Location || item?._rawData?.location || 'UNASSIGNED'),
      itemNumber: escapeHtml(
        stripLocationPrefixFromItemNumber(
          item?.item_number || item?.itemNumber || item?.['Item Number'] || item?._rawData?.item_number || 'N/A',
          item?.location || item?.Location || item?._rawData?.location || ''
        ) || 'N/A'
      ),
    }));

    if (labels.length === 0) {
      return '<html><body><p>No labels to print.</p></body></html>';
    }

    const pages = labels.map((label) => `
      <div class="label-root">
        <div class="label-frame">
          <div class="label-title">${label.name}</div>
          <div class="label-meta">FNSKU: ${label.fnsku}</div>
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
              padding: 0.05in 0.04in 0.04in 0.025in;
              display: flex;
              flex-direction: column;
              justify-content: flex-start;
              align-items: stretch;
              text-align: left;
              gap: 0.02in;
              overflow: hidden;
            }

            .label-title {
              font-size: 8pt;
              line-height: 1.12;
              font-weight: 600;
              margin: 0;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
              overflow: hidden;
              word-break: break-word;
            }

            .label-meta {
              font-size: 8.8pt;
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
        </head>
        <body>${pages}</body>
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

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
  };

  // Reset filters
  const handleResetFilters = () => {
    setSearchTerm('');
    setShelfFilter('all');
    setRowFilter('all');
    setBucketFilter('all');
    setCurrentPage(1);
    toast.info('Filters have been reset to default values.');
  };

  const getSelectedProductRows = () =>
    products
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

  const getFilteredInventoryRows = () =>
    [...filteredInventoryList].sort((a, b) => {
      const seqA = extractItemSequence(a);
      const seqB = extractItemSequence(b);
      if (seqA != null || seqB != null) {
        if (seqA == null) return 1;
        if (seqB == null) return -1;
        return seqA - seqB;
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
    const printWindow = openPrintWindow(createBasicInventoryLabelHTML(rows));
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  };

  const handlePrintFilteredBasicLabels = () => {
    const rows = getFilteredInventoryRows();
    if (rows.length === 0) {
      toast.warning('No items match the selected shelf/row filters.');
      return;
    }
    const printWindow = openPrintWindow(createBasicInventoryLabelHTML(rows));
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  };

  // Export to CSV (current page / current list)
  const handleExport = () => {
    try {
      const dataToExport = products;
      
      // Convert data to CSV format
      const headers = ['Product Description', 'LPN', 'ASIN', 'Quantity', 'MSRP', 'Category', 'Location', 'Item Number'];
      
      const csvRows = [
        headers.join(','),
        ...dataToExport.map(item => [
          `"${(item.Description || '').replace(/"/g, '""')}"`,
          `"${(item['X-Z ASIN'] || '').replace(/"/g, '""')}"`,
          `"${(item['B00 Asin'] || '').replace(/"/g, '""')}"`,
          item.Quantity !== null && item.Quantity !== undefined ? item.Quantity.toString() : 'N/A',
          item.MSRP !== null && item.MSRP !== undefined ? `$${item.MSRP.toFixed(2)}` : 'N/A',
          `"${(item.Category || '').replace(/"/g, '""')}"`,
          `"${(item.Location || '').replace(/"/g, '""')}"`,
          `"${(item['Item Number'] || '').replace(/"/g, '""')}"`
        ].join(','))
      ];
      
      const csvString = csvRows.join('\n');
      
      // Create a download link
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      // Set up CSV file for download
      link.setAttribute('href', url);
      link.setAttribute('download', `inventory_export_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      
      // Append to document, trigger download and clean up
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('Inventory data has been exported to CSV successfully.');
    } catch (error) {
      console.error('Error exporting inventory:', error);
      toast.error('Failed to export inventory data. Please try again.');
    }
  };

  const handleExportSelected = () => {
    const rows = getSelectedProductRows();
    if (rows.length === 0) {
      toast.warning('Select at least one row to export.');
      return;
    }
    try {
      const headers = ['Product Description', 'LPN', 'ASIN', 'Quantity', 'MSRP', 'Category', 'Location', 'Item Number'];
      const csvRows = [
        headers.join(','),
        ...rows.map((item) => [
          `"${(item.Description || '').replace(/"/g, '""')}"`,
          `"${(item['X-Z ASIN'] || '').replace(/"/g, '""')}"`,
          `"${(item['B00 Asin'] || '').replace(/"/g, '""')}"`,
          item.Quantity !== null && item.Quantity !== undefined ? item.Quantity.toString() : 'N/A',
          item.MSRP !== null && item.MSRP !== undefined ? `$${item.MSRP.toFixed(2)}` : 'N/A',
          `"${(item.Category || '').replace(/"/g, '""')}"`,
          `"${(item.Location || '').replace(/"/g, '""')}"`,
          `"${(item['Item Number'] || '').replace(/"/g, '""')}"`,
        ].join(',')),
      ];
      const csvString = csvRows.join('\n');
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `inventory_selected_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} selected row(s) to CSV.`);
    } catch (error) {
      console.error('Error exporting selected inventory:', error);
      toast.error('Failed to export selected rows.');
    }
  };

  /** Fetch all products for export (current filters) */
  const fetchAllProductsForExport = useCallback(async () => {
    const inventoryResult = await inventoryService.getInventory({
      page: 1,
      limit: EXPORT_ALL_LIMIT,
      searchQuery: debouncedSearchTerm,
    });
    const manifestResult = await productLookupService.getProducts({
      page: 1,
      limit: EXPORT_ALL_LIMIT,
      searchQuery: debouncedSearchTerm,
    });
    const hiddenManifestList = await inventoryService.getHiddenManifestIds();
    const combined = await combineInventoryAndManifest(
      inventoryResult,
      manifestResult,
      debouncedSearchTerm,
      new Set(hiddenManifestList)
    );
    return applyBucketFilter(applyShelfRowFilters(combined));
  }, [debouncedSearchTerm, applyShelfRowFilters, applyBucketFilter]);

  const handleMarketplaceExportDownload = async () => {
    setIsExportingMarketplace(true);
    try {
      let list;
      if (marketplaceExportScope === 'all') {
        list = await fetchAllProductsForExport();
      } else if (marketplaceExportScope === 'selected') {
        list = getSelectedProductRows();
      } else {
        list = products;
      }
      if (!list || list.length === 0) {
        toast.warning('No products to export.');
        return;
      }
      await exportMarketplace(list, marketplaceExportFormat, marketplaceUniversalFormat);
      toast.success(`Exported ${list.length} product(s) for ${marketplaceExportFormat}.`);
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

  // Handle adjust stock for a specific item
  const handleAdjustStock = (item) => {
    toast.info(`Adjust stock for ${item.Description} (ID: ${item.id}) - Rework needed for Supabase.`);
    // TODO: Implement modal and call productLookupService.saveProductLookup with updated quantity
  };

  // Handle viewing item details
  const handleViewDetails = (item) => {
    if (item["X-Z ASIN"]) {
        navigate(`/scanner?code=${item["X-Z ASIN"]}&type=lpn`); // Example redirect to scanner
    } else {
        toast.info('No LPN to view details with on scanner page.');
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
        setProducts((prev) => prev.filter((i) => getInventoryRowKey(i) !== rowKey));
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
    const selectedProducts = products.filter((p) => selectedArray.includes(getInventoryRowKey(p)));
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
        setCurrentPage(1);
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

  // Handle select all (current page only)
  const handleSelectAll = () => {
    const keysOnPage = products.map(getInventoryRowKey).filter(Boolean);
    const allSelected = keysOnPage.length > 0 && keysOnPage.every((k) => selectedItems.has(k));
    if (allSelected) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(keysOnPage));
    }
  };

  const selectedOnPageCount = products.filter((p) => selectedItems.has(getInventoryRowKey(p))).length;
  const allOnPageSelected = products.length > 0 && selectedOnPageCount === products.length;
  const someOnPageSelected = selectedOnPageCount > 0 && selectedOnPageCount < products.length;

  // Get inventory status based on quantity vs min quantity
  const getInventoryStatus = (quantity, minQuantity) => {
    if (quantity <= 0) return 'Out of Stock';
    if (quantity < minQuantity) return 'Low Stock';
    return 'In Stock';
  };

  // Filter inventory based on search and filters
  const getFilteredInventory = () => {
    return products.filter(item => {
      // Search term filter
      if (searchTerm && !JSON.stringify(item).toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      
      // Location filter
      if (filters.location && filters.location !== 'All Locations' && item.location !== filters.location) {
        return false;
      }
      
      // Category filter
      if (filters.category && filters.category !== 'All Categories' && item.category !== filters.category) {
        return false;
      }
      
      // Status filter
      if (filters.status && filters.status !== 'All') {
        const itemStatus = getInventoryStatus(item.quantity, item.min_quantity);
        if (itemStatus !== filters.status) {
          return false;
        }
      }
      
      return true;
    });
  };

  // Define table columns
  const columns = [
    {
      id: 'select',
      header: () => (
        <div className="flex items-center">
          <input
            type="checkbox"
            aria-label="Select all on this page"
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
              <div className="text-xs text-gray-500 dark:text-gray-400">Location: {rowData['Location'] || rowData._rawData?.location || 'N/A'}</div>
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
      header: 'Qty',
      accessor: 'Quantity',
      cell: (props) => {
        const rowData = props.row.original;
        // console.log("[Inventory.jsx Cell] Qty Data:", rowData.Quantity);
        return (
          <div className="text-center">{rowData.Quantity !== null && rowData.Quantity !== undefined ? rowData.Quantity : 'N/A'}</div>
        );
      },
    },
    {
      header: 'MSRP',
      accessor: 'MSRP',
      cell: (props) => {
        const rowData = props.row.original;
        // console.log("[Inventory.jsx Cell] MSRP Data:", rowData.MSRP);
        return (
          <div className="text-right">{typeof rowData.MSRP === 'number' ? `$${rowData.MSRP.toFixed(2)}` : 'N/A'}</div>
        );
      },
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

          // Create basic product info object for label printing
          const productInfo = {
            name: rowData['Description'] || 'Unknown Product',
            fnsku: rowData['Fn Sku'] || rowData['FNSKU'] || rowData._rawData?.fnsku || '',
            location: rowData['Location'] || rowData._rawData?.location || 'UNASSIGNED',
            item_number: rowData['Item Number'] || rowData._rawData?.item_number || ''
          };

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
                onClick={(e) => { e.stopPropagation(); handleAdjustStock(rowData); }}
                className="p-1 text-blue-600 hover:text-blue-800"
                title="Adjust Stock"
            >
                <AdjustmentsHorizontalIcon className="h-5 w-5" />
            </button>
            <button
                onClick={(e) => { e.stopPropagation(); handleViewDetails(rowData); }}
                className="p-1 text-indigo-600 hover:text-indigo-800"
                title="View Details"
            >
                <ChevronDownIcon className="h-5 w-5" />
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-500 p-4">
        {error}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Inventory</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Track and manage stock levels across all locations
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
              title="Hides every row in the current list from this page only. Does not delete products or scan cache."
            >
              <TrashIcon className="h-5 w-5 mr-2" />
              Remove all from list ({fullCombinedList.length})
            </Button>
          )}
          <Button 
            variant="outline" 
            className="flex items-center"
            onClick={handleExport}
          >
            <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
            Export page (CSV)
          </Button>
          {selectedItems.size > 0 && (
            <Button 
              variant="outline" 
              className="flex items-center"
              onClick={handleExportSelected}
            >
              <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
              Export selected (CSV)
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
            />
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-2">
            <select
              value={shelfFilter}
              onChange={(e) => {
                setShelfFilter(e.target.value);
                setCurrentPage(1);
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
                setCurrentPage(1);
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
                setCurrentPage(1);
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
            <Button
              variant="outline"
              onClick={handlePrintFilteredBasicLabels}
              disabled={filteredInventoryList.length === 0}
            >
              Print filtered labels ({filteredInventoryList.length})
            </Button>
          </div>
        </div>
        
        {loading && products.length === 0 ? (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
        ) : !loading && products.length === 0 && !error ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No inventory items found. Try a different search.
            </div>
        ) : (
            <>
              <Table 
                  data={products}
                  columns={columns}
                  loading={loading} 
                  pagination={false} 
                  noDataMessage="No inventory items found. Try a different search."
                  onRowClick={handleViewDetails}
              />
            </>
        )}

        {!loading && totalItems > 0 && (
          <div className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <label htmlFor="inventory-items-per-page" className="font-medium text-gray-700 dark:text-gray-300">
                Rows per page
              </label>
              <select
                id="inventory-items-per-page"
                value={itemsPerPage}
                onChange={handleItemsPerPageChange}
                className="border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-blue-500 focus:border-blue-500"
              >
                {INVENTORY_PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span className="text-gray-500 dark:text-gray-500">
                Showing {(currentPage - 1) * itemsPerPage + 1}–
                {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems}
              </span>
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={Math.ceil(totalItems / itemsPerPage)}
              onPageChange={handlePageChange}
              totalItems={totalItems}
              itemsPerPage={itemsPerPage}
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
              <option value="universal">Universal (all columns)</option>
            </select>
          </div>
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
                  Current page ({products.length} of {itemsPerPage} rows shown)
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