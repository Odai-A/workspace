import React, { useState, useEffect, useRef, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import axios from 'axios';
import BarcodeReader from './BarcodeReader';
import BarcodeScanner from './scanner/BarcodeScanner';
import MarketplaceListing from './MarketplaceListing';
import ShopifyListing from './ShopifyListing';
// Removed: import { getProductLookup, externalApiService } from '../services/api';
// All API calls now go through backend /api/scan endpoint
import { productLookupService as dbProductLookupService, apiCacheService } from '../services/databaseService';
import { inventoryService, supabase } from '../config/supabaseClient';
import { XMarkIcon, ArrowUpTrayIcon, ShoppingBagIcon, ExclamationTriangleIcon, CheckCircleIcon, ArrowTopRightOnSquareIcon, PrinterIcon, QrCodeIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { mockService } from '../services/mockData';
import { useAuth } from '../contexts/AuthContext';
import { getApiUrl, getApiEndpoint } from '../utils/apiConfig';
import {
  addShelvesToArea,
  getLocationOptions,
  getNextItemNumber,
  getWarehouseLayoutSettings,
  isValidLocationCode,
  setWarehouseLayoutSettings,
} from '../utils/warehouseSettings';

/**
 * Scanner component for barcode scanning and product lookup
 */
const Scanner = () => {
  const { user, session, loading: authLoading } = useAuth();
  const userId = user?.id;
  const navigate = useNavigate();
  const [scannedCodes, setScannedCodes] = useState([]);
  const [productInfo, setProductInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // Marketplace listing states
  const [showMarketplaceListing, setShowMarketplaceListing] = useState(false);
  
  // Shopify listing states
  const [showShopifyListing, setShowShopifyListing] = useState(false);
  
  // File import states
  const [showFileImportModal, setShowFileImportModal] = useState(false);
  const [fileImportType, setFileImportType] = useState('products');
  const [importFile, setImportFile] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importPreview, setImportPreview] = useState([]);
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const fileInputRef = useRef(null);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [exactMatch, setExactMatch] = useState(false);
  const searchDebounceTimer = useRef(null);
  const searchInputRef = useRef(null);

  // Batch scanning mode - collect multiple scans and print all at once
  const [batchMode, setBatchMode] = useState(false);
  const [batchQueue, setBatchQueue] = useState([]);
  const [isPrintingBatch, setIsPrintingBatch] = useState(false);
  const [isPrintingBatchBarcode, setIsPrintingBatchBarcode] = useState(false);
  const batchSequenceRef = useRef(1);

  // State for manual barcode input (from existing code)
  const [manualBarcode, setManualBarcode] = useState('');
  const [manualScanResult, setManualScanResult] = useState(null);
  const [manualScanError, setManualScanError] = useState(null);
  const [isManualScanning, setIsManualScanning] = useState(false);
  
  // State for Add to Inventory modal
  const [showAddToInventoryModal, setShowAddToInventoryModal] = useState(false);
  const [inventoryQuantity, setInventoryQuantity] = useState(1);
  const [inventoryLocation, setInventoryLocation] = useState('');
  const [inventoryBucket, setInventoryBucket] = useState('');
  const [inventoryCondition, setInventoryCondition] = useState('New');
  const [isAddingToInventory, setIsAddingToInventory] = useState(false);
  const [isBulkAddingBatchToInventory, setIsBulkAddingBatchToInventory] = useState(false);
  const [locationOptions, setLocationOptions] = useState(() => getLocationOptions(getWarehouseLayoutSettings()));
  const [batchInventoryLocation, setBatchInventoryLocation] = useState(() => {
    const options = getLocationOptions(getWarehouseLayoutSettings());
    return options[0] || '';
  });
  const [batchInventoryBucket, setBatchInventoryBucket] = useState('');
  const [isAddingShelfInline, setIsAddingShelfInline] = useState(false);
  const [newShelfArea, setNewShelfArea] = useState(() => getWarehouseLayoutSettings().areas?.[0] || 'STORAGE');
  const [newShelvesCount, setNewShelvesCount] = useState(1);
  
  // State for scanner: live camera (BarcodeScanner) primary, photo (BarcodeReader) fallback
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [usePhotoFallback, setUsePhotoFallback] = useState(false);
  
  // Add states for manual database check and processing status
  const [isCheckingDatabase, setIsCheckingDatabase] = useState(false);
  const [apiEnrichLoading, setApiEnrichLoading] = useState(false);
  const [batchForceLookupCode, setBatchForceLookupCode] = useState(null);
  const [batchEnrichAllRunning, setBatchEnrichAllRunning] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState('');
  const [isApiProcessing, setIsApiProcessing] = useState(false);
  const [notInDatabaseMessage, setNotInDatabaseMessage] = useState(null);
  const [processingStartTime, setProcessingStartTime] = useState(null);
  const [scanLatency, setScanLatency] = useState(null);

  // State for auto-refresh when API is processing
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  const [autoRefreshCountdown, setAutoRefreshCountdown] = useState(0);
  const [autoRefreshCode, setAutoRefreshCode] = useState(null);
  const autoRefreshIntervalRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const processingPollersRef = useRef(new Map());
  const productInfoSectionRef = useRef(null);
  const scanTimingStartRef = useRef(0);
  const scanTimingCodeRef = useRef('');
  const batchModeRef = useRef(batchMode);
  batchModeRef.current = batchMode;

  // State for scan count (free trial tracking)
  const [scanCount, setScanCount] = useState({ used: 0, limit: 50, remaining: 50, isPaid: false, is_ceo_admin: false });
  const [scanCountLoading, setScanCountLoading] = useState(true); // true until we know status — avoids showing trial banner to CEO/admin
  const [isCEOAdmin, setIsCEOAdmin] = useState(false);

  const buildScanAxiosConfig = (extra = {}) => {
    const token = session?.access_token;
    const headers = { ...(extra.headers || {}) };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return { ...extra, headers };
  };

  const stopProcessingPoll = (codeToStop) => {
    const key = String(codeToStop || '').trim().toUpperCase();
    if (!key) return;
    const poller = processingPollersRef.current.get(key);
    if (poller?.intervalId) {
      clearInterval(poller.intervalId);
    }
    processingPollersRef.current.delete(key);
  };

  const stopAllProcessingPolls = () => {
    for (const [, poller] of processingPollersRef.current.entries()) {
      if (poller?.intervalId) {
        clearInterval(poller.intervalId);
      }
    }
    processingPollersRef.current.clear();
  };

  const formatScanHttpError = (error) => {
    if (!error.response) {
      return error.message || 'Network error';
    }
    const status = error.response.status;
    const data = error.response.data;
    if (typeof data === 'string') {
      const trimmed = data.replace(/\s+/g, ' ').trim().slice(0, 280);
      return trimmed ? `Server error (${status}): ${trimmed}` : `Server error (${status})`;
    }
    if (data && typeof data === 'object') {
      const msg = data.message || data.error || data.msg || data.detail;
      if (msg) return typeof msg === 'string' ? msg : JSON.stringify(msg);
    }
    return `Request failed (${status})`;
  };

  const startScanTimer = (code) => {
    scanTimingStartRef.current = performance.now();
    scanTimingCodeRef.current = String(code || '').trim().toUpperCase();
  };

  const completeScanTimer = (source, code = '') => {
    const now = performance.now();
    const startedAt = scanTimingStartRef.current || now;
    const elapsedMs = Math.max(0, Math.round(now - startedAt));
    const normalizedCode = String(code || scanTimingCodeRef.current || '').trim().toUpperCase();
    setScanLatency({
      source,
      elapsedMs,
      code: normalizedCode,
      at: Date.now(),
    });
  };

  const formatScanLatencySource = (source) => {
    const key = String(source || '').toUpperCase();
    if (key.startsWith('DB')) return 'DB';
    if (key.startsWith('POLL')) return 'POLL';
    if (key === 'API') return 'API';
    if (key === 'NOT_FOUND') return 'NOT FOUND';
    if (key.includes('TIMEOUT')) return 'TIMEOUT';
    if (key.includes('ERROR')) return 'ERROR';
    return key || 'UNKNOWN';
  };

  const formatAreaLabel = (areaCode) => String(areaCode || '').replace(/-/g, ' ');
  const getQuickAreaOptions = () => {
    const configuredAreas = getWarehouseLayoutSettings().areas || [];
    return [...new Set([...configuredAreas, 'STORAGE', 'SHOWROOM'])];
  };

  const syncLocationOptions = (layout = getWarehouseLayoutSettings()) => {
    const options = getLocationOptions(layout);
    setLocationOptions(options);
    setInventoryLocation((prev) => {
      const normalizedPrev = String(prev || '').trim().toUpperCase();
      if (normalizedPrev && options.some((loc) => loc.toUpperCase() === normalizedPrev)) {
        return normalizedPrev;
      }
      return options[0] || '';
    });
    setBatchInventoryLocation((prev) => {
      const normalizedPrev = String(prev || '').trim().toUpperCase();
      if (normalizedPrev && options.some((loc) => loc.toUpperCase() === normalizedPrev)) {
        return normalizedPrev;
      }
      return options[0] || '';
    });
    setNewShelfArea((prev) => {
      const normalizedPrev = String(prev || '').trim().toUpperCase();
      if (normalizedPrev && (layout.areas || []).some((area) => area.toUpperCase() === normalizedPrev)) {
        return normalizedPrev;
      }
      return layout.areas?.[0] || 'STORAGE';
    });
  };

  const handleQuickAddShelf = () => {
    const selectedArea = String(newShelfArea || '').trim().toUpperCase();
    if (!selectedArea) {
      toast.error('Select an area first.');
      return;
    }
    const count = Math.max(1, Math.min(25, parseInt(newShelvesCount, 10) || 1));
    const currentLayout = getWarehouseLayoutSettings();
    const { layout: nextLayout, addedLocations } = addShelvesToArea(
      { area: selectedArea, count },
      currentLayout
    );
    const savedLayout = setWarehouseLayoutSettings(nextLayout);
    syncLocationOptions(savedLayout);
    if (addedLocations.length > 0) {
      const firstAdded = addedLocations[0];
      setInventoryLocation(firstAdded);
      setBatchInventoryLocation(firstAdded);
    }
    setIsAddingShelfInline(false);
    setNewShelvesCount(1);
    toast.success(`${count} shelf ${count > 1 ? 'groups' : 'group'} added to ${formatAreaLabel(selectedArea)}.`);
  };

  useEffect(() => {
    const syncLayout = () => syncLocationOptions(getWarehouseLayoutSettings());
    syncLayout();
    window.addEventListener('storage', syncLayout);
    return () => window.removeEventListener('storage', syncLayout);
  }, []);

  const normalizeBucketCode = (value) =>
    String(value || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '');

  const composeStorageLocation = (baseLocation, bucketCode = '') => {
    const normalizedBase = String(baseLocation || '').trim().toUpperCase();
    const normalizedBucket = normalizeBucketCode(bucketCode);
    if (!normalizedBucket) return normalizedBase;
    return `${normalizedBase}-${normalizedBucket}`;
  };

  const persistScanCount = (used, limit, remaining) => {
    if (!userId) return;
    try {
      sessionStorage.setItem(`scanCount_${userId}`, JSON.stringify({ used, limit, remaining }));
    } catch (_) { /* ignore */ }
  };

  // Restore last known scan count from sessionStorage so we don't show 0 on refresh before API returns
  useEffect(() => {
    if (!userId) return;
    try {
      const key = `scanCount_${userId}`;
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.used === 'number') {
          setScanCount(prev => ({
            ...prev,
            used: parsed.used,
            limit: parsed.limit != null ? parsed.limit : prev.limit,
            remaining: parsed.remaining != null ? parsed.remaining : prev.remaining
          }));
        }
      }
    } catch (_) { /* ignore */ }
  }, [userId]);

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      stopAllProcessingPolls();
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  // Load scanned codes from user-specific localStorage on mount
  useEffect(() => {
    if (!userId) return;
    
    // Use user-specific localStorage key to ensure each user only sees their own scans
    const userScansKey = `scannedCodes_${userId}`;
    const savedScans = localStorage.getItem(userScansKey);
    if (savedScans) {
      try {
        const parsed = JSON.parse(savedScans);
        setScannedCodes(parsed);
      } catch (error) {
        console.error('Error loading saved scans:', error);
      }
    }
    
    // Load recent scans: light query first (fast list), then full data in background so images and details appear
    const loadRecentScansFromDB = async () => {
      const toScannedCodesFormat = (scan) => {
        const numPrice = scan.price != null && scan.price !== '' && scan.price !== 'N/A' ? parseFloat(scan.price) : null;
        const price = numPrice != null && !Number.isNaN(numPrice) ? numPrice : null;
        const imgUrl = scan.image_url && String(scan.image_url).trim() ? scan.image_url : null;
        return {
          code: scan.scanned_code,
          timestamp: scan.scanned_at,
          type: scan.scanned_code?.startsWith('B0') ? 'ASIN' : (scan.scanned_code?.startsWith('X') ? 'FNSKU' : 'UPC'),
          productInfo: {
            name: scan.description || scan.scanned_code,
            asin: scan.asin && scan.asin !== 'N/A' ? scan.asin : null,
            fnsku: scan.fnsku || (scan.scanned_code?.startsWith('X') ? scan.scanned_code : null),
            price,
            image_url: imgUrl,
            images: imgUrl ? [imgUrl] : [],
            category: scan.category || null,
            description: scan.long_description || scan.description || null,
            upc: scan.upc || null
          }
        };
      };

      try {
        const recentScansLight = await dbProductLookupService.getRecentScanEventsLight(10);
        if (recentScansLight && recentScansLight.length > 0) {
          const dbScansLight = recentScansLight.map(toScannedCodesFormat);
          setScannedCodes(prev => {
            const dbCodes = new Set(dbScansLight.map(s => s.code));
            const fromStorage = prev.filter(s => !dbCodes.has(s.code));
            return [...dbScansLight, ...fromStorage].slice(0, 50);
          });
        }

        // Load full data (with joins for images, price, etc.) and merge into list so product images appear
        const recentScansFull = await dbProductLookupService.getRecentScanEvents(10);
        if (recentScansFull && recentScansFull.length > 0) {
          const dbScansFull = recentScansFull.map(toScannedCodesFormat);
          setScannedCodes(prev => {
            const fullByCode = new Map(dbScansFull.map(s => [s.code, s]));
            if (prev.length === 0) return dbScansFull.slice(0, 50);
            return prev.map(item => fullByCode.get(item.code) || item);
          });
        }
      } catch (error) {
        console.error('Error loading recent scans from database:', error);
      }
    };

    loadRecentScansFromDB();
  }, [userId]);

  // Fetch scan count only when auth is ready and we have a session token. Retry once on 401; never set used to 0 on failure.
  const fetchScanCount = async (isRetry = false) => {
    if (!userId) return;
    const token = session?.access_token;
    if (!token) return;

    setScanCountLoading(true);
    try {
      const response = await axios.get(getApiEndpoint('/scan-count'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.data?.success) {
        const isCEO = response.data.is_ceo_admin || false;
        const used = response.data.used_scans ?? 0;
        const limit = response.data.limit ?? null;
        const remaining = response.data.remaining !== null && response.data.remaining !== undefined
          ? response.data.remaining
          : (response.data.limit != null ? Math.max(0, response.data.limit - (response.data.used_scans ?? 0)) : null);
        setIsCEOAdmin(isCEO);
        setScanCount({
          used,
          limit,
          remaining,
          isPaid: response.data.is_paid ?? false,
          is_ceo_admin: isCEO
        });
        persistScanCount(used, limit, remaining);
      }
    } catch (error) {
      const status = error.response?.status;
      if (status === 401 && !isRetry) {
        await new Promise(r => setTimeout(r, 900));
        return fetchScanCount(true);
      }
      console.error('Error fetching scan count:', error);
      setScanCount(prev => ({ ...prev, limit: prev.limit ?? 50 }));
    } finally {
      setScanCountLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && userId && session?.access_token) {
      fetchScanCount();
    }
  }, [authLoading, userId, session?.access_token]);

  // Save scanned codes to user-specific localStorage whenever they change
  useEffect(() => {
    if (!userId) return;
    
    // Use user-specific localStorage key to ensure each user only sees their own scans
    const userScansKey = `scannedCodes_${userId}`;
    if (scannedCodes.length > 0) {
      localStorage.setItem(userScansKey, JSON.stringify(scannedCodes));
    } else {
      localStorage.removeItem(userScansKey);
    }
  }, [scannedCodes, userId]);

  // Update scan entry with product info when productInfo is set
  useEffect(() => {
    if (productInfo && lastScannedCode) {
      setScannedCodes(prev => {
        const updated = prev.map(item => {
          if (item.code === lastScannedCode && !item.productInfo) {
            // Save essential product info (not the entire object to avoid localStorage size issues)
            return {
              ...item,
              productInfo: {
                name: productInfo.name,
                asin: productInfo.asin,
                fnsku: productInfo.fnsku,
                lpn: productInfo.lpn,
                upc: productInfo.upc,
                price: productInfo.price,
                category: productInfo.category,
                image_url: productInfo.image_url,
                quantity: productInfo.quantity
              }
            };
          }
          return item;
        });
        return updated;
      });
    }
  }, [productInfo, lastScannedCode]);

  // Helper function to map Supabase data to the structure expected by productInfo JSX
  const mapSupabaseProductToDisplay = (supabaseProduct) => {
    if (!supabaseProduct) return null;
    // Keys here (name, sku, etc.) are what the JSX part of this component expects.
    // Values (supabaseProduct['Description'], etc.) are actual column names from your Supabase table.
    return {
      id: supabaseProduct['id'], // Keep the original Supabase ID
      name: supabaseProduct['Description'], 
      sku: supabaseProduct['Fn Sku'], // Using 'Fn Sku' as the primary SKU for display consistency
      asin: supabaseProduct['B00 Asin'],
      fnsku: supabaseProduct['Fn Sku'],
      lpn: supabaseProduct['X-Z ASIN'],
      description: supabaseProduct['Description'], // Can be the same as name if no separate short name
      price: supabaseProduct['MSRP'],
      category: supabaseProduct['Category'],
      upc: supabaseProduct['UPC'],
      quantity: supabaseProduct['Quantity'],
      // Set source info for original manifest data
      source: 'local_database',
      cost_status: 'no_charge',
      // You can add image_url here if it exists in your supabaseProduct object and you want to display it
      // image_url: supabaseProduct['image_url_column_name'], 
      rawSupabase: supabaseProduct, // Keep the raw object if needed for other operations
    };
  };

  function handleCodeDetected(detectedData) {
    const code = detectedData.code;
    if (!code) {
      console.warn("handleCodeDetected called with no code:", detectedData);
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(100);
    // Clean the code by removing whitespace and tab characters, then convert to uppercase
    const cleanedCode = code.trim().replace(/\s+/g, '').toUpperCase();
    console.log("Detected code via Camera:", cleanedCode);
    
    // Keep camera active for continuous scanning in batch mode
    if (!batchMode) {
      setIsCameraActive(false);
    }
    
    setScannedCodes(prev => {
      const newHistory = [
        { code: cleanedCode, timestamp: new Date().toISOString(), type: 'camera' },
        ...prev.filter(item => item.code !== cleanedCode)
      ].slice(0, 10);
      return newHistory;
    });
    
    lookupProductByCode(cleanedCode);
  }

  // Helper function to automatically add product to inventory (used by auto-process feature)
  const autoAddToInventory = async (product) => {
    try {
      // Check if auto-process is enabled
      const autoScanEnabled = localStorage.getItem('autoScan') === 'true';
      if (!autoScanEnabled) {
        return false; // Auto-process is disabled
      }

      // First, check if product exists in product lookup database
      let productId = null;
      const existingProduct = await dbProductLookupService.getProductByFnsku(product.fnsku || product.sku);
      
      if (existingProduct) {
        productId = existingProduct.id;
      } else {
        // Try to create a new product lookup entry (optional - may fail due to RLS)
        try {
          const allImages = product.images || (product.image_url ? [product.image_url] : []);
          const allVideos = product.videos || [];
          const mediaPayload = (allImages.length > 0 || allVideos.length > 0)
            ? JSON.stringify({ images: allImages, videos: allVideos })
            : (allImages.length > 0 ? JSON.stringify(allImages) : null);
          const productData = {
            name: product.name || 'Unknown Product',
            sku: product.fnsku || product.sku || product.asin,
            fnsku: product.fnsku,
            asin: product.asin,
            lpn: product.lpn,
            upc: product.upc,
            price: product.price,
            category: product.category || 'Uncategorized',
            description: product.description || product.name,
            image_url: mediaPayload,
            condition: 'New',
            source: 'Scanner (Auto)',
            created_at: new Date().toISOString()
          };
          
          const savedProduct = await dbProductLookupService.saveProductToManifest(productData, { conflictKey: 'fnsku' });
          productId = savedProduct?.id;
        } catch (manifestError) {
          // If saving to manifest_data fails (e.g., RLS policy), continue without product_id
          console.warn('Could not save to manifest_data (may be RLS restricted):', manifestError);
        }
      }

      const existingInventory = await inventoryService.getInventoryBySku(product.fnsku || product.sku || product.asin);
      const allImages = product.images || (product.image_url ? [product.image_url] : []);
      const allVideos = product.videos || [];
      const imageUrlForInventory = (allImages.length > 0 || allVideos.length > 0)
        ? JSON.stringify({ images: allImages, videos: allVideos })
        : (product.image_url || '');
      const inventoryItem = {
        sku: product.fnsku || product.sku || product.asin,
        name: product.name || 'Unknown Product',
        quantity: 1,
        location: 'Default',
        condition: 'New',
        price: product.price != null ? Number(product.price) : 0,
        cost: product.price != null ? (Number(product.price) / 2) : 0,
        image_url: imageUrlForInventory
      };
      
      // Only add product_id if it exists
      if (productId) {
        inventoryItem.product_id = productId;
      }

      const result = await inventoryService.addOrUpdateInventory(inventoryItem);
      
      if (result) {
        toast.success(`Product automatically added to inventory${existingInventory ? ' (quantity updated)' : ''}.`, { autoClose: 2000 });
        return true;
      } else {
        return false;
      }
    } catch (error) {
      console.error("Error auto-adding to inventory:", error);
      // Don't show error toast for auto-process to avoid spam - just log it
      return false;
    }
  };

  // Helper function to detect if product data is incomplete (still processing)
  const isProductIncomplete = (product, apiResult) => {
    // Check if API explicitly says it's processing
    if (apiResult?.processing === true) {
      console.log(`⏳ Product ${product.fnsku || 'unknown'} marked as processing by API`);
      return true;
    }
    
    // Check if we only have FNSKU but no ASIN and no real product name
    const hasOnlyFnsku = product.fnsku && !product.asin;
    const hasPlaceholderName = !product.name || 
                               product.name.startsWith('FNSKU:') || 
                               product.name.includes('Processing') ||
                               product.name.length < 5;
    const hasNoPrice = !product.price || product.price === '' || product.price === '0' || product.price === '0.00';
    const hasNoImage = !product.image_url || product.image_url === '';
    
    // If we have FNSKU but missing critical data (ASIN, real name, price, or image), it's incomplete
    if (hasOnlyFnsku && (hasPlaceholderName || (hasNoPrice && hasNoImage))) {
      console.log(`⚠️ Product ${product.fnsku} detected as incomplete:`, {
        hasOnlyFnsku,
        hasPlaceholderName,
        hasNoPrice,
        hasNoImage,
        name: product.name,
        asin: product.asin
      });
      return true;
    }
    
    return false;
  };

  const updateFirstBatchQueueItem = (queue, predicate, updater) => {
    let updated = false;
    const nextQueue = queue.map((item) => {
      if (!updated && predicate(item)) {
        updated = true;
        return updater(item);
      }
      return item;
    });
    return { nextQueue, updated };
  };

  // Helper function to retry scanning a code (used for incomplete scans in batch mode)
  const retryScanInBatch = async (code, retryCount = 0) => {
    const maxRetries = 3;
    // Exponential backoff: 3s, 6s, 9s
    const retryDelay = 3000 * (retryCount + 1);
    
    if (retryCount >= maxRetries) {
      console.log(`⚠️ Max retries reached for ${code}. Marking as failed.`);
      // Update queue item to show it failed
      setBatchQueue((prev) => updateFirstBatchQueueItem(
        prev,
        (item) => item.code === code && item.isProcessing,
        (item) => ({ ...item, isProcessing: false, hasFailed: true, retryCount: retryCount })
      ).nextQueue);
      setTimeout(() => {
        toast.warning(`Could not retrieve complete data for ${code} after ${maxRetries} retries. You can manually retry later.`, { autoClose: 5000 });
      }, 0);
      return;
    }
    
    console.log(`🔄 Retrying scan for ${code} (attempt ${retryCount + 1}/${maxRetries})...`);
    
    // Wait before retrying (exponential backoff)
    await new Promise(resolve => setTimeout(resolve, retryDelay));
    
    try {
      const scanUrl = getApiEndpoint('/scan');
      const response = await axios.post(scanUrl, {
        code: code.toUpperCase(),
        user_id: userId
      }, buildScanAxiosConfig({
        timeout: 60000
      }));
      
      const apiResult = response.data;
      
      if (apiResult && apiResult.success) {
        // Map backend response to frontend product format
        let allImages = apiResult.images || (apiResult.image ? [apiResult.image] : []);
        const allVideos = apiResult.videos || [];
        const videosCount = apiResult.videos_count || allVideos.length;
        
        const displayableProduct = {
          fnsku: apiResult.fnsku || code,
          asin: apiResult.asin || '',
          name: apiResult.title || '',
          image_url: allImages[0] || '',
          images: allImages,
          images_count: allImages.length,
          videos: allVideos,
          videos_count: videosCount,
          price: apiResult.price || '',
          brand: apiResult.brand || '',
          category: apiResult.category || '',
          description: apiResult.description || '',
          upc: apiResult.upc || '',
          amazon_url: apiResult.amazon_url || '',
          source: apiResult.source || 'api',
          cost_status: apiResult.cost_status || (apiResult.cached ? 'no_charge' : 'charged')
        };
        
        // Check if data is still incomplete
        if (isProductIncomplete(displayableProduct, apiResult)) {
          // Still incomplete, retry again
          console.log(`⏳ Data still incomplete for ${code}, retrying...`);
          setBatchQueue((prev) => updateFirstBatchQueueItem(
            prev,
            (item) => item.code === code && item.isProcessing,
            (item) => ({ ...item, isProcessing: true, retryCount: retryCount + 1 })
          ).nextQueue);
          // Retry again
          await retryScanInBatch(code, retryCount + 1);
        } else {
          // Data is complete! Update the queue item
          console.log(`✅ Complete data retrieved for ${code} on retry ${retryCount + 1}`);
          setBatchQueue((prev) => updateFirstBatchQueueItem(
            prev,
            (item) => item.code === code && item.isProcessing,
            (item) => ({ ...item, product: displayableProduct, isProcessing: false, hasFailed: false, retryCount: retryCount + 1 })
          ).nextQueue);
          setTimeout(() => {
            toast.success(`✅ Complete data retrieved for ${code}`, { autoClose: 2000 });
          }, 0);
        }
      } else {
        // API returned error, retry
        console.log(`⚠️ API returned error for ${code}, retrying...`);
        setBatchQueue((prev) => updateFirstBatchQueueItem(
          prev,
          (item) => item.code === code && item.isProcessing,
          (item) => ({ ...item, isProcessing: true, retryCount: retryCount + 1 })
        ).nextQueue);
        await retryScanInBatch(code, retryCount + 1);
      }
    } catch (error) {
      // Handle different types of errors
      const isServerError = error.response?.status >= 500;
      const isClientError = error.response?.status >= 400 && error.response?.status < 500;
      const isTimeout = error.code === 'ECONNABORTED';
      
      if (isServerError) {
        console.warn(`⚠️ Server error (${error.response?.status}) for ${code} on retry ${retryCount + 1}. Will retry...`);
      } else if (isClientError && error.response?.status !== 402) {
        // Don't retry on 402 (payment required) or other client errors
        console.error(`❌ Client error (${error.response?.status}) for ${code}. Stopping retries.`);
        setBatchQueue((prev) => updateFirstBatchQueueItem(
          prev,
          (item) => item.code === code && item.isProcessing,
          (item) => ({ ...item, isProcessing: false, hasFailed: true, retryCount: retryCount + 1 })
        ).nextQueue);
        return;
      } else if (isTimeout) {
        console.warn(`⏱️ Timeout for ${code} on retry ${retryCount + 1}. Will retry...`);
      } else {
        console.error(`Error retrying scan for ${code}:`, error);
      }
      
      // Only retry on server errors, timeouts, or network errors (not client errors)
      if (isServerError || isTimeout || !error.response) {
        setBatchQueue((prev) => updateFirstBatchQueueItem(
          prev,
          (item) => item.code === code && item.isProcessing,
          (item) => ({ ...item, isProcessing: true, retryCount: retryCount + 1 })
        ).nextQueue);
        await retryScanInBatch(code, retryCount + 1);
      } else {
        // Client error - stop retrying
        setBatchQueue((prev) => updateFirstBatchQueueItem(
          prev,
          (item) => item.code === code && item.isProcessing,
          (item) => ({ ...item, isProcessing: false, hasFailed: true, retryCount: retryCount + 1 })
        ).nextQueue);
      }
    }
  };

  // Helper function to handle product info - adds to batch queue or sets productInfo based on mode
  const handleProductFound = async (product, code, apiResult = null, options = {}) => {
    const { skipAutoInventory = false } = options;
    if (batchMode) {
      // Check if product data is incomplete
      const isIncomplete = isProductIncomplete(product, apiResult);
      
      // Add to batch queue instead of displaying
      const queueItem = {
        id: Date.now() + Math.random(),
        code: code,
        product: product,
        timestamp: new Date().toISOString(),
        sequence: batchSequenceRef.current++,
        isProcessing: isIncomplete,
        hasFailed: false,
        retryCount: 0
      };
      
      setBatchQueue(prev => {
        // When enriching existing queue items, update first matching code without changing queue order.
        if (skipAutoInventory) {
          const byCodeUpdate = updateFirstBatchQueueItem(
            prev,
            (item) => item.code === code,
            (item) => ({ ...item, product, isProcessing: isIncomplete, hasFailed: false })
          );
          if (byCodeUpdate.updated) {
            toast.success(`Product updated.`, { autoClose: 1000 });
            return byCodeUpdate.nextQueue;
          }
        }

        // For normal scan completion after an earlier placeholder, update that placeholder in place.
        const processingUpdate = updateFirstBatchQueueItem(
          prev,
          (item) => item.code === code && item.isProcessing,
          (item) => ({ ...item, product, isProcessing: isIncomplete, hasFailed: false })
        );
        if (processingUpdate.updated) {
          toast.success(`Product updated.`, { autoClose: 1000 });
          return processingUpdate.nextQueue;
        }

        // New scan events are always appended so queue keeps exact scan order, even for duplicate codes.
        const newQueue = [...prev, queueItem];
        if (isIncomplete) {
          // Rely on the same processing poll as single scan (startProcessingPoll) – no separate retry delay
          console.log(`🔄 Product ${code} is processing – updating automatically when ready (same as single scan).`);
          setTimeout(() => toast.info(`Looking up ${code}… updating automatically when ready.`, { autoClose: 2000 }), 0);
        } else {
          console.log(`✅ Product ${code} is complete - added to queue`);
          setTimeout(() => {
            toast.success(`Product added to batch queue successfully (${newQueue.length} items).`, { autoClose: 1500 });
          }, 0);
        }
        return newQueue;
      });
      
      // Clear search bar and refocus for continuous scanning
      setSearchQuery('');
      setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 100);
    } else {
      // Normal mode - set product info
      setProductInfo(product);
      
      // Auto-process: automatically add to inventory if enabled
      if (!skipAutoInventory) {
        await autoAddToInventory(product);
      }
    }
  };

  const buildDisplayableManifestProduct = (manifestProduct, fallbackCode = '') => {
    const rawImageValue =
      manifestProduct?.image_url
      || manifestProduct?.rawSupabase?.image_url
      || manifestProduct?.rawSupabase?.ImageURL
      || '';

    let imageUrl = '';
    let images = [];
    if (rawImageValue) {
      if (typeof rawImageValue === 'string') {
        try {
          const parsed = JSON.parse(rawImageValue);
          if (Array.isArray(parsed)) {
            images = parsed.filter(Boolean);
          } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.images)) {
            images = parsed.images.filter(Boolean);
          } else if (parsed && typeof parsed === 'string') {
            images = [parsed];
          } else {
            images = [rawImageValue];
          }
        } catch {
          images = [rawImageValue];
        }
      } else if (Array.isArray(rawImageValue)) {
        images = rawImageValue.filter(Boolean);
      }
    }

    imageUrl = images[0] || '';

    return {
      fnsku: manifestProduct?.fnsku || fallbackCode,
      asin: manifestProduct?.asin || '',
      name: manifestProduct?.name || manifestProduct?.description || fallbackCode,
      image_url: imageUrl,
      images,
      videos: [],
      price: manifestProduct?.price || '',
      category: manifestProduct?.category || '',
      description: manifestProduct?.description || manifestProduct?.name || '',
      upc: manifestProduct?.upc || '',
      source: manifestProduct?.source || 'local_database',
      cost_status: 'no_charge',
    };
  };

  const hasProductImages = (product) => {
    const imageList = Array.isArray(product?.images) ? product.images.filter(Boolean) : [];
    if (imageList.length > 0) return true;
    return Boolean(String(product?.image_url || '').trim());
  };

  const isReadyScanStatusPayload = (payload, options = {}) => {
    const { requireImages = false } = options;
    if (!payload?.success || payload?.processing) return false;
    const hasIdentity = Boolean(String(payload?.asin || payload?.fnsku || '').trim());
    const hasDetails = Boolean(
      String(payload?.title || payload?.description || payload?.upc || '').trim()
    );
    const hasMedia = Array.isArray(payload?.images)
      ? payload.images.filter(Boolean).length > 0
      : Boolean(String(payload?.image || '').trim());
    if (requireImages) return hasMedia && (hasIdentity || hasDetails);
    return hasIdentity || hasDetails || hasMedia;
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const buildDisplayableApiProduct = (apiResult, fallbackCode = '') => {
    const allImages = apiResult?.images || (apiResult?.image ? [apiResult.image] : []);
    const allVideos = apiResult?.videos || [];
    return {
      fnsku: apiResult?.fnsku || fallbackCode,
      asin: apiResult?.asin || '',
      name: apiResult?.title || '',
      image_url: allImages[0] || '',
      images: allImages,
      images_count: allImages.length,
      videos: allVideos,
      videos_count: apiResult?.videos_count || allVideos.length,
      price: apiResult?.price || '',
      brand: apiResult?.brand || '',
      category: apiResult?.category || '',
      description: apiResult?.description || '',
      upc: apiResult?.upc || '',
      amazon_url: apiResult?.amazon_url || '',
      source: apiResult?.source || 'api',
      cost_status: apiResult?.cost_status || (apiResult?.cached ? 'no_charge' : 'charged'),
    };
  };

  const tryRecoverPendingLookup = async (code, options = {}) => {
    const {
      maxChecks = 4,
      delayMs = 900,
      skipAutoInventory = false,
      suppressToast = false,
      requireImages = false,
    } = options;
    const normalizedCode = String(code || '').trim().toUpperCase();
    if (!normalizedCode) return false;

    for (let attempt = 1; attempt <= maxChecks; attempt += 1) {
      const localMatch = await findProductInLocalSources(normalizedCode);
      if (localMatch?.product && (!requireImages || hasProductImages(localMatch.product))) {
        await handleProductFound(
          localMatch.product,
          normalizedCode,
          { source: localMatch.source, recovered: true },
          { skipAutoInventory }
        );
        return true;
      }

      try {
        const statusUrl = getApiEndpoint('/scan/status')
          + '?code=' + encodeURIComponent(normalizedCode)
          + `&attempt=${attempt}`
          + '&include_scan_count=0'
          + '&include_enrichment=1';

        const { data } = await axios.get(statusUrl, buildScanAxiosConfig({ timeout: 10000 }));
        if (isReadyScanStatusPayload(data, { requireImages })) {
          const product = buildDisplayableApiProduct(data, normalizedCode);
          await handleProductFound(product, normalizedCode, data, { skipAutoInventory });
          if (!suppressToast && !batchModeRef.current) {
            toast.success('Product found and loaded.', { autoClose: 1600 });
          }
          return true;
        }
      } catch (error) {
        console.warn(`Recovery check ${attempt} failed for ${normalizedCode}:`, error);
      }

      if (attempt < maxChecks) {
        await sleep(delayMs);
      }
    }
    return false;
  };

  const applyScanCountFromPayload = (scanCountPayload) => {
    if (!scanCountPayload) return;
    const used = scanCountPayload.used || 0;
    const limit = scanCountPayload.limit || null;
    const remaining = scanCountPayload.remaining !== null && scanCountPayload.remaining !== undefined
      ? scanCountPayload.remaining
      : (scanCountPayload.limit ? Math.max(0, scanCountPayload.limit - (scanCountPayload.used || 0)) : null);
    persistScanCount(used, limit, remaining);
    const isCEO = scanCountPayload.is_ceo_admin || false;
    setIsCEOAdmin(isCEO);
    setScanCount({
      used,
      limit,
      remaining,
      isPaid: scanCountPayload.is_paid || false,
      is_ceo_admin: isCEO
    });
  };

  const attemptOneGoApiRecovery = async (code, options = {}) => {
    const { skipAutoInventory = false, requireImages = false } = options;
    const normalizedCode = String(code || '').trim().toUpperCase();
    if (!normalizedCode || !userId) return false;

    // After first scan triggers external ASIN lookup, retry with force_api_lookup
    // using a tiered backoff: 3s → 5s → 8s → 12s waits before each re-scan attempt.
    // This gives the external API (Rainforest/etc.) time to return before we give up.
    const retryDelays = [3000, 5000, 8000, 12000];

    for (let attempt = 0; attempt < retryDelays.length; attempt++) {
      // Show progress only on first attempt so UI feedback is clean
      if (attempt === 0 && !batchModeRef.current) {
        toast.info('Looking up product... please wait.', { autoClose: retryDelays[0] + 1000 });
      }

      await sleep(retryDelays[attempt]);

      // Check local cache/DB first — backend may have cached it by now
      const localMatch = await findProductInLocalSources(normalizedCode);
      if (localMatch?.product && (!requireImages || hasProductImages(localMatch.product))) {
        await handleProductFound(localMatch.product, normalizedCode, { source: localMatch.source }, { skipAutoInventory });
        completeScanTimer('DB_RECOVERY', normalizedCode);
        return true;
      }

      try {
        const scanUrl = getApiEndpoint('/scan');
        const response = await axios.post(scanUrl, {
          code: normalizedCode,
          user_id: userId,
          force_api_lookup: true,
        }, buildScanAxiosConfig({ timeout: 40000 }));

        const data = response?.data;
        if (!data?.success) continue;

        applyScanCountFromPayload(data.scan_count);

        if (data.not_in_api_database) {
          // External API hasn't returned yet — loop and try next delay tier
          console.log(`⏳ Recovery attempt ${attempt + 1}: still not in database, waiting...`);
          continue;
        }

        if (data.processing) {
          // Backend is processing — poll status until ready
          const statusRecovered = await tryRecoverPendingLookup(normalizedCode, {
            maxChecks: 10,
            delayMs: 1500,
            skipAutoInventory,
            suppressToast: true,
            requireImages,
          });
          if (statusRecovered) {
            completeScanTimer('POLL_RECOVERY', normalizedCode);
            return true;
          }
          continue;
        }

        if (isReadyScanStatusPayload(data, { requireImages })) {
          const product = buildDisplayableApiProduct(data, normalizedCode);
          await handleProductFound(product, normalizedCode, data, { skipAutoInventory });
          completeScanTimer('API_RECOVERY', normalizedCode);
          return true;
        }

        // Has some data but missing images — show it and keep trying for images
        if (isReadyScanStatusPayload(data) && requireImages) {
          const partialProduct = buildDisplayableApiProduct(data, normalizedCode);
          await handleProductFound(partialProduct, normalizedCode, data, { skipAutoInventory });
          // Continue loop trying to get images
        }

      } catch (error) {
        console.warn(`Recovery attempt ${attempt + 1} failed for ${normalizedCode}:`, error?.message);
      }
    }

    // Final check — show whatever we have locally
    const finalLocalMatch = await findProductInLocalSources(normalizedCode);
    if (finalLocalMatch?.product) {
      await handleProductFound(finalLocalMatch.product, normalizedCode, { source: finalLocalMatch.source }, { skipAutoInventory });
      completeScanTimer('DB_RECOVERY', normalizedCode);
      return true;
    }

    return false;
  };

  const findProductInLocalSources = async (code) => {
    const normalizedCode = String(code || '').trim().toUpperCase();
    if (!normalizedCode) return null;

    const cachedRow = await apiCacheService.getCachedLookup(normalizedCode);
    if (cachedRow) {
      const cachedProduct = apiCacheService.mapCacheRowToProductInfo(cachedRow);
      if (cachedProduct) {
        return { product: cachedProduct, source: 'api_lookup_cache' };
      }
    }

    const manifestProduct = await dbProductLookupService.getProductByFnsku(normalizedCode);
    if (manifestProduct) {
      return {
        product: buildDisplayableManifestProduct(manifestProduct, normalizedCode),
        source: 'manifest_data',
      };
    }

    return null;
  };

  const tryLocalFallbackLookup = async (code, options = {}) => {
    const { skipAutoInventory = false, silent = false } = options;
    const normalizedCode = String(code || '').trim().toUpperCase();
    if (!normalizedCode) return false;

    const localMatch = await findProductInLocalSources(normalizedCode);
    if (localMatch?.product) {
      await handleProductFound(localMatch.product, normalizedCode, { source: localMatch.source }, { skipAutoInventory });
      if (!silent) {
        toast.info(`Loaded ${normalizedCode} from local database while backend is unavailable.`, { autoClose: 2500 });
      }
      return true;
    }

    return false;
  };

  async function lookupProductByCode(code, options = {}) {
    const forceApiLookup = options.forceApiLookup === true;
    const suppressBatchItemToast = options.suppressBatchItemToast === true;
    // Ensure code is uppercase (safety measure)
    const upperCode = code.trim().toUpperCase();
    console.log(`🔍 Looking up product by code: ${upperCode}, UserID: ${userId || 'N/A'}, Batch Mode: ${batchMode}, forceApiLookup: ${forceApiLookup}`);
    if (!forceApiLookup || !scanTimingStartRef.current) {
      startScanTimer(upperCode);
    }

    if (!userId || !session?.access_token) {
      toast.error(
        'You must be signed in to scan. Wait until the app finishes loading, then try again.',
        { autoClose: 6000 }
      );
      if (forceApiLookup) {
        setApiEnrichLoading(false);
        setBatchForceLookupCode(null);
      } else {
        setLoading(false);
      }
      return;
    }

    if (!forceApiLookup) {
      const localMatch = await findProductInLocalSources(upperCode);
      if (localMatch?.product) {
        await handleProductFound(localMatch.product, upperCode, { cached: true, source: localMatch.source });
        const missingImages = !hasProductImages(localMatch.product);
        if (!missingImages) {
          completeScanTimer('DB', upperCode);
          if (!batchMode) {
            toast.success('Found in your database.');
          }
          setLoading(false);
          return;
        }

        if (!batchMode) {
          toast.info('Found in database. Fetching missing images...');
        }
        setLoading(true);
        const recoveredWithImages = await attemptOneGoApiRecovery(upperCode, {
          requireImages: true,
        });
        setLoading(false);
        if (recoveredWithImages) {
          return;
        }
        await lookupProductByCode(upperCode, { forceApiLookup: true, suppressBatchItemToast: true });
        return;
      }
    }

    if (forceApiLookup) {
      if (batchMode) {
        setBatchForceLookupCode(upperCode);
      } else {
        setApiEnrichLoading(true);
      }
    } else {
      setLoading(true);
    }
    if (!batchMode && !forceApiLookup) {
      setProductInfo(null); // Clear previous product info only in normal mode
    }
    if (batchMode && !forceApiLookup) {
      // Reserve queue position immediately so print order matches scan order.
      setBatchQueue((prev) => ([
        ...prev,
        {
          id: Date.now() + Math.random(),
          code: upperCode,
          product: null,
          timestamp: new Date().toISOString(),
          sequence: batchSequenceRef.current++,
          isProcessing: true,
          hasFailed: false,
          retryCount: 0,
        },
      ]));
    }
    setIsApiProcessing(false); // Reset processing state
    setNotInDatabaseMessage(null); // Clear "not in database" message when starting a new lookup
    setLastScannedCode(upperCode); // Track the last scanned code

    // Stop any ongoing auto-refresh or processing poll when starting a new lookup
    if (isAutoRefreshing) {
      console.log('⏹️ Stopping auto-refresh due to new manual scan');
      stopAutoRefresh();
    }
    if (!batchModeRef.current) {
      stopAllProcessingPolls();
    }

    try {
      // Always call backend scan endpoint to ensure scan is logged and counted
      // Backend will check cache first and return cached data quickly if available
      // This ensures all scans are properly logged to scan_history for trial tracking
      console.log(`Calling backend /api/scan to log scan and get updated count for code: ${upperCode}`);
      toast.info(
        batchMode
          ? (forceApiLookup ? `Amazon API: ${upperCode}…` : 'Scanning...')
          : (forceApiLookup ? 'Fetching images and details from Amazon…' : 'Scanning product. Please wait...'),
        { autoClose: batchMode ? (forceApiLookup ? 2000 : 1000) : forceApiLookup ? 3500 : 2000 }
      );
      
      try {
        // Use centralized API config
        const scanUrl = getApiEndpoint('/scan');
        
        console.log("🚀 Calling unified scan endpoint:", scanUrl);
        const scanRequestTimeout = batchModeRef.current ? 20000 : 45000;
        const response = await axios.post(scanUrl, {
          code: upperCode,
          user_id: userId,
          ...(forceApiLookup ? { force_api_lookup: true } : {})
        }, buildScanAxiosConfig({
          timeout: scanRequestTimeout
        }));
        
        const apiResult = response.data;
        console.log("🚀 Backend scan response:", apiResult);
        
        if (apiResult && apiResult.success) {
          if (apiResult.not_in_api_database) {
            // Backend triggered async external ASIN lookup — wait and retry automatically
            // so the user never needs to press Fetch again
            const recovered = await attemptOneGoApiRecovery(upperCode, {
              skipAutoInventory: forceApiLookup,
              requireImages: true,
            });
            if (recovered) {
              setNotInDatabaseMessage(null);
              setIsApiProcessing(false);
              return;
            }
            // Truly not found after all retry tiers exhausted
            setNotInDatabaseMessage(apiResult.message || "This product could not be found in our lookup database. We're unable to retrieve details for this item at this time.");
            setLastScannedCode(code);
            setIsApiProcessing(false);
            toast.warning(apiResult.message || "This product could not be found in our lookup database.", { autoClose: 8000 });
            completeScanTimer('NOT_FOUND', upperCode);
            return;
          }
          // Backend returned "processing: true" – we're still looking up; show partial data and Check for Updates
          if (apiResult.processing) {
            setIsApiProcessing(true);
            const partialImages = apiResult.images || (apiResult.image ? [apiResult.image] : []);
            const displayableProduct = {
              fnsku: apiResult.fnsku || code,
              asin: apiResult.asin || '',
              name: apiResult.title || '',
              image_url: partialImages[0] || '',
              images: partialImages,
              images_count: partialImages.length,
              videos: apiResult.videos || [],
              videos_count: apiResult.videos_count || 0,
              price: apiResult.price || '',
              brand: apiResult.brand || '',
              category: apiResult.category || '',
              description: apiResult.description || '',
              upc: apiResult.upc || '',
              amazon_url: apiResult.amazon_url || '',
              source: apiResult.source || 'api',
              cost_status: apiResult.cost_status || 'charged'
            };
            toast.info(batchMode ? "Looking up..." : (apiResult.message || "Looking up this product. It will update automatically when ready."), { autoClose: batchMode ? 1500 : 4000 });
            handleProductFound(displayableProduct, code, apiResult, { skipAutoInventory: forceApiLookup });
            if (apiResult.scan_count) {
              const used = apiResult.scan_count.used || 0;
              const limit = apiResult.scan_count.limit || null;
              const remaining = apiResult.scan_count.remaining !== null && apiResult.scan_count.remaining !== undefined
                ? apiResult.scan_count.remaining
                : (apiResult.scan_count.limit ? Math.max(0, apiResult.scan_count.limit - (apiResult.scan_count.used || 0)) : null);
              persistScanCount(used, limit, remaining);
              setTimeout(() => {
                const isCEO = apiResult.scan_count.is_ceo_admin || false;
                setIsCEOAdmin(isCEO);
                setScanCount({
                  used,
                  limit,
                  remaining,
                  isPaid: apiResult.scan_count.is_paid || false,
                  is_ceo_admin: isCEO
                });
              }, 0);
            }
            startProcessingPoll(upperCode);
            return;
          }

          // Full data – use images from backend only (no duplicate Rainforest call; use Check for Updates or re-scan for more images)
          const allImages = apiResult.images || (apiResult.image ? [apiResult.image] : []);
          const displayableProduct = buildDisplayableApiProduct(apiResult, code);
          
          if (!batchMode) {
            if (forceApiLookup) {
              if (apiResult.source === 'rainforest_api' || apiResult.source === 'cache_enriched' || apiResult.cost_status === 'charged') {
                toast.success(`Fetched from Amazon: ${allImages.length} image${allImages.length !== 1 ? 's' : ''} and updated details.`, { icon: "💚" });
              } else if (apiResult.cached) {
                toast.success('Product updated (cache). If images are still missing, the listing may not have photos on Amazon.', { icon: "💚" });
              } else {
                toast.success('Product information updated.', { icon: "💚" });
              }
            } else if (apiResult.cached) {
              toast.success("Product information retrieved from cache. No API charges incurred.", { icon: "💚" });
            } else if (apiResult.source === 'api') {
              toast.success(`Product scanned successfully. Retrieved ${allImages.length} images.`, { icon: "💚" });
            }
          } else if (batchMode && forceApiLookup && !suppressBatchItemToast) {
            toast.success(`${upperCode}: saved to catalog (${allImages.length} image${allImages.length !== 1 ? 's' : ''}).`, { autoClose: 2000 });
          }
          // Set product info - pass apiResult to detect incomplete data
          await handleProductFound(displayableProduct, code, apiResult, { skipAutoInventory: forceApiLookup });
          const missingImagesAfterApi = !hasProductImages(displayableProduct);
          if (missingImagesAfterApi) {
            const recoveredWithImages = await attemptOneGoApiRecovery(upperCode, {
              skipAutoInventory: forceApiLookup,
              requireImages: true,
            });
            completeScanTimer(recoveredWithImages ? 'API_RECOVERY' : 'API', upperCode);
          } else {
            completeScanTimer('API', upperCode);
          }
          
          // Prefer scan_count from response to avoid extra /api/scan-count refetch; backend includes it in all scan responses
          requestAnimationFrame(() => {
            setTimeout(() => {
              console.log("📊 Scan response scan_count:", apiResult.scan_count);
              if (apiResult.scan_count) {
                console.log("✅ Updating scan count from response:", apiResult.scan_count);
                applyScanCountFromPayload(apiResult.scan_count);
              } else {
                console.log("⚠️ No scan_count in response, fetching...");
                fetchScanCount(); // Fallback when backend omits scan_count
              }
            }, 0);
          });
        } else {
          // Handle error response
          const errorMsg = apiResult?.message || apiResult?.error || "Failed to scan product";
          toast.error(`❌ ${errorMsg}`, { autoClose: 5000 });
          console.error("Backend scan error:", apiResult);
          completeScanTimer('ERROR', upperCode);
        }
      } catch (error) {
        console.error("Error calling backend scan endpoint:", error);
        const recoveredLocally = await tryLocalFallbackLookup(upperCode, {
          skipAutoInventory: forceApiLookup,
          silent: suppressBatchItemToast,
        });
        if (recoveredLocally) {
          completeScanTimer('DB_FALLBACK', upperCode);
          return;
        }
        if (!forceApiLookup) {
          const forceRecovered = await attemptOneGoApiRecovery(upperCode, {
            skipAutoInventory: forceApiLookup,
            requireImages: true,
          });
          if (forceRecovered) {
            setNotInDatabaseMessage(null);
            setIsApiProcessing(false);
            completeScanTimer('API_RECOVERY', upperCode);
            return;
          }
        }
        if (error.response) {
          const status = error.response.status;
          const data = error.response.data || {};

          // Handle free-trial limit reached - but check if user is CEO/admin first
          if (data.error === 'trial_limit_reached' || status === 402) {
            // Check if user is CEO/admin - if so, this is a backend error, don't redirect
            const checkIfCEO = async () => {
              try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user) {
                  const appMetadata = session.user.app_metadata || {};
                  const userMetadata = session.user.user_metadata || {};
                  const role = appMetadata.role || userMetadata.role;
                  
                  // Also check users table
                  const { data: userProfile } = await supabase
                    .from('users')
                    .select('role')
                    .eq('id', session.user.id)
                    .maybeSingle();
                  
                  const userRole = role || userProfile?.role;
                  const isCEO = userRole === 'ceo';
                  
                  if (isCEO) {
                    console.error('⚠️ CEO/Admin account received 402 error - backend issue!');
                    toast.error('Backend error: CEO accounts should have unlimited scanning privileges. Please contact support or try again.', { autoClose: 5000 });
                    return true; // Don't redirect
                  }
                }
              } catch (err) {
                console.error('Error checking CEO status:', err);
              }
              return false; // Not CEO, proceed with redirect
            };
            
            checkIfCEO().then(isCEO => {
              if (!isCEO) {
                const used = data.used_scans ?? 'all';
                const limit = data.limit ?? 50;
                toast.error(
                  `Free trial limit reached: ${used} of ${limit} scans have been used. Redirecting to upgrade page...`,
                  { autoClose: 3000 }
                );
                // Refresh scan count to show updated count
                fetchScanCount();
                // Redirect to pricing page after a short delay to let the toast show
                setTimeout(() => {
                  navigate('/pricing?upgrade=required', { 
                    state: { 
                      message: 'Your free trial of 50 scans has been used. Please upgrade to continue scanning.',
                      usedScans: used,
                      limit: limit
                    } 
                  });
                }, 1500);
              }
            });
          } else {
            const errorMsg = formatScanHttpError(error);
            toast.error(errorMsg, { autoClose: 5000 });
          }
        } else if (error.code === 'ECONNABORTED') {
          toast.error("Request timeout: The scan operation is taking longer than expected. Please try again.", { autoClose: 5000 });
          completeScanTimer('TIMEOUT', upperCode);
        } else {
          toast.error("Failed to connect to the backend server. Please ensure the backend server is running.", { autoClose: 5000 });
          completeScanTimer('NETWORK_ERROR', upperCode);
        }
      } finally {
        setLoading(false);
        setApiEnrichLoading(false);
        setBatchForceLookupCode(null);
      }
    } catch (error) {
      console.error("Error looking up product by code:", error);
      
      // Check for specific error types
      if (error.message?.includes('Backend server is not running')) {
        toast.error("Backend server is not running. Please start the Flask backend server to continue.", {
          autoClose: 8000
        });
      } else if (error.message?.includes('Monthly Limit Reached') || error.message?.includes('limit')) {
        toast.error("API monthly limit has been reached. Please upgrade your plan or use the backend server to avoid limits.", {
          autoClose: 10000
        });
      } else if (error.message?.includes('External API') || error.message?.includes('Backend API') || error.message?.includes('FNSKU API')) {
        toast.error(`${error.message}`, { autoClose: 6000 });
      } else {
        toast.error("Error occurred while looking up product by code: " + (error.message || 'An unknown error occurred'));
      }
    } finally {
      setLoading(false);
      setApiEnrichLoading(false);
      setBatchForceLookupCode(null);
      // In batch mode, refocus search bar after scan completes for continuous scanning
      if (batchMode && searchInputRef.current) {
        setTimeout(() => {
          searchInputRef.current?.focus();
        }, 200);
      }
    }
  }

  const enrichCodeFromProduct = (info) => {
    if (!info) return '';
    const raw = (info.fnsku || info.asin || info.upc || '').toString().trim();
    return raw ? raw.toUpperCase() : '';
  };

  const handleFetchImagesFromApi = async () => {
    if (!productInfo || batchMode) return;
    const code = (lastScannedCode && String(lastScannedCode).trim()) || enrichCodeFromProduct(productInfo);
    if (!code) {
      toast.error('No barcode or ASIN available to look up.');
      return;
    }
    setApiEnrichLoading(true);
    try {
      const recovered = await attemptOneGoApiRecovery(code, { requireImages: true });
      if (!recovered) {
        await lookupProductByCode(code, { forceApiLookup: true });
      }
    } finally {
      setApiEnrichLoading(false);
    }
  };

  const handleManualScan = async (barcodeToScan) => {
    if (!barcodeToScan.trim()) {
      toast.error("Please enter a barcode to scan.");
      return;
    }
    
    // Clean the input by removing extra whitespace and tab characters, then convert to uppercase
    const cleanedBarcode = barcodeToScan.trim().replace(/\s+/g, '').toUpperCase();
    console.log("Manual scan - original:", barcodeToScan, "cleaned:", cleanedBarcode, `UserID: ${userId || 'N/A'}`);
    
    setIsManualScanning(true);
    setManualScanError(null);
    setManualScanResult(null);
    setProductInfo(null);
    
    setScannedCodes(prev => {
      const newHistory = [
        { code: cleanedBarcode, timestamp: new Date().toISOString(), type: 'manual' },
        ...prev.filter(item => item.code !== cleanedBarcode)
      ].slice(0, 10);
      return newHistory;
    });

    await lookupProductByCode(cleanedBarcode);
    setIsManualScanning(false);
  };

  const handleViewDetails = () => {
    if (productInfo) {
      // Implement product detail view navigation here
      toast.info("View details functionality will be implemented soon");
    }
  };

  // Handle viewing product on Amazon
  const handleViewOnAmazon = () => {
    if (!productInfo) {
      toast.error("No product information available");
      return;
    }
    
    let amazonUrl = '';
    let productCode = '';
    
    if (productInfo.asin) {
      amazonUrl = `https://www.amazon.com/dp/${productInfo.asin}`;
      productCode = `ASIN: ${productInfo.asin}`;
    } else if (productInfo.upc) {
      amazonUrl = `https://www.amazon.com/s?k=${productInfo.upc}`;
      productCode = `UPC: ${productInfo.upc}`;
    } else if (productInfo.fnsku) {
      amazonUrl = `https://www.amazon.com/s?k=${productInfo.fnsku}`;
      productCode = `FNSKU: ${productInfo.fnsku}`;
    } else if (productInfo.code) {
      amazonUrl = `https://www.amazon.com/s?k=${productInfo.code}`;
      productCode = `Code: ${productInfo.code}`;
    }
    
    if (amazonUrl) {
      window.open(amazonUrl, '_blank');
      toast.success(`🔗 Opening Amazon search for ${productCode}`);
    } else {
      toast.error("No product code available to search on Amazon");
    }
  };

  // Fetch product data from Rainforest API
  const fetchProductDataFromRainforest = async (asin) => {
    const rainforestApiKey = import.meta.env.VITE_RAINFOREST_API_KEY;
    
    if (!rainforestApiKey) {
      console.warn("Rainforest API key not configured. Using available product data.");
      return null;
    }

    try {
      const response = await axios.get('https://api.rainforestapi.com/request', {
        params: {
          api_key: rainforestApiKey,
          type: 'product',
          amazon_domain: 'amazon.com',
          asin: asin
        },
        timeout: 10000
      });

      if (response.data && response.data.product) {
        const product = response.data.product;
        
        // Collect ALL images from Rainforest API
        const allImages = [];
        
        // Add main_image if it exists
        if (product.main_image?.link) {
          allImages.push(product.main_image.link);
        }
        
        // Add all images from images array
        if (product.images && Array.isArray(product.images)) {
          product.images.forEach(img => {
            const imgLink = img?.link || img;
            if (imgLink && !allImages.includes(imgLink)) {
              allImages.push(imgLink);
            }
          });
        }
        
        // Fallback: if no images collected, try images_flat
        if (allImages.length === 0 && product.images_flat) {
          const flatImages = product.images_flat.split(',').map(url => url.trim()).filter(url => url);
          allImages.push(...flatImages);
        }
        
        // Primary image for backward compatibility
        const primaryImage = allImages[0] || '';
        
        return {
          title: product.title || '',
          image: primaryImage,  // Primary image for backward compatibility
          images: allImages,  // ALL images array
          images_count: allImages.length,
          price: product.buybox_winner?.price?.value || product.price?.value || null,
          rating: product.rating || null,
          reviews_count: product.reviews_total || null,
          brand: product.brand || '',
          category: product.category?.name || '',
          description: product.description || ''
        };
      }
    } catch (error) {
      console.error("Error fetching from Rainforest API:", error);
      return null;
    }
    
    return null;
  };

  // Handle printing 4x6 label
  const handlePrintLabel = async () => {
    if (!productInfo) {
      toast.error("No product information available to print label");
      return;
    }
    
    // For UPC scans, we might not have an ASIN - use UPC or product code instead
    const productCode = productInfo.asin || productInfo.upc || productInfo.fnsku || productInfo.code || '';
    if (!productCode) {
      toast.error("No product code available to print label");
      return;
    }

    // Use ASIN if available, otherwise use UPC or other code for URL
    let amazonUrl = '';
    if (productInfo.asin) {
      amazonUrl = `https://www.amazon.com/dp/${productInfo.asin}`;
    } else if (productInfo.upc) {
      amazonUrl = `https://www.amazon.com/s?k=${productInfo.upc}`;
    } else if (productInfo.fnsku) {
      amazonUrl = `https://www.amazon.com/s?k=${productInfo.fnsku}`;
    } else if (productCode) {
      // Fallback: use product code for search
      amazonUrl = `https://www.amazon.com/s?k=${productCode}`;
    }
    
    // Use QR code API service for reliable printing (smaller size for top right corner)
    // If no URL available, create QR code with product code or name
    const qrData = amazonUrl || productCode || productInfo.name || 'Product';
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(qrData)}`;
    
    // Product data should already be enhanced from Rainforest API when scanned
    // But if image is missing, try to fetch it one more time (only if we have ASIN)
    let labelProductData = { ...productInfo };
    
    if (!labelProductData.image_url && productInfo.asin) {
      toast.info("📦 Fetching product image...", { autoClose: 1500 });
      try {
        const rainforestData = await fetchProductDataFromRainforest(productInfo.asin);
        if (rainforestData && rainforestData.image) {
          labelProductData.image_url = rainforestData.image;
        }
      } catch (error) {
        console.warn("Could not fetch image from Rainforest API:", error);
      }
    }
    
    // Create print window with formatted label
    const printWindow = window.open('', '_blank');
    const labelContent = createLabelHTML(labelProductData, amazonUrl, qrApiUrl);
    
    printWindow.document.write(labelContent);
    printWindow.document.close();
    
    // Wait for content to load, then trigger print dialog
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 800);
    
    toast.success("🖨️ Opening print dialog for 4x6 label");
  };

  const BASIC_INVENTORY_LABEL_WIDTH = '1.59in';
  const BASIC_INVENTORY_LABEL_HEIGHT = '1in';

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

  const getProductCodeForLabel = (product) =>
    product?.asin || product?.upc || product?.fnsku || product?.code || '';

  const createBarcodeLabelHTML = (product) => {
    const productCode = getProductCodeForLabel(product);
    const productName = escapeHtml(product?.name || 'Product');
    const codeLabel = escapeHtml(productCode || 'N/A');
    const barcodeValue = JSON.stringify(String(productCode || ''));
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Barcode Label - ${codeLabel}</title>
          <style>
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
              height: 1in;
            }
            body {
              display: flex;
              align-items: stretch;
              justify-content: stretch;
              background: #fff;
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
            .title {
              font-size: 7pt;
              line-height: 1.1;
              font-weight: 700;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .barcode-wrap {
              height: 0.42in;
              display: flex;
              align-items: center;
              justify-content: center;
              overflow: hidden;
            }
            #barcode {
              width: 100%;
              height: 100%;
            }
            .code {
              font-size: 8pt;
              font-weight: 700;
              text-align: center;
              line-height: 1;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
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
                height: 1in !important;
              }
            }
          </style>
          <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
        </head>
        <body>
          <div class="no-print">
            <button class="print-button" onclick="window.print()">Print Label</button>
          </div>
          <div class="label">
            <div class="title">${productName}</div>
            <div class="barcode-wrap">
              <svg id="barcode"></svg>
            </div>
            <div class="code">${codeLabel}</div>
          </div>
          <script>
            (function () {
              const value = ${barcodeValue};
              if (!value) return;
              try {
                JsBarcode("#barcode", value, {
                  format: "CODE128",
                  displayValue: false,
                  margin: 0,
                  height: 34,
                  width: 1.2
                });
              } catch (e) {
                const el = document.getElementById("barcode");
                if (el) {
                  el.outerHTML = '<div style="font-size:8pt;color:#b91c1c;text-align:center;">Invalid barcode value</div>';
                }
              }
            })();
          </script>
        </body>
      </html>
    `;
  };

  const handlePrintBarcodeLabel = (product = productInfo) => {
    if (!product) {
      toast.error("No product information available to print barcode label");
      return;
    }
    const productCode = getProductCodeForLabel(product);
    if (!productCode) {
      toast.error("No product code available for barcode label");
      return;
    }
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error("Could not open print window. Check popup blocker settings.");
      return;
    }
    printWindow.document.write(createBarcodeLabelHTML(product));
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 700);
    toast.success("🖨️ Opening print dialog for barcode label");
  };

  // Helper function to create label HTML
  const createLabelHTML = (productInfo, amazonUrl, qrCodeHtml) => {
    // Get discount percentage from settings
    const discountPercent = parseFloat(localStorage.getItem('labelDiscountPercent')) || 50;
    const discountMultiplier = (100 - discountPercent) / 100;
    
    // Calculate prices automatically
    const retailPrice = productInfo.price != null ? parseFloat(productInfo.price) : 0;
    const ourPrice = retailPrice * discountMultiplier;
    
    // Show full product name (no truncation)
    const productName = productInfo.name || 'Product';
    
    // Get product identifier for title (ASIN, UPC, FNSKU, or code)
    const productId = productInfo.asin || productInfo.upc || productInfo.fnsku || productInfo.code || 'Product';
    
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Product Label - ${productId}</title>
          <style>
            @page {
              size: 4in 6in;
              margin: 0.08in;
            }
            @media print {
              body {
                margin: 0;
                padding: 0;
                overflow: hidden;
              }
              .no-print {
                display: none;
              }
              * {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              /* Ensure product image area always prints with visible outline and contrast */
              .product-image-section {
                border: 2px solid #000 !important;
                background: #e5e5e5 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              img.product-image {
                image-rendering: -webkit-optimize-contrast !important;
                image-rendering: crisp-edges !important;
                image-rendering: pixelated !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                filter: contrast(1.35) brightness(0.88) !important;
                border: 2px solid #000 !important;
                outline: 2px solid #000 !important;
                background: #e0e0e0 !important;
              }
            }
            * {
              box-sizing: border-box;
            }
            body {
              font-family: Arial, sans-serif;
              width: 4in;
              height: 6in;
              max-width: 4in;
              max-height: 6in;
              margin: 0;
              padding: 0.08in;
              overflow: hidden;
              display: flex;
              flex-direction: column;
              position: relative;
            }
            .qr-code-top-right {
              position: absolute;
              top: 0.1in;
              right: 0.1in;
              z-index: 10;
              width: 0.75in;
              height: 0.75in;
            }
            .qr-code {
              border: 1px solid #000;
              padding: 0.02in;
              background: white;
              width: 100%;
              height: 100%;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .qr-code img {
              display: block;
              width: 100%;
              height: 100%;
              object-fit: contain;
            }
            .label-header {
              text-align: center;
              border-bottom: 2px solid #000;
              padding-bottom: 0.05in;
              margin-bottom: 0.06in;
              padding-right: 0.85in;
              flex-shrink: 0;
              overflow: hidden;
            }
            .label-title {
              font-size: 9pt;
              font-weight: bold;
              margin: 0;
              padding: 0;
              line-height: 1.2;
              word-wrap: break-word;
              overflow-wrap: break-word;
              overflow: hidden;
            }
            .label-subtitle {
              font-size: 7pt;
              color: #666;
              margin: 0.02in 0 0 0;
              padding: 0;
            }
            .asin-display {
              font-size: 9pt;
              font-weight: bold;
              text-align: center;
              background: #f0f0f0;
              padding: 0.04in;
              margin: 0.04in 0;
              border: 1px solid #000;
              flex-shrink: 0;
            }
            .product-image-section {
              display: flex;
              align-items: center;
              justify-content: center;
              margin: 0.08in 0;
              max-height: 2.8in;
              min-height: 2.2in;
              flex-shrink: 1;
              overflow: hidden;
              padding: 0.05in;
              border: 2px solid #000;
              background: #e5e5e5;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .product-image {
              max-width: 100%;
              max-height: 2.8in;
              width: auto;
              height: auto;
              object-fit: contain;
              border: 2px solid #000;
              outline: 2px solid #000;
              background: #e0e0e0;
              box-shadow: 0 0 0 1px #000;
              padding: 0.02in;
              image-rendering: -webkit-optimize-contrast;
              image-rendering: crisp-edges;
              image-rendering: pixelated;
              filter: contrast(1.35) brightness(0.88);
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .no-image-text {
              font-size: 10pt;
              color: #333;
              text-align: center;
              padding: 0.2in;
            }
            .price-section {
              margin-top: auto;
              margin-bottom: 0.05in;
              text-align: center;
              flex-shrink: 0;
              padding-top: 0.05in;
            }
            .retail-price {
              font-size: 10pt;
              font-weight: bold;
              color: #666;
              margin-bottom: 0.03in;
              line-height: 1.2;
            }
            .retail-price-label {
              font-size: 8pt;
              color: #666;
              margin-right: 0.08in;
            }
            .our-price {
              font-size: 18pt;
              font-weight: bold;
              color: #059669;
              margin-top: 0.03in;
              line-height: 1.2;
            }
            .our-price-label {
              font-size: 10pt;
              font-weight: bold;
              color: #059669;
              margin-bottom: 0.02in;
            }
            .amazon-url {
              font-size: 6pt;
              text-align: center;
              color: #666;
              word-break: break-all;
              margin-top: 0.05in;
              display: none;
            }
            .print-button {
              position: fixed;
              top: 20px;
              right: 20px;
              padding: 10px 20px;
              background: #3b82f6;
              color: white;
              border: none;
              border-radius: 5px;
              cursor: pointer;
              font-size: 14px;
              z-index: 1000;
            }
            .print-button:hover {
              background: #2563eb;
            }
          </style>
        </head>
        <body>
          <div class="no-print">
            <button class="print-button" onclick="window.print()">Print Label</button>
          </div>
          
          <div class="qr-code-top-right">
            <div class="qr-code">
              <img src="${qrCodeHtml}" alt="QR Code" onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'text-align:center; padding:5px; font-size:6pt;\\'>QR<br/>Code</div>';" />
            </div>
          </div>
          
          <div class="label-header">
            <h1 class="label-title">${escapeHtml(productName)}</h1>
            <p class="label-subtitle">Amazon Product Label</p>
          </div>

          <div class="asin-display">
            ${productInfo.asin ? `ASIN: ${productInfo.asin}` : (productInfo.upc ? `UPC: ${productInfo.upc}` : (productInfo.fnsku ? `FNSKU: ${productInfo.fnsku}` : 'Product Code'))}
          </div>

          <div class="product-image-section">
            ${productInfo.image_url ? `
              <img src="${productInfo.image_url}" alt="Product Image" class="product-image" 
                   onerror="this.style.display='none'; var s=this.nextElementSibling; if(s) s.style.display='block';"
                   style="image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges; border: 2px solid #000; outline: 2px solid #000; background: #e0e0e0; filter: contrast(1.35) brightness(0.88); -webkit-print-color-adjust: exact; print-color-adjust: exact;" />
              <span class="no-image-text" style="display:none;">Product image</span>
            ` : `
              <span class="no-image-text">Product image</span>
            `}
          </div>

          ${retailPrice > 0 ? `
            <div class="price-section">
              <div class="retail-price">
                <span class="retail-price-label">RETAIL:</span> $${retailPrice.toFixed(2)}
              </div>
              <div class="our-price-label">OUR PRICE:</div>
              <div class="our-price">
                $${ourPrice.toFixed(2)} <span style="font-size: 12pt; color: #059669;">(${discountPercent}% OFF)</span>
              </div>
            </div>
          ` : ''}
        </body>
      </html>
    `;
  };

  // Helper to escape HTML
  const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  // Helper function to create a single label body (without HTML wrapper)
  const createLabelBody = (productInfo, amazonUrl, qrCodeHtml) => {
    const discountPercent = parseFloat(localStorage.getItem('labelDiscountPercent')) || 50;
    const discountMultiplier = (100 - discountPercent) / 100;
    const retailPrice = productInfo.price != null ? parseFloat(productInfo.price) : 0;
    const ourPrice = retailPrice * discountMultiplier;
    const productName = productInfo.name || 'Product';

    return `
      <div class="label-page">
        <div class="qr-code-top-right">
          <div class="qr-code">
            <img src="${qrCodeHtml}" alt="QR Code" onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'text-align:center; padding:5px; font-size:6pt;\\'>QR<br/>Code</div>';" />
          </div>
        </div>
        
        <div class="label-header">
          <h1 class="label-title">${escapeHtml(productName)}</h1>
          <p class="label-subtitle">Amazon Product Label</p>
        </div>

        <div class="asin-display">
          ${productInfo.asin ? `ASIN: ${productInfo.asin}` : (productInfo.upc ? `UPC: ${productInfo.upc}` : (productInfo.fnsku ? `FNSKU: ${productInfo.fnsku}` : 'Product Code'))}
        </div>

        <div class="product-image-section">
          ${productInfo.image_url ? `
            <img src="${productInfo.image_url}" alt="Product Image" class="product-image" 
                 onerror="this.style.display='none'; var s=this.nextElementSibling; if(s) s.style.display='block';"
                 style="image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges; border: 2px solid #000; outline: 2px solid #000; background: #e0e0e0; filter: contrast(1.35) brightness(0.88); -webkit-print-color-adjust: exact; print-color-adjust: exact;" />
            <span class="no-image-text" style="display:none;">Product image</span>
          ` : `
            <span class="no-image-text">Product image</span>
          `}
        </div>

          ${retailPrice > 0 ? `
          <div class="price-section">
            <div class="retail-price">
              <span class="retail-price-label">RETAIL:</span> $${retailPrice.toFixed(2)}
            </div>
            <div class="our-price-label">OUR PRICE:</div>
            <div class="our-price">
              $${ourPrice.toFixed(2)} <span style="font-size: 12pt; color: #059669;">(${discountPercent}% OFF)</span>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  };

  // Helper function to create combined batch label HTML (all labels in one document)
  const createBatchLabelHTML = (batchItems) => {
    const labelsHTML = batchItems
      .filter(item => item.product && (item.product.asin || item.product.upc || item.product.fnsku || item.product.code))
      .map(item => {
        // Use ASIN if available, otherwise use UPC or other code
        let amazonUrl = '';
        if (item.product.asin) {
          amazonUrl = `https://www.amazon.com/dp/${item.product.asin}`;
        } else if (item.product.upc) {
          amazonUrl = `https://www.amazon.com/s?k=${item.product.upc}`;
        } else if (item.product.fnsku) {
          amazonUrl = `https://www.amazon.com/s?k=${item.product.fnsku}`;
        } else {
          const productCode = item.product.code || item.product.fnsku || item.product.upc || '';
          amazonUrl = productCode ? `https://www.amazon.com/s?k=${productCode}` : '';
        }
        
        // Create QR code with URL or product code
        const qrData = amazonUrl || item.product.upc || item.product.fnsku || item.product.code || 'Product';
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(qrData)}`;
        return createLabelBody(item.product, amazonUrl, qrApiUrl);
      })
      .join('');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Batch Labels - ${batchItems.length} items</title>
          <style>
            @page {
              size: 4in 6in;
              margin: 0.08in;
            }
            @media print {
              body {
                margin: 0;
                padding: 0;
              }
              .no-print {
                display: none;
              }
              .label-page {
                page-break-after: always;
                break-after: page;
              }
              .label-page:last-child {
                page-break-after: auto;
                break-after: auto;
              }
              * {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .product-image-section {
                border: 2px solid #000 !important;
                background: #e5e5e5 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              img.product-image {
                image-rendering: -webkit-optimize-contrast !important;
                image-rendering: crisp-edges !important;
                image-rendering: pixelated !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                filter: contrast(1.35) brightness(0.88) !important;
                border: 2px solid #000 !important;
                outline: 2px solid #000 !important;
                background: #e0e0e0 !important;
              }
            }
            * {
              box-sizing: border-box;
            }
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 0;
            }
            .label-page {
              width: 4in;
              height: 6in;
              max-width: 4in;
              max-height: 6in;
              margin: 0;
              padding: 0.08in;
              overflow: hidden;
              display: flex;
              flex-direction: column;
              position: relative;
              page-break-after: always;
              break-after: page;
            }
            .qr-code-top-right {
              position: absolute;
              top: 0.1in;
              right: 0.1in;
              z-index: 10;
              width: 0.75in;
              height: 0.75in;
            }
            .qr-code {
              border: 1px solid #000;
              padding: 0.02in;
              background: white;
              width: 100%;
              height: 100%;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .qr-code img {
              display: block;
              width: 100%;
              height: 100%;
              object-fit: contain;
            }
            .label-header {
              text-align: center;
              border-bottom: 2px solid #000;
              padding-bottom: 0.05in;
              margin-bottom: 0.06in;
              padding-right: 0.85in;
              flex-shrink: 0;
              overflow: hidden;
            }
            .label-title {
              font-size: 9pt;
              font-weight: bold;
              margin: 0;
              padding: 0;
              line-height: 1.2;
              word-wrap: break-word;
              overflow-wrap: break-word;
              overflow: hidden;
            }
            .label-subtitle {
              font-size: 7pt;
              color: #666;
              margin: 0.02in 0 0 0;
              padding: 0;
            }
            .asin-display {
              font-size: 9pt;
              font-weight: bold;
              text-align: center;
              background: #f0f0f0;
              padding: 0.04in;
              margin: 0.04in 0;
              border: 1px solid #000;
              flex-shrink: 0;
            }
            .product-image-section {
              display: flex;
              align-items: center;
              justify-content: center;
              margin: 0.08in 0;
              max-height: 2.8in;
              min-height: 2.2in;
              flex-shrink: 1;
              overflow: hidden;
              padding: 0.05in;
              border: 2px solid #000;
              background: #e5e5e5;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .product-image {
              max-width: 100%;
              max-height: 2.8in;
              width: auto;
              height: auto;
              object-fit: contain;
              border: 2px solid #000;
              outline: 2px solid #000;
              background: #e0e0e0;
              box-shadow: 0 0 0 1px #000;
              padding: 0.02in;
              image-rendering: -webkit-optimize-contrast;
              image-rendering: crisp-edges;
              image-rendering: pixelated;
              filter: contrast(1.35) brightness(0.88);
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .no-image-text {
              font-size: 10pt;
              color: #333;
              text-align: center;
              padding: 0.2in;
            }
            .price-section {
              margin-top: auto;
              margin-bottom: 0.05in;
              text-align: center;
              flex-shrink: 0;
              padding-top: 0.05in;
            }
            .retail-price {
              font-size: 10pt;
              font-weight: bold;
              color: #666;
              margin-bottom: 0.03in;
              line-height: 1.2;
            }
            .retail-price-label {
              font-size: 8pt;
              color: #666;
              margin-right: 0.08in;
            }
            .our-price {
              font-size: 18pt;
              font-weight: bold;
              color: #059669;
              margin-top: 0.03in;
              line-height: 1.2;
            }
            .our-price-label {
              font-size: 10pt;
              font-weight: bold;
              color: #059669;
              margin-bottom: 0.02in;
            }
            .print-button {
              position: fixed;
              top: 20px;
              right: 20px;
              padding: 10px 20px;
              background: #3b82f6;
              color: white;
              border: none;
              border-radius: 5px;
              cursor: pointer;
              font-size: 14px;
              z-index: 1000;
            }
            .print-button:hover {
              background: #2563eb;
            }
          </style>
        </head>
        <body>
          <div class="no-print">
            <button class="print-button" onclick="window.print()">Print All Labels</button>
          </div>
          ${labelsHTML}
        </body>
      </html>
    `;
  };

  const createBatchBarcodeLabelHTML = (batchItems) => {
    const fallbackLocation = composeStorageLocation(batchInventoryLocation, batchInventoryBucket) || 'UNASSIGNED';
    const normalizedItems = (batchItems || []).map((item) => ({
      name: item?.product?.name || 'Unknown Product',
      fnsku: item?.product?.fnsku || item?.product?.code || item?.code || '',
      location: item?.product?.location || fallbackLocation,
      item_number: item?.product?.item_number || item?.product?.itemNumber || '',
    }));
    const labels = normalizedItems.map((item) => ({
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
        <body>
          ${pages}
        </body>
      </html>
    `;
  };

  // Handle marketplace listing creation
  const handleCreateListing = () => {
    if (productInfo) {
      setShowMarketplaceListing(true);
    } else {
      toast.error("Please scan a product first");
    }
  };

  const handleListingSuccess = (results) => {
    console.log('Listing creation results:', results);
    toast.success('Listings created successfully!');
    // You could add logic here to update the product info with marketplace URLs
    // or refresh the product data if needed
  };

  const handleCloseListing = () => {
    setShowMarketplaceListing(false);
  };

  // Handle Shopify listing creation
  const handleCreateShopifyListing = () => {
    if (productInfo) {
      setShowShopifyListing(true);
    } else {
      toast.error("Please scan a product first");
    }
  };

  const handleShopifySuccess = (result) => {
    console.log('Shopify listing creation result:', result);
    toast.success(`🛍️ Shopify listing created! Product ID: ${result.product.id}`, {
      autoClose: 5000
    });
    
    // Open Shopify admin in new tab
    if (result.shopifyUrl) {
      window.open(result.shopifyUrl, '_blank');
    }
  };

  const handleCloseShopifyListing = () => {
    setShowShopifyListing(false);
  };

  // Handle Enter key in search bar for continuous scanning
  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      e.preventDefault();
      const code = searchQuery.trim().toUpperCase(); // Convert to uppercase
      setSearchQuery(''); // Clear immediately for next scan
      lookupProductByCode(code);
      // Refocus after a brief delay to ensure smooth scanning
      setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 100);
    }
  };

  // Handle search input change with debounce
  const handleSearchChange = (e) => {
    // Convert to uppercase as user types for better UX
    const query = e.target.value.toUpperCase();
    setSearchQuery(query);
    
    // Clear previous timer
    if (searchDebounceTimer.current) {
      clearTimeout(searchDebounceTimer.current);
    }
    
    // Set new timer to search after 500ms of inactivity
    searchDebounceTimer.current = setTimeout(() => {
      if (query.trim().length >= 2) {
        performSearch(query); // query is already uppercase from handleSearchChange
      } else {
        setSearchResults([]);
        setShowSearchResults(false);
      }
    }, 500);
  };
  
  // Perform search
  const performSearch = async (query) => {
    setSearchLoading(true);
    try {
      // Ensure query is uppercase for consistent searching
      const upperQuery = query.toUpperCase();
      const results = await dbProductLookupService.searchProducts(upperQuery, {
        exactMatch: exactMatch,
        fields: ['name', 'sku', 'asin', 'fnsku', 'description', 'category', 'lpn'],
        limit: 10
      });
      setSearchResults(results);
      setShowSearchResults(true);
    } catch (error) {
      console.error("Search error:", error);
      toast.error("Failed to search products");
    } finally {
      setSearchLoading(false);
    }
  };
  
  // Select product from search results
  const selectProduct = (product) => {
    // Get code and ensure it's uppercase
    const code = (product.sku || product.asin || product.fnsku || '').toUpperCase();
    
    // In batch mode, add to queue; otherwise set product info
    if (batchMode) {
      handleProductFound(product, code);
    } else {
      setProductInfo(product);
    }
    
    setLastScannedCode(code);
    setShowSearchResults(false);
    setSearchQuery('');
    
    // Refocus search bar for continuous scanning in batch mode
    if (batchMode && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
    
    // Add to scanned codes history with product info
    setScannedCodes(prev => {
      const newHistory = [
        { 
          code: code, 
          timestamp: new Date().toISOString(), 
          type: 'search',
          productInfo: {
            name: product.name,
            asin: product.asin,
            fnsku: product.fnsku,
            lpn: product.lpn,
            upc: product.upc,
            price: product.price,
            category: product.category,
            image_url: product.image_url,
            quantity: product.quantity
          }
        },
        ...prev.filter(item => item.code !== code)
      ].slice(0, 10);
      return newHistory;
    });
  };

  // Function to handle file selection
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImportFile(file);
      
      // Check if it's a CSV file
      if (file.name.endsWith('.csv')) {
        generatePreviewFromCSV(file);
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        toast.error("Excel files are not supported directly. Please save as CSV first.");
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        setImportFile(null);
      } else {
        toast.error("Unsupported file format. Please use CSV files.");
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        setImportFile(null);
      }
    }
  };
  
  // Generate preview of CSV file contents
  const generatePreviewFromCSV = (file) => {
    setImportLoading(true);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csvText = e.target.result;
        const lines = csvText.split('\n');
        
        // Parse CSV headers (first line)
        const headers = lines[0].split(',').map(header => 
          header.trim().replace(/^"(.*)"$/, '$1') // Remove quotes if they exist
        );
        
        // Parse rows (skip header)
        const previewData = [];
        const maxPreviewRows = Math.min(6, lines.length);
        
        for (let i = 1; i < maxPreviewRows; i++) {
          if (!lines[i].trim()) continue;
          
          // Split line by commas, handling quoted fields
          const row = parseCSVLine(lines[i]);
          
          const item = {};
          headers.forEach((header, index) => {
            item[header] = row[index] || '';
          });
          
          previewData.push(item);
        }
        
        setImportPreview(previewData);
        setImportTotal(lines.length - 1); // Exclude header row
      } catch (error) {
        console.error("Error generating preview:", error);
        toast.error("Error reading CSV file. Please check the format.");
      } finally {
        setImportLoading(false);
      }
    };
    
    reader.onerror = () => {
      toast.error("Failed to read the file");
      setImportLoading(false);
    };
    
    reader.readAsText(file);
  };
  
  // Helper function to parse CSV line (handles quoted fields with commas)
  const parseCSVLine = (line) => {
    const result = [];
    let inQuote = false;
    let field = '';
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (i < line.length - 1 && line[i + 1] === '"') {
          // Double quotes inside quoted field
          field += '"';
          i++; // Skip the next quote
        } else {
          // Toggle quote state
          inQuote = !inQuote;
        }
      } else if (char === ',' && !inQuote) {
        // End of field
        result.push(field);
        field = '';
      } else {
        field += char;
      }
    }
    
    // Add the last field
    result.push(field);
    return result;
  };
  
  // Process and import file data
  const processFileImport = async () => {
    if (!importFile) {
      toast.error("Please select a file to import");
      return;
    }
    
    setImportLoading(true);
    setImportProgress(0);
    
    try {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const csvText = e.target.result;
          const lines = csvText.split('\n');
          
          // Parse CSV headers (first line)
          const headers = lines[0].split(',').map(header => 
            header.trim().replace(/^"(.*)"$/, '$1') // Remove quotes if they exist
          );
          
          // Parse data rows (skip header)
          const jsonData = [];
          
          for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            // Parse the CSV line
            const row = parseCSVLine(lines[i]);
            
            const item = {};
            headers.forEach((header, index) => {
              item[header] = row[index] || '';
            });
            
            jsonData.push(item);
          }
          
          setImportTotal(jsonData.length);
          
          // Process each row
          let successCount = 0;
          let errorCount = 0;
          let duplicateCount = 0;
          
          for (let i = 0; i < jsonData.length; i++) {
            const item = jsonData[i];
            
            try {
              // Normalize the data based on import type
              let normalizedItem;
              
              if (fileImportType === 'products') {
                normalizedItem = {
                  name: item.name || item.Name || item.PRODUCT_NAME || item.product_name || item.title || item.Title || '',
                  sku: item.sku || item.SKU || item.UPC || item.upc || item.barcode || item.Barcode || '',
                  fnsku: item.fnsku || item.FNSKU || '',
                  asin: item.asin || item.ASIN || '',
                  price: parseFloat(item.price || item.Price || item.PRICE || 0),
                  category: item.category || item.Category || item.CATEGORY || 'Imported',
                  description: item.description || item.Description || item.desc || '',
                  condition: item.condition || item.Condition || 'New',
                  source: 'Imported File',
                  import_date: new Date().toISOString()
                };
                
                // Check if product already exists
                const existingProduct = await dbProductLookupService.getProductByFnsku(normalizedItem.sku || normalizedItem.fnsku || normalizedItem.asin);
                
                if (existingProduct) {
                  // Update with new information if needed
                  await dbProductLookupService.saveProductToManifest({
                    ...existingProduct,
                    ...normalizedItem,
                    updated_at: new Date().toISOString()
                  }, { conflictKey: 'fnsku' });
                  duplicateCount++;
                } else {
                  // Save as new product
                  await dbProductLookupService.saveProductToManifest(normalizedItem, { conflictKey: 'fnsku' });
                  successCount++;
                }
              } else if (fileImportType === 'inventory') {
                normalizedItem = {
                  product_id: item.product_id || null,
                  sku: item.sku || item.SKU || item.UPC || item.upc || item.barcode || item.Barcode || '',
                  name: item.name || item.Name || item.PRODUCT_NAME || item.product_name || item.title || item.Title || '',
                  quantity: parseInt(item.quantity || item.Quantity || item.qty || item.QTY || 0, 10),
                  location: item.location || item.Location || item.LOCATION || '',
                  condition: item.condition || item.Condition || 'New',
                  price: parseFloat(item.price || item.Price || item.PRICE || 0),
                  cost: parseFloat(item.cost || item.Cost || item.COST || 0),
                  source: 'Imported File',
                  import_date: new Date().toISOString()
                };
                
                // Look up the product first
                let productId = normalizedItem.product_id;
                
                if (!productId && normalizedItem.sku) {
                  const product = await dbProductLookupService.getProductByFnsku(normalizedItem.sku);
                  if (product) {
                    productId = product.id;
                  } else {
                    // Add to product lookups first
                    const newProduct = await dbProductLookupService.saveProductToManifest({
                      name: normalizedItem.name,
                      sku: normalizedItem.sku,
                      price: normalizedItem.price,
                      category: 'Imported',
                      condition: normalizedItem.condition,
                      source: 'Imported File'
                    }, { conflictKey: 'fnsku' });
                    productId = newProduct?.id;
                  }
                }
                
                // Check if inventory item exists
                const existingInventory = await inventoryService.getInventoryBySku(normalizedItem.sku);
                
                if (existingInventory) {
                  // Update inventory
                  await inventoryService.addOrUpdateInventory({
                    ...existingInventory,
                    quantity: existingInventory.quantity + normalizedItem.quantity,
                    updated_at: new Date().toISOString()
                  });
                  duplicateCount++;
                } else {
                  // Add new inventory item
                  await inventoryService.addOrUpdateInventory({
                    ...normalizedItem,
                    product_id: productId
                  });
                  successCount++;
                }
              }
            } catch (error) {
              console.error(`Error processing row ${i}:`, error);
              errorCount++;
            }
            
            // Update progress
            setImportProgress(i + 1);
          }
          
          // Show success message
          toast.success(`Import complete: ${successCount} new items, ${duplicateCount} updated, ${errorCount} errors`);
          
          // Close modal and reset
          setTimeout(() => {
            setShowFileImportModal(false);
            setImportFile(null);
            setImportPreview([]);
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
          }, 2000);
        } catch (error) {
          console.error("Error processing CSV:", error);
          toast.error("Error processing file. Please check the format.");
        } finally {
          setImportLoading(false);
        }
      };
      
      reader.onerror = () => {
        console.error("Error reading file");
        toast.error("Failed to read the file");
        setImportLoading(false);
      };
      
      reader.readAsText(importFile);
      
    } catch (error) {
      console.error("Error importing file:", error);
      toast.error("Error importing file. Please check the file format and try again.");
      setImportLoading(false);
    }
  };
  
  // Handle changing import type
  const handleImportTypeChange = (type) => {
    setFileImportType(type);
    setImportPreview([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setImportFile(null);
  };

  // Auto-refresh functions
  const startAutoRefresh = (code) => {
    console.log('🔄 Starting auto-refresh for code:', code);
    setIsAutoRefreshing(true);
    setAutoRefreshCode(code);
    setAutoRefreshCountdown(45); // 45 seconds countdown
    
    // Start countdown timer
    countdownIntervalRef.current = setInterval(() => {
      setAutoRefreshCountdown(prev => {
        if (prev <= 1) {
          return 45; // Reset to 45 seconds after each attempt
        }
        return prev - 1;
      });
    }, 1000);
    
    // Start auto-refresh timer (every 45 seconds)
    autoRefreshIntervalRef.current = setInterval(async () => {
      console.log('🔄 Auto-refresh attempt for code:', code);
      try {
        // Retry the API lookup
        // Use backend scan endpoint instead
        const response = await axios.post(getApiEndpoint('/scan'), {
          code: code.toUpperCase(),
          user_id: userId
        }, buildScanAxiosConfig({ timeout: 120000 }));
        const result = response.data;
        
        if (result && result.asin && result.asin.trim() !== '') {
          console.log('✅ Auto-refresh found ASIN!', result.asin);
          stopAutoRefresh();
          
          // Update the UI with the successful result
          setProductInfo({
            ...result,
            source: 'external_api',
            cost_status: 'charged'
          });
          
          // Save to cache
          try {
            await apiCacheService.saveLookup(result);
            console.log('✅ Auto-refresh result saved to cache');
            toast.success(`🎉 ASIN found automatically: ${result.asin}`, {
              autoClose: 4000
            });
          } catch (saveError) {
            console.warn('⚠️ Could not save auto-refresh result to cache:', saveError);
            toast.success(`🎉 ASIN found: ${result.asin} (but couldn't save to cache)`, {
              autoClose: 4000
            });
          }
        } else {
          console.log('⏳ Auto-refresh attempt - ASIN still not ready');
        }
      } catch (error) {
        console.error('❌ Auto-refresh error:', error);
      }
    }, 45000); // Every 45 seconds
  };
  
  const stopAutoRefresh = () => {
    if (autoRefreshIntervalRef.current) {
      clearInterval(autoRefreshIntervalRef.current);
      autoRefreshIntervalRef.current = null;
    }
    if (countdownIntervalRef.current) { // Clear countdown interval as well
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setIsAutoRefreshing(false);
    setAutoRefreshCode(null);
    setAutoRefreshCountdown(0); 
    console.log('⏹️ Auto-refresh stopped.');
  };

  // Auto-poll when backend returned processing: true (first poll immediately, then every 2s; no manual "Check for Updates" needed)
  const startProcessingPoll = (codeToPoll) => {
    const normalizedCode = String(codeToPoll || '').trim().toUpperCase();
    if (!normalizedCode) return;
    if (!batchModeRef.current) {
      stopAllProcessingPolls();
    } else {
      stopProcessingPoll(normalizedCode);
    }
    let attempts = 0;
    let consecutiveErrors = 0;
    const maxAttempts = 20; // cap processing wait and fail faster when API cannot resolve code
    const poll = async () => {
      const poller = processingPollersRef.current.get(normalizedCode);
      if (poller?.inFlight) return;
      if (poller) {
        poller.inFlight = true;
        processingPollersRef.current.set(normalizedCode, poller);
      }
      attempts++;
      if (attempts > maxAttempts) {
        stopProcessingPoll(normalizedCode);
        setIsApiProcessing(false);
        const fallbackLocalMatch = await findProductInLocalSources(normalizedCode);
        if (fallbackLocalMatch?.product) {
          await handleProductFound(fallbackLocalMatch.product, normalizedCode, { source: fallbackLocalMatch.source });
          completeScanTimer('DB_FALLBACK', normalizedCode);
        }
        if (batchModeRef.current) {
          setBatchQueue((prev) => prev.map((item) => (
            item.code === normalizedCode && item.isProcessing
              ? { ...item, isProcessing: false, hasFailed: true }
              : item
          )));
          toast.warning(`Could not retrieve data for ${normalizedCode} in time. You can retry from the queue.`, { autoClose: 4000 });
        } else {
          toast.warning(`Lookup for ${normalizedCode} is taking too long. Showing best available local data.`, { autoClose: 3500 });
        }
        if (!fallbackLocalMatch?.product) {
          completeScanTimer('POLL_TIMEOUT', normalizedCode);
        }
        return;
      }
      try {
        const includeEnrichment = attempts % 4 === 0 ? '1' : '0';
        const url = getApiEndpoint('/scan/status')
          + '?code=' + encodeURIComponent(normalizedCode)
          + '&attempt=' + attempts
          + '&include_scan_count=0'
          + `&include_enrichment=${includeEnrichment}`;
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || '';
        const res = await axios.get(url, {
          timeout: 10000,
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        const data = res.data;
        consecutiveErrors = 0;
        if (data && data.not_in_api_database) {
          stopProcessingPoll(normalizedCode);
          setIsApiProcessing(false);
          const recovered = await attemptOneGoApiRecovery(normalizedCode, {
            requireImages: true,
          });
          if (recovered) {
            completeScanTimer('POLL_RECOVERY', normalizedCode);
            return;
          }
          setNotInDatabaseMessage(data.message || "This product could not be found in our lookup database. We're unable to retrieve details for this item at this time.");
          setLastScannedCode(normalizedCode);
          if (batchModeRef.current) {
            setBatchQueue((prev) => prev.map((item) => (
              item.code === normalizedCode && item.isProcessing
                ? { ...item, isProcessing: false, hasFailed: true }
                : item
            )));
          }
          toast.warning(data.message || "This product could not be found in our lookup database.", { autoClose: 8000 });
          completeScanTimer('NOT_FOUND', normalizedCode);
          return;
        }
        if (isReadyScanStatusPayload(data)) {
          stopProcessingPoll(normalizedCode);
          setIsApiProcessing(false);
          const displayableProduct = buildDisplayableApiProduct(data, normalizedCode);
          handleProductFound(displayableProduct, normalizedCode);
          const missingImagesAfterPoll = !hasProductImages(displayableProduct);
          if (missingImagesAfterPoll) {
            const recoveredWithImages = await attemptOneGoApiRecovery(normalizedCode, { requireImages: true });
            if (recoveredWithImages) {
              completeScanTimer('POLL_RECOVERY', normalizedCode);
            } else {
              completeScanTimer('POLL', normalizedCode);
            }
          } else {
            completeScanTimer('POLL', normalizedCode);
          }
          if (!batchMode) toast.success('Product details ready.', { icon: '💚' });
          if (data.scan_count) {
            const used = data.scan_count.used || 0;
            const limit = data.scan_count.limit || null;
            const remaining = data.scan_count.remaining !== null && data.scan_count.remaining !== undefined
              ? data.scan_count.remaining
              : (data.scan_count.limit ? Math.max(0, data.scan_count.limit - (data.scan_count.used || 0)) : null);
            persistScanCount(used, limit, remaining);
            const isCEO = data.scan_count.is_ceo_admin || false;
            setIsCEOAdmin(isCEO);
            setScanCount({
              used,
              limit,
              remaining,
              isPaid: data.scan_count.is_paid || false,
              is_ceo_admin: isCEO
            });
          }
        }
      } catch (e) {
        consecutiveErrors += 1;
        console.warn('Processing poll error:', e);
        if (consecutiveErrors >= 3) {
          stopProcessingPoll(normalizedCode);
          setIsApiProcessing(false);
          void tryLocalFallbackLookup(normalizedCode, { silent: true });
          completeScanTimer('POLL_RECOVERY', normalizedCode);
          if (!batchModeRef.current) {
            toast.warning('Connection was unstable while checking status. Showing cached/local data when available.', { autoClose: 3000 });
          }
        }
      } finally {
        const activePoller = processingPollersRef.current.get(normalizedCode);
        if (activePoller) {
          activePoller.inFlight = false;
          processingPollersRef.current.set(normalizedCode, activePoller);
        }
      }
    };
    // First poll immediately; keep single scans responsive too.
    const pollIntervalMs = batchModeRef.current ? 1000 : 1500;
    const intervalId = setInterval(poll, pollIntervalMs);
    processingPollersRef.current.set(normalizedCode, { intervalId, inFlight: false });
    poll();
  };

  // Add manual check function
  const handleCheckForUpdates = async () => {
    if (!lastScannedCode) {
      toast.error("No recent scan to check for updates");
      return;
    }
    setNotInDatabaseMessage(null); // Clear so a retry doesn't keep showing "not in database"
    setIsCheckingDatabase(true);
    toast.info("🔍 Checking for ASIN updates...");
    
    try {
      // Re-run the lookup to see if ASIN is now available
      await lookupProductByCode(lastScannedCode);
      setIsApiProcessing(false); // Reset processing state after manual check
    } catch (error) {
      console.error("Error checking for updates:", error);
      toast.error("❌ Error checking for updates");
    } finally {
      setIsCheckingDatabase(false);
    }
  };

  // Handle deleting individual scan
  const handleDeleteScan = (index) => {
    setScannedCodes(prev => {
      const updated = prev.filter((_, i) => i !== index);
      // Update localStorage
      if (updated.length > 0) {
        // Use user-specific localStorage key
        const userScansKey = userId ? `scannedCodes_${userId}` : 'scannedCodes';
        localStorage.setItem(userScansKey, JSON.stringify(updated));
      } else {
        const userScansKey = userId ? `scannedCodes_${userId}` : 'scannedCodes';
        localStorage.removeItem(userScansKey);
      }
      return updated;
    });
    toast.success('Scan removed');
  };

  // Handle clearing all scans
  const handleClearAllScans = () => {
    if (window.confirm('Are you sure you want to clear all recent scans?')) {
      setScannedCodes([]);
      // Use user-specific localStorage key
      const userScansKey = userId ? `scannedCodes_${userId}` : 'scannedCodes';
      localStorage.removeItem(userScansKey);
      toast.success('All scans cleared');
    }
  };

  // Show customer the item again: fetch full product from database (api_lookup_cache) and display
  const handleRescanFromScan = async (item) => {
    if (!item?.code) return;
    setLastScannedCode(item.code);
    try {
      const cachedRow = await apiCacheService.getCachedLookup(item.code);
      const fullProduct = cachedRow ? apiCacheService.mapCacheRowToProductInfo(cachedRow) : null;
      if (fullProduct) {
        setProductInfo(fullProduct);
        productInfoSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        toast.success('Product loaded from database');
      } else {
        if (item.productInfo) {
          setProductInfo(item.productInfo);
          toast.info('Product displayed (details not in database)');
        } else {
          toast.warning('Product not found in database. Scan again to fetch details.');
        }
        productInfoSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (err) {
      console.error('Rescan from cache failed:', err);
      if (item?.productInfo) setProductInfo(item.productInfo);
      productInfoSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast.error('Could not load from database');
    }
  };

  // Handle viewing Amazon from recent scan
  const handleViewOnAmazonFromScan = (scanItem) => {
    if (!scanItem.productInfo) {
      toast.error("No product information available");
      return;
    }
    
    let amazonUrl = '';
    let productCode = '';
    
    if (scanItem.productInfo.asin) {
      amazonUrl = `https://www.amazon.com/dp/${scanItem.productInfo.asin}`;
      productCode = `ASIN: ${scanItem.productInfo.asin}`;
    } else if (scanItem.productInfo.upc) {
      amazonUrl = `https://www.amazon.com/s?k=${scanItem.productInfo.upc}`;
      productCode = `UPC: ${scanItem.productInfo.upc}`;
    } else if (scanItem.productInfo.fnsku) {
      amazonUrl = `https://www.amazon.com/s?k=${scanItem.productInfo.fnsku}`;
      productCode = `FNSKU: ${scanItem.productInfo.fnsku}`;
    } else if (scanItem.code) {
      amazonUrl = `https://www.amazon.com/s?k=${scanItem.code}`;
      productCode = `Code: ${scanItem.code}`;
    }
    
    if (amazonUrl) {
      window.open(amazonUrl, '_blank');
      toast.success(`🔗 Opening Amazon search for ${productCode}`);
    } else {
      toast.error("No product code available to search on Amazon");
    }
  };

  // Handle printing all labels in batch queue
  const handlePrintAllBatch = async () => {
    if (batchQueue.length === 0) {
      toast.error("Batch queue is empty");
      return;
    }

    // Check for processing or failed items
    const processingItems = batchQueue.filter(item => item.isProcessing || item.hasFailed);
    if (processingItems.length > 0) {
      const processingCount = batchQueue.filter(item => item.isProcessing).length;
      const failedCount = batchQueue.filter(item => item.hasFailed).length;
      if (processingCount > 0) {
        toast.warning(`${processingCount} item(s) are still processing. They will be excluded from printing.`, { autoClose: 4000 });
      }
      if (failedCount > 0) {
        toast.warning(`${failedCount} item(s) have failed. Please retry them before printing.`, { autoClose: 4000 });
      }
    }

    // Filter out items without any product code (ASIN, UPC, FNSKU, or code)
    // Also exclude items that are still processing or have failed
    const validItems = batchQueue.filter(item => {
      if (!item.product) return false;
      // Exclude items that are still processing or have failed
      if (item.isProcessing || item.hasFailed) return false;
      // Allow items with ASIN, UPC, FNSKU, or code
      return item.product.asin || item.product.upc || item.product.fnsku || item.product.code || item.code;
    }).sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
    
    if (validItems.length === 0) {
      toast.error("No valid items with product code to print. Some items may still be processing - please wait or retry failed items.");
      return;
    }
    
    if (validItems.length < batchQueue.length) {
      toast.info(`Printing ${validItems.length} of ${batchQueue.length} items (excluding processing/failed items)`, { autoClose: 3000 });
    }

    setIsPrintingBatch(true);
    toast.info(`🖨️ Preparing ${validItems.length} labels for printing...`, { autoClose: 2000 });

    try {
      // Create a single combined document with all labels
      const combinedLabelHTML = createBatchLabelHTML(validItems);
      const printWindow = window.open('', '_blank');
      
      if (printWindow) {
        printWindow.document.write(combinedLabelHTML);
        printWindow.document.close();
        
        // Wait for content to load, then trigger print dialog
        await new Promise(resolve => setTimeout(resolve, 1000));
        printWindow.focus();
        printWindow.print();
        
        toast.success(`✅ Print dialog opened for ${validItems.length} labels. Click Print once to print all!`, { autoClose: 4000 });
        
        // Close window after a longer delay to allow printing
        setTimeout(() => {
          printWindow.close();
        }, 5000);
      } else {
        toast.error("❌ Could not open print window. Please check popup blocker settings.");
      }
    } catch (error) {
      console.error("Error printing batch:", error);
      toast.error("❌ Error printing batch labels", { autoClose: 3000 });
    } finally {
      setIsPrintingBatch(false);
    }
  };

  const handlePrintAllBatchBarcode = async () => {
    if (batchQueue.length === 0) {
      toast.error("Batch queue is empty");
      return;
    }

    const validItems = batchQueue.filter(item => {
      if (!item.product) return false;
      if (item.isProcessing || item.hasFailed) return false;
      return getProductCodeForLabel(item.product) || item.code;
    }).sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

    if (validItems.length === 0) {
      toast.error("No valid items with barcode data to print.");
      return;
    }

    if (validItems.length < batchQueue.length) {
      toast.info(`Printing ${validItems.length} of ${batchQueue.length} items (excluding processing/failed items)`, { autoClose: 3000 });
    }

    setIsPrintingBatchBarcode(true);
    toast.info(`🖨️ Preparing ${validItems.length} barcode labels for printing...`, { autoClose: 2000 });
    try {
      const combinedBarcodeLabelHTML = createBatchBarcodeLabelHTML(validItems);
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(combinedBarcodeLabelHTML);
        printWindow.document.close();
        await new Promise(resolve => setTimeout(resolve, 900));
        printWindow.focus();
        printWindow.print();
        toast.success(`✅ Barcode print dialog opened for ${validItems.length} labels.`, { autoClose: 3500 });
        setTimeout(() => {
          printWindow.close();
        }, 5000);
      } else {
        toast.error("❌ Could not open print window. Please check popup blocker settings.");
      }
    } catch (error) {
      console.error("Error printing batch barcode labels:", error);
      toast.error("❌ Error printing batch barcode labels", { autoClose: 3000 });
    } finally {
      setIsPrintingBatchBarcode(false);
    }
  };

  // Remove item from batch queue
  const handleRemoveFromBatch = (itemId) => {
    setBatchQueue(prev => prev.filter(item => item.id !== itemId));
    toast.success("Removed from batch queue", { autoClose: 1500 });
  };

  // Manual retry for a specific item in batch queue
  const handleManualRetry = async (code) => {
    console.log(`🔄 Manual retry requested for ${code}`);
    // Update item to show it's retrying
    setBatchQueue(prev => prev.map(item => 
      item.code === code 
        ? { ...item, isProcessing: true, hasFailed: false }
        : item
    ));
    
    // Start retry process
    await retryScanInBatch(code, 0);
  };

  // Clear entire batch queue
  const handleClearBatchQueue = () => {
    setBatchQueue([]);
    batchSequenceRef.current = 1;
    toast.success("Batch queue cleared", { autoClose: 1500 });
  };

  // Handle printing label from recent scan
  const handlePrintLabelFromScan = async (scanItem) => {
    if (!scanItem.productInfo) {
      toast.error("No product information available to print label");
      return;
    }

    // Get product code (ASIN, UPC, FNSKU, or code)
    const productCode = scanItem.productInfo.asin || scanItem.productInfo.upc || scanItem.productInfo.fnsku || scanItem.productInfo.code || '';
    if (!productCode) {
      toast.error("No product code available to print label");
      return;
    }

    // Use ASIN if available, otherwise use UPC or other code
    let amazonUrl = '';
    if (scanItem.productInfo.asin) {
      amazonUrl = `https://www.amazon.com/dp/${scanItem.productInfo.asin}`;
    } else if (scanItem.productInfo.upc) {
      amazonUrl = `https://www.amazon.com/s?k=${scanItem.productInfo.upc}`;
    } else if (scanItem.productInfo.fnsku) {
      amazonUrl = `https://www.amazon.com/s?k=${scanItem.productInfo.fnsku}`;
    } else {
      amazonUrl = `https://www.amazon.com/s?k=${productCode}`;
    }
    
    // Create QR code with URL or product code
    const qrData = amazonUrl || productCode;
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(qrData)}`;
    
    let labelProductData = { ...scanItem.productInfo };
    
    // If image is missing, try to fetch it (only if we have ASIN)
    if (!labelProductData.image_url && scanItem.productInfo.asin) {
      toast.info("📦 Fetching product image...", { autoClose: 1500 });
      try {
        const rainforestData = await fetchProductDataFromRainforest(scanItem.productInfo.asin);
        if (rainforestData && rainforestData.image) {
          labelProductData.image_url = rainforestData.image;
        }
      } catch (error) {
        console.warn("Could not fetch image from Rainforest API:", error);
      }
    }
    
    const printWindow = window.open('', '_blank');
    const labelContent = createLabelHTML(labelProductData, amazonUrl, qrApiUrl);
    
    printWindow.document.write(labelContent);
    printWindow.document.close();
    
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 800);
    
    toast.success("🖨️ Opening print dialog for 4x6 label");
  };

  // Handle opening Add to Inventory modal
  const handleOpenAddToInventory = () => {
    if (!productInfo) {
      toast.error("No product information available");
      return;
    }
    setInventoryQuantity(1);
    setInventoryLocation(locationOptions[0] || '');
    setInventoryBucket('');
    setInventoryCondition('New');
    setShowAddToInventoryModal(true);
  };

  /**
   * Core path used by single-item modal and batch queue "add all to inventory".
   * @returns {{ ok: boolean, message?: string }}
   */
  const addProductInfoToInventory = async (pi, { quantity, location, bucket, condition, forcedItemNumber = null, preserveExistingItemNumber = true }) => {
    if (!pi) {
      return { ok: false, message: 'No product information' };
    }
    const qty = parseInt(quantity, 10);
    if (!qty || qty < 1) {
      return { ok: false, message: 'Invalid quantity' };
    }
    const normalizedLocation = String(location || '').trim().toUpperCase();
    if (!normalizedLocation || !isValidLocationCode(normalizedLocation, getWarehouseLayoutSettings())) {
      return { ok: false, message: 'Select a valid shelf location from your Warehouse Layout settings.' };
    }
    const finalLocation = composeStorageLocation(normalizedLocation, bucket);

    let productId = null;
    const existingProduct = await dbProductLookupService.getProductByFnsku(pi.fnsku || pi.sku);

    if (existingProduct) {
      productId = existingProduct.id;
    } else {
      try {
        const allImages = pi.images || (pi.image_url ? [pi.image_url] : []);
        const allVideos = pi.videos || [];
        const mediaPayload = (allImages.length > 0 || allVideos.length > 0)
          ? JSON.stringify({ images: allImages, videos: allVideos })
          : (allImages.length > 0 ? JSON.stringify(allImages) : null);

        const productData = {
          name: pi.name || 'Unknown Product',
          sku: pi.fnsku || pi.sku || pi.asin,
          fnsku: pi.fnsku,
          asin: pi.asin,
          lpn: pi.lpn,
          upc: pi.upc,
          price: pi.price,
          category: pi.category || 'Uncategorized',
          description: pi.description || pi.name,
          image_url: mediaPayload,
          condition: condition || 'New',
          source: 'Scanner',
          created_at: new Date().toISOString(),
        };

        const savedProduct = await dbProductLookupService.saveProductToManifest(productData, { conflictKey: 'fnsku' });
        productId = savedProduct?.id;
      } catch (manifestError) {
        console.warn('Could not save to manifest_data (may be RLS restricted):', manifestError);
      }
    }

    const existingInventory = await inventoryService.getInventoryBySku(pi.fnsku || pi.sku || pi.asin);
    const allImages = pi.images || (pi.image_url ? [pi.image_url] : []);
    const allVideos = pi.videos || [];
    const imageUrlForInventory = (allImages.length > 0 || allVideos.length > 0)
      ? JSON.stringify({ images: allImages, videos: allVideos })
      : (pi.image_url || '');

    const nextItemNumber = forcedItemNumber
      || ((preserveExistingItemNumber && existingInventory?.item_number) ? existingInventory.item_number : null)
      || getNextItemNumber(finalLocation);

    const inventoryItem = {
      sku: pi.fnsku || pi.sku || pi.asin,
      name: pi.name || 'Unknown Product',
      quantity: qty,
      location: finalLocation,
      condition: condition || 'New',
      price: pi.price != null ? Number(pi.price) : 0,
      cost: pi.price != null ? (Number(pi.price) * ((100 - (parseFloat(localStorage.getItem('labelDiscountPercent')) || 50)) / 100)) : 0,
      image_url: imageUrlForInventory,
      item_number: nextItemNumber,
    };

    if (productId) {
      inventoryItem.product_id = productId;
    }

    const result = await inventoryService.addOrUpdateInventory(inventoryItem);
    if (result) {
      return {
        ok: true,
        message: `${qty} ${qty === 1 ? 'item' : 'items'}${existingInventory ? ' (quantity updated)' : ''}`,
      };
    }
    return { ok: false, message: inventoryService.lastInventoryError || 'Please try again.' };
  };

  // Handle adding product to inventory (modal)
  const handleAddToInventory = async () => {
    if (!productInfo) {
      toast.error("No product information available");
      return;
    }
    if (!inventoryQuantity || inventoryQuantity < 1) {
      toast.error("Please enter a valid quantity (at least 1)");
      return;
    }
    if (!inventoryLocation || !isValidLocationCode(inventoryLocation, getWarehouseLayoutSettings())) {
      toast.error("Please select a valid shelf location");
      return;
    }

    setIsAddingToInventory(true);
    try {
      const { ok, message } = await addProductInfoToInventory(productInfo, {
        quantity: inventoryQuantity,
        location: inventoryLocation,
        bucket: inventoryBucket,
        condition: inventoryCondition,
      });
      if (ok) {
        toast.success(`Added to inventory: ${message}`);
        setShowAddToInventoryModal(false);
        setInventoryQuantity(1);
        setInventoryLocation(locationOptions[0] || '');
        setInventoryBucket('');
        setInventoryCondition('New');
      } else {
        toast.error(`Failed to add to inventory. ${message || ''}`);
      }
    } catch (error) {
      console.error("Error adding to inventory:", error);
      toast.error(`Failed to add to inventory: ${error.message || 'Unknown error'}`);
    } finally {
      setIsAddingToInventory(false);
    }
  };

  /** Add every ready item in batch queue to inventory (qty 1 each, selected location / New). */
  const handleAddBatchQueueToInventory = async () => {
    const ready = batchQueue.filter(
      (q) => q.product && !q.isProcessing && !q.hasFailed && (q.product.fnsku || q.product.sku || q.product.asin)
    ).sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
    if (ready.length === 0) {
      toast.warning('No completed products in the batch queue to add. Wait for lookups to finish or fix failed rows.');
      return;
    }
    const targetLocation = String(batchInventoryLocation || '').trim().toUpperCase();
    if (!targetLocation || !isValidLocationCode(targetLocation, getWarehouseLayoutSettings())) {
      toast.error('Select a valid location before saving batch scans to inventory.');
      return;
    }
    if (!locationOptions.length) {
      toast.error('No shelf locations are configured. Set them in Settings > Warehouse Layout Settings.');
      return;
    }
    const finalBatchLocation = composeStorageLocation(targetLocation, batchInventoryBucket);
    if (!window.confirm(`Add ${ready.length} product(s) to inventory with quantity 1 each (location: ${finalBatchLocation}, condition: New)?`)) {
      return;
    }
    setIsBulkAddingBatchToInventory(true);
    let okCount = 0;
    let failCount = 0;
    try {
      // Assign item numbers in true scan order first so numbering remains stable.
      const assignedItemNumbers = new Map();
      for (const q of ready) {
        assignedItemNumbers.set(q.id, getNextItemNumber(finalBatchLocation));
      }

      // Inventory page is ordered newest-first; insert in reverse so UI order matches scan order.
      const addSequence = [...ready].reverse();
      for (const q of addSequence) {
        const { ok } = await addProductInfoToInventory(q.product, {
          quantity: 1,
          location: targetLocation,
          bucket: batchInventoryBucket,
          condition: 'New',
          forcedItemNumber: assignedItemNumbers.get(q.id),
          preserveExistingItemNumber: false,
        });
        if (ok) okCount += 1;
        else failCount += 1;
      }
      if (okCount > 0) {
        toast.success(`Added ${okCount} product(s) to inventory at ${finalBatchLocation}.${failCount ? ` ${failCount} failed.` : ''}`);
      }
      if (failCount > 0 && okCount === 0) {
        toast.error(`Could not add batch to inventory (${failCount} failed). Check login and SKU data.`);
      }
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'Batch add to inventory failed');
    } finally {
      setIsBulkAddingBatchToInventory(false);
    }
  };

  function productNeedsAmazonEnrich(product) {
    if (!product) return false;
    const hasImg = !!(product.image_url && String(product.image_url).trim()) ||
      (Array.isArray(product.images) && product.images.length > 0);
    const minimal = product.source === 'manifest_data' || product.source === 'products';
    return !hasImg || minimal;
  }

  const showAmazonEnrichButton = !batchMode && !!productInfo && productNeedsAmazonEnrich(productInfo);

  const handleEnrichAllBatchFromAmazon = async () => {
    if (!userId) {
      toast.error('Sign in required');
      return;
    }
    const targets = batchQueue.filter(
      (q) => q.product && !q.isProcessing && !q.hasFailed && productNeedsAmazonEnrich(q.product)
    );
    if (targets.length === 0) {
      toast.info('No queue items need Amazon enrichment (all have images and full listing data).');
      return;
    }
    setBatchEnrichAllRunning(true);
    try {
      toast.info(`Fetching Amazon details for ${targets.length} item(s)…`, { autoClose: 3000 });
      for (let i = 0; i < targets.length; i += 1) {
        await lookupProductByCode(targets[i].code, { forceApiLookup: true, suppressBatchItemToast: true });
        if (i < targets.length - 1) {
          await new Promise((r) => setTimeout(r, 450));
        }
      }
      toast.success(`Finished Amazon enrichment for ${targets.length} item(s). Data is saved for future scans.`, { autoClose: 4500 });
    } catch (e) {
      console.error(e);
      toast.error(e?.message || 'Batch Amazon enrichment failed.');
    } finally {
      setBatchEnrichAllRunning(false);
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-8">

      {/* Scan Count Display (Free Trial) - Show banner with minimal loading state so layout stays stable; hide once we know user is CEO/paid */}
      {(scanCountLoading || (!scanCount.isPaid && !isCEOAdmin)) && (
        <div className="mb-4 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Free Trial Scans</h3>
                {scanCountLoading ? (
                  <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400 animate-pulse">
                    … / 50 scans used
                  </p>
                ) : (
                  <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                    {scanCount.used} / {scanCount.limit || 50} scans used
                    {scanCount.remaining !== null && (
                      <span className="text-sm font-normal text-gray-600 dark:text-gray-400 ml-2">
                        ({scanCount.remaining} remaining)
                      </span>
                    )}
                  </p>
                )}
              </div>
            </div>
            {!scanCountLoading && scanCount.remaining !== null && scanCount.remaining <= 10 && scanCount.remaining > 0 && (
              <div className="flex-shrink-0">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                  ⚠️ {scanCount.remaining} scans left
                </span>
              </div>
            )}
            {!scanCountLoading && scanCount.remaining === 0 && (
              <div className="flex-shrink-0">
                <button
                  onClick={() => {
                    navigate('/pricing?upgrade=required', {
                      state: {
                        message: 'Your free trial of 50 scans has been used. Please upgrade to continue scanning.',
                        usedScans: scanCount.used,
                        limit: scanCount.limit
                      }
                    });
                  }}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Upgrade Now
                </button>
              </div>
            )}
          </div>
          {!scanCountLoading && scanCount.remaining !== null && scanCount.remaining > 0 && scanCount.limit > 0 && (
            <div className="mt-3">
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-indigo-600 dark:bg-indigo-400 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(scanCount.used / scanCount.limit) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Batch Mode Toggle */}
      <div className="mb-4 flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-center space-x-3">
          <input
            type="checkbox"
            id="batchMode"
            checked={batchMode}
            onChange={(e) => {
              setBatchMode(e.target.checked);
              if (!e.target.checked) {
                // When turning off batch mode, clear the queue or show a message
                if (batchQueue.length > 0) {
                  toast.info(`Batch mode disabled. ${batchQueue.length} items in queue.`, { autoClose: 3000 });
                }
              } else {
                toast.success("Batch mode enabled - scans will be added to queue", { autoClose: 2000 });
                // Auto-focus search bar when batch mode is enabled for continuous scanning
                setTimeout(() => {
                  if (searchInputRef.current) {
                    searchInputRef.current.focus();
                  }
                }, 200);
              }
            }}
            className="h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="batchMode" className="text-lg font-semibold text-gray-800 dark:text-gray-200 cursor-pointer">
            Batch Scan Mode
          </label>
          {batchMode && (
            <span className="px-3 py-1 bg-blue-600 text-white text-sm font-medium rounded-full">
              {batchQueue.length} items in queue
            </span>
          )}
        </div>
        {batchMode && batchQueue.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              onClick={handleEnrichAllBatchFromAmazon}
              disabled={isBulkAddingBatchToInventory || isPrintingBatch || isPrintingBatchBarcode || batchEnrichAllRunning || batchForceLookupCode !== null}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              title="Fetches images and listing details from Amazon for every queue item that still needs them, and saves to the database"
            >
              <ArrowPathIcon className={`-ml-1 mr-2 h-5 w-5 shrink-0 ${batchEnrichAllRunning ? 'animate-spin' : ''}`} />
              {batchEnrichAllRunning ? 'Enriching queue…' : 'Amazon API (all needing data)'}
            </button>
            <button
              type="button"
              onClick={handleAddBatchQueueToInventory}
              disabled={isBulkAddingBatchToInventory || isPrintingBatch || isPrintingBatchBarcode || batchEnrichAllRunning || !batchInventoryLocation}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
            >
              <ShoppingBagIcon className="-ml-1 mr-2 h-5 w-5" />
              {isBulkAddingBatchToInventory ? 'Adding…' : 'Add all to inventory'}
            </button>
            <button
              type="button"
              onClick={handlePrintAllBatch}
              disabled={isPrintingBatch || isPrintingBatchBarcode || isBulkAddingBatchToInventory || batchEnrichAllRunning}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50"
            >
              <PrinterIcon className="-ml-1 mr-2 h-5 w-5" />
              {isPrintingBatch ? `Printing...` : `Print All (${batchQueue.length})`}
            </button>
            <button
              type="button"
              onClick={handlePrintAllBatchBarcode}
              disabled={isPrintingBatchBarcode || isPrintingBatch || isBulkAddingBatchToInventory || batchEnrichAllRunning}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              <PrinterIcon className="-ml-1 mr-2 h-5 w-5" />
              {isPrintingBatchBarcode ? 'Printing barcodes...' : `Print Barcode Labels (${batchQueue.length})`}
            </button>
            <button
              type="button"
              onClick={handleClearBatchQueue}
              disabled={isBulkAddingBatchToInventory || isPrintingBatch || isPrintingBatchBarcode || batchEnrichAllRunning}
              className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md shadow-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              Clear Queue
            </button>
          </div>
        )}
      </div>

      {batchMode && (
        <div className="mb-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex flex-col md:flex-row md:items-end gap-3">
            <label htmlFor="batchInventoryLocation" className="text-sm font-medium text-gray-700 dark:text-gray-200 min-w-fit">
              Batch save location
            </label>
            <select
              id="batchInventoryLocation"
              name="batchInventoryLocation"
              value={batchInventoryLocation}
              onChange={(e) => setBatchInventoryLocation(e.target.value)}
              className="block w-full md:w-72 pl-3 pr-10 py-2 text-sm border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-md"
            >
              <option value="">Select area/shelf location</option>
              {locationOptions.map((locationCode) => (
                <option key={`batch-${locationCode}`} value={locationCode}>
                  {locationCode}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setIsAddingShelfInline((prev) => !prev)}
              className="inline-flex items-center justify-center px-3 py-2 text-sm font-semibold rounded-md border border-indigo-300 text-indigo-700 bg-white hover:bg-indigo-50"
            >
              + Shelf
            </button>
            <div className="flex flex-col">
              <label htmlFor="batchInventoryBucket" className="text-sm font-medium text-gray-700 dark:text-gray-200">
                Bucket (optional)
              </label>
              <select
                id="batchInventoryBucket"
                name="batchInventoryBucket"
                value={batchInventoryBucket}
                onChange={(e) => setBatchInventoryBucket(e.target.value)}
                className="block w-full md:w-44 pl-3 pr-10 py-2 text-sm border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-md"
              >
                <option value="">No bucket</option>
                {Array.from({ length: 10 }, (_, index) => {
                  const bucketCode = `B${index + 1}`;
                  return (
                    <option key={bucketCode} value={bucketCode}>
                      {bucketCode}
                    </option>
                  );
                })}
              </select>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-300">
              Pick location first, then scan in batch mode. "Add all to inventory" saves every scanned item to this location (and bucket, if provided).
            </p>
          </div>
          {isAddingShelfInline && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Area</label>
                <select
                  value={newShelfArea}
                  onChange={(e) => setNewShelfArea(e.target.value)}
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-sm border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-md"
                >
                  {getQuickAreaOptions().map((areaCode) => (
                    <option key={`quick-area-${areaCode}`} value={areaCode}>
                      {formatAreaLabel(areaCode)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">How many shelves</label>
                <input
                  type="number"
                  min="1"
                  max="25"
                  value={newShelvesCount}
                  onChange={(e) => setNewShelvesCount(parseInt(e.target.value, 10) || 1)}
                  className="mt-1 block w-full px-3 py-2 text-sm border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-md"
                />
              </div>
              <div className="md:col-span-2 flex gap-2">
                <button
                  type="button"
                  onClick={handleQuickAddShelf}
                  className="inline-flex items-center px-3 py-2 text-sm font-semibold rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  Add shelf
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddingShelfInline(false)}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md border border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Batch Queue Display */}
      {batchMode && batchQueue.length > 0 && (
        <div className="mb-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-md p-4">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">Batch Queue ({batchQueue.length} items)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-64 overflow-y-auto">
            {batchQueue.map((item) => (
              <div 
                key={item.id} 
                className={`border rounded-lg p-3 ${
                  item.isProcessing 
                    ? 'border-yellow-300 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/20' 
                    : item.hasFailed
                    ? 'border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/20'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700'
                } hover:bg-opacity-80 transition-colors`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-mono text-xs text-gray-600 dark:text-gray-400">{item.code}</p>
                      {item.isProcessing && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                          <svg className="animate-spin -ml-1 mr-1 h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Processing...
                        </span>
                      )}
                      {item.hasFailed && !item.isProcessing && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                          Failed
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2">
                      {item.product?.name || 'Loading...'}
                    </p>
                    {item.product?.asin && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">ASIN: {item.product.asin}</p>
                    )}
                    {item.product?.price && item.product.price !== '' && item.product.price !== '0' && item.product.price !== '0.00' && (
                      <p className="text-xs text-green-600 dark:text-green-400 font-semibold mt-1">
                        ${parseFloat(item.product.price).toFixed(2)}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 ml-2">
                    {(item.isProcessing || item.hasFailed) && (
                      <button
                        onClick={() => handleManualRetry(item.code)}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 p-1 rounded flex-shrink-0"
                        title="Retry scan"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={() => handleRemoveFromBatch(item.id)}
                      className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 p-1 rounded flex-shrink-0"
                      title="Remove from queue"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {item.product?.image_url && (
                  <img
                    src={item.product.image_url}
                    alt={item.product.name || 'Product'}
                    className="mt-2 h-16 w-16 object-contain border border-gray-200 rounded mx-auto"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                )}
                {!item.product?.image_url && item.isProcessing && (
                  <div className="mt-2 h-16 w-16 border border-gray-200 rounded mx-auto flex items-center justify-center bg-gray-100 dark:bg-gray-600">
                    <svg className="animate-spin h-6 w-6 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                )}
                {item.product && productNeedsAmazonEnrich(item.product) && !item.isProcessing && !item.hasFailed && (
                  <button
                    type="button"
                    onClick={() => lookupProductByCode(item.code, { forceApiLookup: true })}
                    disabled={!userId || batchEnrichAllRunning || batchForceLookupCode !== null}
                    className="mt-2 w-full px-2 py-1.5 text-xs font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {batchForceLookupCode === item.code ? (
                      <span className="inline-flex items-center justify-center gap-1.5">
                        <span className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" aria-hidden="true" />
                        Fetching…
                      </span>
                    ) : (
                      'Fetch images & details (Amazon API)'
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Search Bar and Import Button */}
      <div className="mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex-grow w-full md:w-auto">
          <label htmlFor="productSearchTop" className="sr-only">Search by LPN, FNSKU, or ASIN</label>
          <input
            ref={searchInputRef}
            type="text"
            name="productSearchTop"
            id="productSearchTop"
            className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md p-3"
            placeholder={batchMode ? "Scan FNSKU (Enter to scan, keeps scanning)" : "Scan or search by LPN, FNSKU, or ASIN (Press Enter to scan)"}
            value={searchQuery}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            autoFocus={batchMode}
          />
        </div>
        <div className="flex items-center space-x-2 flex-shrink-0">
          <input 
            id="exactMatch" 
            name="exactMatch" 
            type="checkbox" 
            className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            checked={exactMatch} 
            onChange={(e) => setExactMatch(e.target.checked)} 
          />
          <label htmlFor="exactMatch" className="text-sm text-gray-700 dark:text-gray-300">Exact Match</label>
        </div>
        <button
          type="button"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 whitespace-nowrap"
          onClick={() => setShowFileImportModal(true)}
          disabled={loading}
        >
          <ArrowUpTrayIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
          Import File
        </button>
      </div>
      
      {/* Search Results Dropdown (positioned relative to the search bar container) */}
      {showSearchResults && (
        <div className="mb-6 relative">
            {searchResults.length > 0 ? (
                <ul className="absolute w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto z-20">
                    {searchResults.map((product) => (
                        <li 
                            key={product.id || product.sku} 
                            className="p-3 hover:bg-indigo-100 cursor-pointer text-sm"
                            onClick={() => selectProduct(product)}
                        >
                            {product.name} ({product.sku || product.asin || product.fnsku})
                        </li>
                    ))}
                </ul>
            ) : (
                searchQuery.length >=2 && !searchLoading && (
                     <div className="absolute w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg p-3 text-sm text-gray-500 dark:text-gray-400 z-20">
                        No products found for "{searchQuery}".
                    </div>
                )
            )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Barcode Scanner */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">Barcode Scanner</h2>
          <button
            type="button"
            className="w-full mb-4 inline-flex items-center justify-center px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            onClick={() => setIsCameraActive(true)}
            disabled={loading}
          >
            <ShoppingBagIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
            Start Camera Scan
          </button>

          {isCameraActive && (
            <div className="mb-4">
              <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-4 md:p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <QrCodeIcon className="h-6 w-6 text-green-400" />
                    Barcode Scanner
                  </h3>
                  <div className="flex items-center gap-2">
                    {!usePhotoFallback && (
                      <button
                        type="button"
                        onClick={() => setUsePhotoFallback(true)}
                        className="text-xs text-gray-300 hover:text-white border border-gray-500 hover:border-gray-400 px-2 py-1 rounded"
                      >
                        Take photo instead
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setIsCameraActive(false); setUsePhotoFallback(false); }}
                      className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                      title="Close Scanner"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
                {usePhotoFallback ? (
                  <BarcodeReader
                    onCodeDetected={handleCodeDetected}
                    active={isCameraActive}
                    showViewFinder={true}
                    className="w-full"
                  />
                ) : (
                  <BarcodeScanner
                    scannerRunning={isCameraActive}
                    onDetected={handleCodeDetected}
                    onError={() => {}}
                    onFallbackToPhoto={() => setUsePhotoFallback(true)}
                    enableOcrFallback={true}
                    className="w-full"
                  />
                )}
              </div>
            </div>
          )}

          {/* Manual Barcode Entry section removed - use the top search bar instead */}
          {/* The top search bar supports both searching existing products and direct barcode lookup */}
          {/* Simply type a barcode and press Enter, or use the search dropdown for existing products */}
        </div>

        {/* Right Column: Product Information */}
        <div ref={productInfoSectionRef} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Product Information</h2>
            <div>
              <button 
                type="button" 
                className="mr-2 inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 shadow-sm text-xs font-medium rounded text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                onClick={() => setProductInfo(null)} // Reset button
                disabled={!productInfo || loading}
              >
                Reset
              </button>
              <button 
                type="button" 
                className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                onClick={handleViewDetails} // View Details button
                disabled={!productInfo || loading}
              >
                View Details
              </button>
            </div>
          </div>

          {loading && (
            <div className="text-center py-10">
              <p className="text-gray-500 dark:text-gray-400 animate-pulse">Loading product information...</p>
            </div>
          )}

          {!loading && notInDatabaseMessage && (
            <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-md">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-1">Product not in lookup database</p>
              <p className="text-sm text-amber-700 dark:text-amber-300">{notInDatabaseMessage}</p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">This is not the same as &quot;still loading&quot;—our system does not have this item in its database. You may try again later or add the product manually.</p>
              <button
                type="button"
                className="mt-3 px-3 py-1.5 text-xs font-medium rounded border border-amber-500 text-amber-700 dark:text-amber-300 bg-white dark:bg-gray-800 hover:bg-amber-50 dark:hover:bg-amber-900/30"
                onClick={() => { setNotInDatabaseMessage(null); setProductInfo(null); }}
              >
                Dismiss
              </button>
            </div>
          )}

          {!loading && !productInfo && !notInDatabaseMessage && (
            <div className="text-center py-10 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-md">
              <p className="text-gray-500 dark:text-gray-400">Scan a barcode, use manual lookup, or search for a product to view details.</p>
            </div>
          )}

          {productInfo && !loading && (
            <div>
              {/* Auto-refreshing and API processing messages */}
              {isAutoRefreshing && (
                <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md flex items-center justify-between">
                    <div className="flex items-center">
                        <CheckCircleIcon className="h-5 w-5 text-blue-500 dark:text-blue-400 mr-2 animate-spin" /> {/* Using CheckCircleIcon for consistency, or a spinner icon */}
                        <p className="text-sm text-blue-700 dark:text-blue-300">Auto-Refreshing: {autoRefreshCode}. Next check in: {autoRefreshCountdown}s</p>
                    </div>
                  <button 
                    onClick={stopAutoRefresh} 
                    className="ml-2 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900 rounded hover:bg-blue-200 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    Stop Auto-Refresh
                  </button>
                </div>
              )}
              {isApiProcessing && !isAutoRefreshing && !notInDatabaseMessage && (
                <div className="mb-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-800 rounded-md flex items-center gap-2">
                    <span className="inline-block h-4 w-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">Looking up this product (FNSKU: {lastScannedCode}). Updating automatically—no need to do anything.</p>
                </div>
              )}
              <div className="mb-2 p-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Code Type: {productInfo.code_type || 'N/A'} ({productInfo.code_type === 'FNSKU' ? 'Fulfillment Network Stock Keeping Unit' : productInfo.code_type})</span>
              </div>
              {scanLatency && (
                <div className="mb-3 p-2 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-600 rounded-md">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                    Scan latency: {formatScanLatencySource(scanLatency.source)} - {scanLatency.elapsedMs}ms
                    {scanLatency.code ? ` - ${scanLatency.code}` : ''}
                  </span>
                </div>
              )}

              {apiEnrichLoading && (
                <div className="mb-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-md flex items-center gap-2">
                  <span className="inline-block h-4 w-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin shrink-0" aria-hidden="true" />
                  <p className="text-sm text-indigo-800 dark:text-indigo-200">Loading images and details from Amazon…</p>
                </div>
              )}

              {showAmazonEnrichButton && (
                <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-600 rounded-md">
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                    Missing photos or only basic catalog data? Fetch listing images and extra details from Amazon. Live lookups may count toward your scan quota or incur API usage.
                  </p>
                  <button
                    type="button"
                    onClick={handleFetchImagesFromApi}
                    disabled={apiEnrichLoading || loading || !userId}
                    className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ArrowPathIcon className={`h-4 w-4 mr-2 shrink-0 ${apiEnrichLoading ? 'animate-spin' : ''}`} />
                    {apiEnrichLoading ? 'Fetching from Amazon…' : 'Fetch images & details (Amazon API)'}
                  </button>
                </div>
              )}

              {/* Product Images - Show all if available */}
              {productInfo.images && productInfo.images.length > 0 ? (
                <div className="mb-4">
                  <div className="flex justify-center items-center gap-2 mb-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {productInfo.images.length} image{productInfo.images.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {productInfo.images.map((imgUrl, index) => (
                      <div key={index} className="relative group">
                        <img 
                          src={imgUrl} 
                          alt={`${productInfo.name || 'Product'} - Image ${index + 1}`} 
                          className="max-w-full h-48 w-auto object-contain border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 shadow-sm cursor-pointer hover:shadow-lg transition-shadow"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                          onClick={() => {
                            // Open image in new tab on click
                            window.open(imgUrl, '_blank');
                          }}
                          title="Click to view full size"
                        />
                        {index === 0 && (
                          <span className="absolute top-1 left-1 bg-blue-500 text-white text-xs px-2 py-1 rounded">
                            Main
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : productInfo.image_url ? (
                <div className="mb-4 flex justify-center">
                  <img 
                    src={productInfo.image_url} 
                    alt={productInfo.name || 'Product'} 
                    className="max-w-full h-48 w-auto object-contain border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 shadow-sm"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                </div>
              ) : null}

              {/* Product Videos - Show all if available */}
              {productInfo.videos && productInfo.videos.length > 0 && (
                <div className="mb-4">
                  <div className="flex justify-center items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      🎥 {productInfo.videos.length} video{productInfo.videos.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {productInfo.videos.map((video, index) => (
                      <div key={video.id || index} className="relative group border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-700 shadow-sm hover:shadow-lg transition-shadow">
                        {/* Video Thumbnail */}
                        {video.video_image_url && (
                          <div className="relative aspect-video bg-gray-100 dark:bg-gray-800">
                            <img 
                              src={video.video_image_url} 
                              alt={video.title || `Video ${index + 1}`}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.target.style.display = 'none';
                              }}
                            />
                            {/* Play Button Overlay */}
                            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 group-hover:bg-opacity-50 transition-opacity">
                              <div className="bg-white bg-opacity-90 rounded-full p-3 group-hover:scale-110 transition-transform">
                                <svg className="w-8 h-8 text-gray-900" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                                </svg>
                              </div>
                            </div>
                            {/* Duration Badge */}
                            {video.duration && (
                              <span className="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded">
                                {video.duration}
                              </span>
                            )}
                          </div>
                        )}
                        {/* Video Info */}
                        <div className="p-3">
                          <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1 line-clamp-2">
                            {video.title || `Video ${index + 1}`}
                          </h4>
                          {video.public_name && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              by {video.public_name}
                            </p>
                          )}
                        </div>
                        {/* Click to play */}
                        <button
                          onClick={() => {
                            if (video.video_url) {
                              // Open video in new tab or play in modal
                              window.open(video.video_url, '_blank');
                            } else if (video.video_previews) {
                              window.open(video.video_previews, '_blank');
                            }
                          }}
                          className="absolute inset-0 w-full h-full opacity-0 hover:opacity-100 transition-opacity"
                          title="Click to play video"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{productInfo.name || 'N/A'}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">FNSKU: {productInfo.fnsku || 'N/A'} {productInfo.asin_found === false ? '(No ASIN found)' : ''}</p>
              {productInfo.description && (
                <div className="text-sm text-gray-700 dark:text-gray-300 mb-3 p-2 bg-gray-50 dark:bg-gray-700/50 rounded border border-gray-200 dark:border-gray-600">
                  <p className="font-medium text-gray-600 dark:text-gray-400 mb-1">Description</p>
                  <p className="whitespace-pre-wrap">{productInfo.description}</p>
                </div>
              )}
              <div className="text-sm space-y-0.5 text-gray-700 dark:text-gray-300 mb-3">
                <p>LPN (X-Z ASIN): {productInfo.lpn || 'N/A'}</p>
                <p>FNSKU: {productInfo.fnsku || 'N/A'}</p> {/* Repeated from above for specific layout, can be removed if redundant */}
                <p>ASIN (B00): {productInfo.asin || 'N/A'}</p>
                <p>UPC: {productInfo.upc || 'N/A'}</p>
                <p>Category: {productInfo.category || 'N/A'}</p>
                <p>Quantity: {productInfo.quantity || 'N/A'}</p>
                <p>MSRP: <span className="font-semibold text-green-600">${productInfo.price != null ? parseFloat(productInfo.price).toFixed(2) : '0.00'}</span></p>
              </div>

              <div className="mt-3 flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
                    onClick={handleViewOnAmazon}
                    disabled={loading || !productInfo}
                  >
                    <ArrowTopRightOnSquareIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
                    View on Amazon
                  </button>
                  <button
                    type="button"
                    className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    onClick={handlePrintLabel}
                    disabled={loading || !productInfo}
                  >
                    <PrinterIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
                    Print Label
                  </button>
                  <button
                    type="button"
                    className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    onClick={() => handlePrintBarcodeLabel(productInfo)}
                    disabled={loading || !productInfo || !getProductCodeForLabel(productInfo)}
                  >
                    <PrinterIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
                    Print Barcode Label
                  </button>
                </div>
                <button
                  type="button"
                  className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                  onClick={handleOpenAddToInventory}
                  disabled={loading || !productInfo}
                >
                  <ShoppingBagIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
                  Add to Inventory
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Section: Recent Scans */}
      <div className="mt-6 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Recent Scans</h2>
          {scannedCodes.length > 0 && (
            <button
              onClick={handleClearAllScans}
              className="text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 font-medium"
            >
              Clear All
            </button>
          )}
        </div>
        {scannedCodes.length > 0 ? (
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {scannedCodes.map((item, index) => {
              const imgUrl = item.productInfo?.image_url || (item.productInfo?.images && item.productInfo.images[0]);
              const priceVal = item.productInfo?.price;
              const numPrice = priceVal != null && priceVal !== '' ? parseFloat(priceVal) : null;
              const hasRealPrice = numPrice != null && !Number.isNaN(numPrice) && numPrice > 0;
              const priceDisplay = hasRealPrice ? `$${numPrice.toFixed(2)}` : null;
              return (
              <div key={`${item.code}-${item.timestamp}-${index}`} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex flex-1 min-w-0 gap-3">
                    <div className="shrink-0 w-16 h-16 rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden bg-white dark:bg-gray-600 flex items-center justify-center">
                      {imgUrl ? (
                        <img
                          src={imgUrl}
                          alt={item.productInfo?.name || item.code || 'Product'}
                          className="w-full h-full object-contain"
                          onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling?.classList.remove('hidden'); }}
                        />
                      ) : null}
                      <div className={`w-full h-full flex items-center justify-center text-gray-400 ${imgUrl ? 'hidden' : ''}`}>
                        <QrCodeIcon className="h-8 w-8" />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="font-mono text-sm font-semibold text-gray-800 dark:text-gray-200">{item.code}</span>
                        <span className="capitalize text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">({item.type})</span>
                        {priceDisplay ? (
                          <span className="text-sm font-semibold text-green-600 dark:text-green-400">{priceDisplay}</span>
                        ) : (
                          <span className="text-xs italic text-amber-600 dark:text-amber-400">No price</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 dark:text-gray-500">{new Date(item.timestamp).toLocaleString()}</span>
                      {item.productInfo ? (
                        <div className="mt-2 space-y-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2">{item.productInfo.name || item.code || 'Product'}</p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
                            {item.productInfo.asin && <span>ASIN: <span className="font-mono">{item.productInfo.asin}</span></span>}
                            {item.productInfo.fnsku && <span>FNSKU: <span className="font-mono">{item.productInfo.fnsku}</span></span>}
                            {item.productInfo.lpn && <span>LPN: <span className="font-mono">{item.productInfo.lpn}</span></span>}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 dark:text-gray-400 italic mt-1">Loading product details...</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteScan(index)}
                    className="ml-2 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 p-1 rounded flex-shrink-0"
                    title="Delete this scan"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>
                {item.productInfo && (
                  <div className="mt-3 flex flex-col gap-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleRescanFromScan(item)}
                        className="inline-flex items-center justify-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-xs font-medium rounded-md shadow-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        title="Show this product in the Product Information panel"
                      >
                        <ArrowPathIcon className="h-3 w-3 mr-1" />
                        Rescan
                      </button>
                      {(item.productInfo.asin || item.productInfo.upc || item.productInfo.fnsku || item.productInfo.code) && (
                        <>
                          <button
                            onClick={() => handleViewOnAmazonFromScan(item)}
                            className="inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
                          >
                            <ArrowTopRightOnSquareIcon className="h-3 w-3 mr-1" />
                            View on Amazon
                          </button>
                          <button
                            onClick={() => handlePrintLabelFromScan(item)}
                            className="inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                          >
                            <PrinterIcon className="h-3 w-3 mr-1" />
                            Print Label
                          </button>
                          <button
                            onClick={() => handlePrintBarcodeLabel(item.productInfo)}
                            className="inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                          >
                            <PrinterIcon className="h-3 w-3 mr-1" />
                            Barcode Label
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => {
                          setProductInfo(item.productInfo);
                          handleOpenAddToInventory();
                        }}
                        className="inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                      >
                        <ShoppingBagIcon className="h-3 w-3 mr-1" />
                        Add to Inventory
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
            })}
          </div>
        ) : (
          <p className="text-center text-gray-500 py-4">No recent scans.</p>
        )}
      </div>

      {/* Modals are kept the same as previous version */}
      {showMarketplaceListing && productInfo && (
        <MarketplaceListing 
          product={productInfo} 
          onClose={handleCloseListing} 
          onSuccess={handleListingSuccess} 
        />
      )}
      {showShopifyListing && productInfo && (
         <ShopifyListing
          productData={productInfo}
          onClose={handleCloseShopifyListing}
          onSuccess={handleShopifySuccess}
        />
      )}
      {/* Add to Inventory Modal */}
      {showAddToInventoryModal && productInfo && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50 p-4">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Add to Inventory</h2>
              <button 
                onClick={() => setShowAddToInventoryModal(false)} 
                className="text-gray-500 hover:text-gray-700"
                disabled={isAddingToInventory}
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            
            <div className="mb-4 p-3 bg-gray-50 rounded-md">
              <p className="text-sm font-medium text-gray-900">{productInfo.name || 'Product'}</p>
              <p className="text-xs text-gray-600 mt-1">
                {productInfo.fnsku && `FNSKU: ${productInfo.fnsku}`}
                {productInfo.asin && ` • ASIN: ${productInfo.asin}`}
              </p>
            </div>

            <div className="mb-4">
              <label htmlFor="inventoryQuantity" className="block text-sm font-medium text-gray-700 mb-1">
                Quantity <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                id="inventoryQuantity"
                name="inventoryQuantity"
                min="1"
                value={inventoryQuantity}
                onChange={(e) => setInventoryQuantity(parseInt(e.target.value, 10) || 1)}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                disabled={isAddingToInventory}
                required
              />
            </div>

            <div className="mb-4">
              <label htmlFor="inventoryLocation" className="block text-sm font-medium text-gray-700 mb-1">
                Location <span className="text-red-500">*</span>
              </label>
              <select
                id="inventoryLocation"
                name="inventoryLocation"
                value={inventoryLocation}
                onChange={(e) => setInventoryLocation(e.target.value)}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                disabled={isAddingToInventory}
                required
              >
                <option value="">Select area/shelf location</option>
                {locationOptions.map((locationCode) => (
                  <option key={locationCode} value={locationCode}>
                    {locationCode}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setIsAddingShelfInline((prev) => !prev)}
                className="mt-2 inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-md border border-indigo-300 text-indigo-700 bg-white hover:bg-indigo-50"
              >
                + Add shelf
              </button>
              {isAddingShelfInline && (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select
                    value={newShelfArea}
                    onChange={(e) => setNewShelfArea(e.target.value)}
                    className="block w-full pl-3 pr-10 py-2 text-sm border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-md"
                  >
                    {getQuickAreaOptions().map((areaCode) => (
                      <option key={`modal-area-${areaCode}`} value={areaCode}>
                        {formatAreaLabel(areaCode)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    max="25"
                    value={newShelvesCount}
                    onChange={(e) => setNewShelvesCount(parseInt(e.target.value, 10) || 1)}
                    className="block w-full px-3 py-2 text-sm border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-md"
                  />
                  <button
                    type="button"
                    onClick={handleQuickAddShelf}
                    className="inline-flex items-center justify-center px-3 py-2 text-sm font-semibold rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    Save shelf
                  </button>
                </div>
              )}
              <p className="mt-1 text-xs text-gray-500">
                Manage areas/shelves in Settings {'>'} Warehouse Layout Settings.
              </p>
            </div>

            <div className="mb-4">
              <label htmlFor="inventoryBucket" className="block text-sm font-medium text-gray-700 mb-1">
                Bucket (optional)
              </label>
              <input
                type="text"
                id="inventoryBucket"
                name="inventoryBucket"
                value={inventoryBucket}
                onChange={(e) => setInventoryBucket(normalizeBucketCode(e.target.value))}
                placeholder="e.g. BK1"
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                disabled={isAddingToInventory}
              />
            </div>

            <div className="mb-4">
              <label htmlFor="inventoryCondition" className="block text-sm font-medium text-gray-700 mb-1">
                Condition
              </label>
              <select
                id="inventoryCondition"
                name="inventoryCondition"
                value={inventoryCondition}
                onChange={(e) => setInventoryCondition(e.target.value)}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                disabled={isAddingToInventory}
              >
                <option value="New">New</option>
                <option value="Refurbished">Refurbished</option>
                <option value="Used">Used</option>
              </select>
            </div>

            <div className="mb-4 p-3 bg-blue-50 rounded-md">
              <p className="text-xs text-gray-600">
                <strong>Note:</strong> If this product already exists in inventory, the quantity will be added to the existing stock.
              </p>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                onClick={() => {
                  setShowAddToInventoryModal(false);
                  setInventoryQuantity(1);
                  setInventoryLocation(locationOptions[0] || '');
                  setInventoryBucket('');
                  setInventoryCondition('New');
                }}
                disabled={isAddingToInventory}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                onClick={handleAddToInventory}
                disabled={isAddingToInventory || !inventoryQuantity || inventoryQuantity < 1 || !inventoryLocation}
              >
                {isAddingToInventory ? 'Adding...' : 'Add to Inventory'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showFileImportModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50 p-4">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Import File</h2>
              <button onClick={() => setShowFileImportModal(false)} className="text-gray-500 hover:text-gray-700">
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <div className="mb-4">
              <label htmlFor="fileImportType" className="block text-sm font-medium text-gray-700 mb-1">
                Import Type
              </label>
              <select
                id="fileImportType"
                name="fileImportType"
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                value={fileImportType}
                onChange={(e) => handleImportTypeChange(e.target.value)}
              >
                <option value="products">Products</option>
                <option value="inventory">Inventory</option>
              </select>
            </div>
            <div className="mb-4">
              <label htmlFor="importFile" className="block text-sm font-medium text-gray-700 mb-1">
                Choose CSV File
              </label>
              <input
                type="file"
                id="importFile"
                name="importFile"
                className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept=".csv"
              />
            </div>
            {importLoading && (
              <div className="mb-4">
                <p className="text-sm text-gray-500">Processing file: {importProgress} / {importTotal}</p>
                <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mt-1">
                    <div className="bg-indigo-600 h-2.5 rounded-full" style={{ width: `${(importTotal > 0 ? (importProgress / importTotal) * 100 : 0)}%` }}></div>
                </div>
              </div>
            )}
            {importPreview.length > 0 && !importLoading && (
              <div className="mb-4">
                <h3 className="text-md font-semibold mb-2">Import Preview (First {importPreview.length} rows)</h3>
                <div className="overflow-x-auto text-xs border rounded-md">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        {Object.keys(importPreview[0] || {}).map(header => (
                          <th key={header} className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {importPreview.map((item, index) => (
                        <tr key={index}>
                          {Object.values(item).map((value, i) => (
                            <td key={i} className="px-3 py-2 whitespace-nowrap">{String(value).substring(0,30)}{String(value).length > 30 ? '...' : ''}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                onClick={() => {
                  setShowFileImportModal(false);
                  setImportFile(null);
                  if(fileInputRef.current) fileInputRef.current.value = '';
                  setImportPreview([]);
                }}
                disabled={importLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                onClick={processFileImport}
                disabled={!importFile || importLoading || importPreview.length === 0}
              >
                {importLoading ? 'Importing...' : 'Import Selected File'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Scanner; 