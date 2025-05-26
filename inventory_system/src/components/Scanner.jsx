import React, { useState, useEffect, useRef, useContext } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import BarcodeReader from './BarcodeReader';
import MarketplaceListing from './MarketplaceListing';
import ShopifyListing from './ShopifyListing';
import { getProductLookup, externalApiService } from '../services/api';
import { productLookupService as dbProductLookupService, apiCacheService } from '../services/databaseService';
import { inventoryService } from '../config/supabaseClient';
import { XMarkIcon, ArrowUpTrayIcon, ShoppingBagIcon, ExclamationTriangleIcon, CheckCircleIcon, CurrencyDollarIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { mockService } from '../services/mockData';
import { useAuth } from '../contexts/AuthContext';

/**
 * Scanner component for barcode scanning and product lookup
 */
const Scanner = () => {
  const { user } = useAuth();
  const userId = user?.id;
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

  // State for manual barcode input (from existing code)
  const [manualBarcode, setManualBarcode] = useState('');
  const [manualScanResult, setManualScanResult] = useState(null);
  const [manualScanError, setManualScanError] = useState(null);
  const [isManualScanning, setIsManualScanning] = useState(false);
  
  // State for BarcodeReader component
  const [isCameraActive, setIsCameraActive] = useState(false);
  
  // Add states for manual database check and processing status
  const [isCheckingDatabase, setIsCheckingDatabase] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState('');
  const [isApiProcessing, setIsApiProcessing] = useState(false);
  const [processingStartTime, setProcessingStartTime] = useState(null);

  // State for auto-refresh when API is processing
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  const [autoRefreshCountdown, setAutoRefreshCountdown] = useState(0);
  const [autoRefreshCode, setAutoRefreshCode] = useState(null);
  const autoRefreshIntervalRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

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

  async function lookupProductByCode(code) {
    console.log(`🔍 Looking up product by code: ${code}, UserID: ${userId || 'N/A'}`);
    setLoading(true);
    setProductInfo(null); // Clear previous product info
    setIsApiProcessing(false); // Reset processing state
    setLastScannedCode(code); // Track the last scanned code

    if (isAutoRefreshing) {
      console.log('⏹️ Stopping auto-refresh due to new manual scan');
      stopAutoRefresh();
    }

    try {
      let rawProductFromDb = null; 
      let sourceSystem = ''; 

      // Try by FNSKU or ASIN via dbProductLookupService.getProductByFnsku
      // This service already tries FNSKU then ASIN against manifest_data
      const fnskuAsinProductMapped = await dbProductLookupService.getProductByFnsku(code);

      if (fnskuAsinProductMapped && fnskuAsinProductMapped.rawSupabase) {
        rawProductFromDb = fnskuAsinProductMapped.rawSupabase;
        sourceSystem = 'manifest_data (via FNSKU/ASIN lookup)';
        console.log(`✅ Raw data found from manifest_data via FNSKU/ASIN lookup:`, rawProductFromDb);
      } else if (fnskuAsinProductMapped) {
        // Fallback if rawSupabase wasn't populated by getProductByFnsku for some reason, but a truthy object was returned
        // This might happen if getProductByFnsku's mapping changes or if it directly returns raw data in some paths.
        console.warn(`[Scanner.jsx] Product found by getProductByFnsku but rawSupabase field is missing. Attempting to use returned object as raw.`, fnskuAsinProductMapped);
        rawProductFromDb = fnskuAsinProductMapped; // Treat the returned object itself as potentially raw.
        sourceSystem = 'manifest_data (via FNSKU/ASIN lookup - direct object)';
      }

      // If not found by FNSKU/ASIN, try by LPN
      if (!rawProductFromDb) {
        console.log(`[Scanner.jsx] Not found by FNSKU/ASIN in manifest_data. Trying LPN for code: ${code}...`);
        const lpnProductMapped = await dbProductLookupService.getProductByLpn(code);
        if (lpnProductMapped && lpnProductMapped.rawSupabase) {
          rawProductFromDb = lpnProductMapped.rawSupabase;
          sourceSystem = 'manifest_data (via LPN lookup)';
          console.log(`✅ Raw data found from manifest_data via LPN lookup:`, rawProductFromDb);
        } else if (lpnProductMapped) {
          // Fallback for LPN lookup
          console.warn(`[Scanner.jsx] Product found by getProductByLpn but rawSupabase field is missing. Attempting to use returned object as raw.`, lpnProductMapped);
          rawProductFromDb = lpnProductMapped;
          sourceSystem = 'manifest_data (via LPN lookup - direct object)';
        }
      }

      if (rawProductFromDb) {
        console.log(`[Scanner.jsx] Proceeding to map raw data from ${sourceSystem}:`, rawProductFromDb);
        const displayProduct = mapSupabaseProductToDisplay(rawProductFromDb);
        
        if (displayProduct) {
            setProductInfo(displayProduct);
            // Use a more generic success message as source is already logged
            toast.success("✅ Found in local database!", { icon: "💚" });
        } else {
            console.error("[Scanner.jsx] Failed to map raw product data from manifest_data:", rawProductFromDb);
            toast.error("❌ Error processing data from local database.");
            setProductInfo(null); // Ensure product info is cleared on mapping failure
        }
      } else {
        // Not found locally - try external API
        console.log(`[Scanner.jsx] Product not found in local DB (manifest_data) by FNSKU, ASIN, or LPN for code: ${code}. Trying external API...`);
        toast.info("💰 Checking external API (this will be charged)...", {
          autoClose: 2000
        });
        
        const apiResult = await getProductLookup(code, userId); // getProductLookup handles its own caching logic
        
        if (apiResult) {
          // This part assumes getProductLookup returns an object that is ready for setProductInfo
          // or indicates processing.
          if (apiResult.source === 'api_lookup_cache') {
             toast.success("✅ Found in API cache - No API charge!", { icon: "💚" });
             setProductInfo(apiResult); // apiResult from cache should already be mapped by apiCacheService.mapCacheToDisplay
          } else if (apiResult.source === 'external_api') {
            toast.success("⚡ Found via external API and saved for future use!", { icon: "💛" });
            setProductInfo(apiResult); // apiResult from external_api should be mapped by getProductLookup
          } else if (apiResult.source === 'asin_direct') {
            toast.info("ℹ️ ASIN processed directly.", { icon: "🔵" });
            setProductInfo(apiResult);
          } else if (apiResult.processing_status === 'timeout' || apiResult.processing_status === 'quick_timeout') {
            setIsApiProcessing(true);
            setProcessingStartTime(new Date());
            const message = apiResult.processing_status === 'quick_timeout' ?
              "⚡ Quick scan complete - no ASIN yet. Click 'Check for Updates' in 2-3 minutes." :
              "⏳ API is still processing this FNSKU. Click 'Check for Updates' in a few minutes.";
            toast.warn(message, { autoClose: 6000 });
            // Set some minimal info if available from apiResult for processing state
            setProductInfo({ name: `Processing ${code}...`, sku: code, source: 'api_processing', ...apiResult});

          } else if (apiResult.source === 'local_database') { // Should ideally be caught by earlier manifest_data check
            toast.success("✅ Found in local database (via API path)!", { icon: "💚" });
            setProductInfo(apiResult);
          } else if (apiResult.source === 'mock_data') {
             toast.info("📝 Using mock data for testing", { icon: "🔵" });
             setProductInfo(apiResult);
          } else {
            // Not found or error from API
            console.log("[Scanner.jsx] Product not found via external API or error occurred:", apiResult);
            toast.error(apiResult.error_message || "❌ Product not found via external API.", { icon: "❌" });
            setProductInfo(null);
          }
        } else {
          toast.error("❌ Product not found in database or via external API.", { icon: "❌" });
          setProductInfo(null);
        }
      }
    } catch (error) {
      console.error("Error looking up product by code in Scanner.jsx:", error);
      if (error.message?.includes('External API')) {
        toast.error("❌ External API lookup failed. Please try again.");
      } else {
        toast.error("❌ Error looking up product by code");
      }
      setProductInfo(null);
    } finally {
      setLoading(false);
    }
  }

  function handleCodeDetected(detectedData) {
    const code = detectedData.code;
    if (!code) {
      console.warn("handleCodeDetected called with no code:", detectedData);
      return;
    }
    
    // Clean the code by removing whitespace and tab characters
    const cleanedCode = code.trim().replace(/\s+/g, '');
    console.log("Detected code via Camera:", cleanedCode);
    setIsCameraActive(false);
    
    setScannedCodes(prev => {
      const newHistory = [
        { code: cleanedCode, timestamp: new Date().toISOString(), type: 'camera' },
        ...prev.filter(item => item.code !== cleanedCode)
      ].slice(0, 10);
      return newHistory;
    });
    
    lookupProductByCode(cleanedCode);
  }

  const handleManualScan = async (barcodeToScan) => {
    if (!barcodeToScan.trim()) {
      toast.error("Please enter a barcode to scan.");
      return;
    }
    
    // Clean the input by removing extra whitespace and tab characters
    const cleanedBarcode = barcodeToScan.trim().replace(/\s+/g, '');
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
    if (productInfo && productInfo.asin) {
      const amazonUrl = `https://www.amazon.com/dp/${productInfo.asin}`;
      window.open(amazonUrl, '_blank');
      toast.success(`🔗 Opening Amazon page for ASIN: ${productInfo.asin}`);
    } else {
      toast.error("No ASIN available to view on Amazon");
    }
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

  // Handle search input change with debounce
  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    
    // Clear previous timer
    if (searchDebounceTimer.current) {
      clearTimeout(searchDebounceTimer.current);
    }
    
    // Set new timer to search after 500ms of inactivity
    searchDebounceTimer.current = setTimeout(() => {
      if (query.trim().length >= 2) {
        performSearch(query);
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
      const results = await dbProductLookupService.searchProducts(query, {
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
    setProductInfo(product);
    setShowSearchResults(false);
    setSearchQuery('');
    // Add to scanned codes history
    setScannedCodes(prev => [
      { code: product.sku || product.asin || product.fnsku, timestamp: new Date().toISOString() },
      ...prev.slice(0, 9)
    ]);
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
                  await dbProductLookupService.saveProductLookup({
                    ...existingProduct,
                    ...normalizedItem,
                    updated_at: new Date().toISOString()
                  });
                  duplicateCount++;
                } else {
                  // Save as new product
                  await dbProductLookupService.saveProductLookup(normalizedItem);
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
                    const newProduct = await dbProductLookupService.saveProductLookup({
                      name: normalizedItem.name,
                      sku: normalizedItem.sku,
                      price: normalizedItem.price,
                      category: 'Imported',
                      condition: normalizedItem.condition,
                      source: 'Imported File'
                    });
                    productId = newProduct.id;
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
        const result = await getProductLookup(code, userId);
        
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
    setCountdown(0); 
    console.log('⏹️ Auto-refresh stopped.');
  };

  // Add manual check function
  const handleCheckForUpdates = async () => {
    if (!lastScannedCode) {
      toast.error("No recent scan to check for updates");
      return;
    }
    
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

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <ToastContainer />

      {/* Top Search Bar and Import Button */}
      <div className="mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex-grow w-full md:w-auto">
          <label htmlFor="productSearchTop" className="sr-only">Search by LPN, FNSKU, or ASIN</label>
          <input
            type="text"
            name="productSearchTop"
            id="productSearchTop"
            className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-3"
            placeholder="Search by LPN, FNSKU, or ASIN"
            value={searchQuery}
            onChange={handleSearchChange} // Make sure handleSearchChange updates searchQuery state
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
          <label htmlFor="exactMatch" className="text-sm text-gray-700">Exact Match</label>
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
                <ul className="absolute w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto z-20">
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
                     <div className="absolute w-full bg-white border border-gray-300 rounded-md shadow-lg p-3 text-sm text-gray-500 z-20">
                        No products found for "{searchQuery}".
                    </div>
                )
            )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Barcode Scanner */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">Barcode Scanner</h2>
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
            <div className="mb-4 p-4 border rounded-md bg-gray-50">
              <BarcodeReader onCodeDetected={handleCodeDetected} />
              <button
                onClick={() => setIsCameraActive(false)}
                className="mt-3 w-full inline-flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                Close Camera
              </button>
            </div>
          )}

          <div>
            <label htmlFor="manualBarcodeEntry" className="block text-sm font-medium text-gray-700 mb-1">
              Manual Barcode Entry
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                name="manualBarcodeEntry"
                id="manualBarcodeEntry"
                className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-3"
                placeholder="Enter barcode manually"
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
                onKeyPress={(e) => { if (e.key === 'Enter') handleManualScan(manualBarcode); }}
              />
              <button
                type="button"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-500 hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 whitespace-nowrap p-3" // Ensure padding makes it look like screenshot
                onClick={() => handleManualScan(manualBarcode)}
                disabled={loading || isManualScanning}
              >
                Lookup
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Product Information */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Product Information</h2>
            <div>
              <button 
                type="button" 
                className="mr-2 inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
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
              <p className="text-gray-500 animate-pulse">Loading product information...</p>
            </div>
          )}

          {!loading && !productInfo && (
            <div className="text-center py-10 border-2 border-dashed border-gray-300 rounded-md">
              <p className="text-gray-500">Scan a barcode, use manual lookup, or search for a product to view details.</p>
            </div>
          )}

          {productInfo && !loading && (
            <div>
              {/* Auto-refreshing and API processing messages */}
              {isAutoRefreshing && (
                <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-md flex items-center justify-between">
                    <div className="flex items-center">
                        <CheckCircleIcon className="h-5 w-5 text-blue-500 mr-2 animate-spin" /> {/* Using CheckCircleIcon for consistency, or a spinner icon */}
                        <p className="text-sm text-blue-700">Auto-Refreshing: {autoRefreshCode}. Next check in: {autoRefreshCountdown}s</p>
                    </div>
                  <button 
                    onClick={stopAutoRefresh} 
                    className="ml-2 px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    Stop Auto-Refresh
                  </button>
                </div>
              )}
              {isApiProcessing && !isAutoRefreshing && (
                <div className="mb-3 p-3 bg-yellow-50 border border-yellow-300 rounded-md">
                    <p className="text-sm text-yellow-700">API is processing FNSKU: {lastScannedCode}. Use 'Check for Updates' or wait.</p>
                     <button
                        onClick={handleCheckForUpdates}
                        disabled={isCheckingDatabase}
                        className="mt-1 inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-yellow-500 hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-400"
                    >
                        {isCheckingDatabase ? 'Checking...' : 'Check for Updates'}
                    </button>
                </div>
              )}
               {(productInfo.source === 'fnskutoasin.com' || productInfo.cost_status === 'charged') && (
                <div className="mb-3 p-3 bg-yellow-100 border border-yellow-400 rounded-md text-sm text-yellow-800 flex items-center">
                  <CurrencyDollarIcon className="h-5 w-5 text-yellow-600 mr-2" />
                  Retrieved from fnskutoasin.com API - Charged lookup
                </div>
              )}
              <div className="mb-2 p-2 bg-gray-50 border border-gray-200 rounded-md">
                  <span className="text-xs font-medium text-gray-600">Code Type: {productInfo.code_type || 'N/A'} ({productInfo.code_type === 'FNSKU' ? 'Fulfillment Network Stock Keeping Unit' : productInfo.code_type})</span>
              </div>

              <h3 className="text-lg font-bold text-gray-900 mb-1">{productInfo.name || 'N/A'}</h3>
              <p className="text-sm text-gray-600 mb-1">FNSKU: {productInfo.fnsku || 'N/A'} {productInfo.asin_found === false && productInfo.source ==='fnskutoasin.com' ? '(No ASIN found)' : ''}</p>
              
              <div className="text-sm space-y-0.5 text-gray-700 mb-3">
                <p>LPN (X-Z ASIN): {productInfo.lpn || 'N/A'}</p>
                <p>FNSKU: {productInfo.fnsku || 'N/A'}</p> {/* Repeated from above for specific layout, can be removed if redundant */}
                <p>ASIN (B00): {productInfo.asin || 'N/A'}</p>
                <p>UPC: {productInfo.upc || 'N/A'}</p>
                <p>Category: {productInfo.category || 'N/A'}</p>
                <p>Quantity: {productInfo.quantity || 'N/A'}</p>
                <p>MSRP: <span className="font-semibold text-green-600">${productInfo.price != null ? parseFloat(productInfo.price).toFixed(2) : '0.00'}</span></p>
              </div>

              <button
                type="button"
                className="w-full mt-3 inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
                onClick={handleViewOnAmazon}
                disabled={loading || !productInfo.asin}
              >
                <ArrowTopRightOnSquareIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
                View on Amazon
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Section: Recent Scans */}
      <div className="mt-6 bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4 text-gray-800">Recent Scans</h2>
        {scannedCodes.length > 0 ? (
          <ul className="divide-y divide-gray-200 max-h-60 overflow-y-auto">
            {scannedCodes.map((item, index) => (
              <li key={index} className="py-3 flex justify-between items-center text-sm">
                <span className="font-mono text-gray-700">{item.code}</span>
                <span className="capitalize text-gray-600">{item.type}</span>
                <span className="text-gray-500">{new Date(item.timestamp).toLocaleString()}</span>
              </li>
            ))}
          </ul>
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