import React, { useState, useEffect, useRef, useContext } from 'react';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import axios from 'axios';
import BarcodeReader from './BarcodeReader';
import MarketplaceListing from './MarketplaceListing';
import ShopifyListing from './ShopifyListing';
// Removed: import { getProductLookup, externalApiService } from '../services/api';
// All API calls now go through backend /api/scan endpoint
import { productLookupService as dbProductLookupService, apiCacheService } from '../services/databaseService';
import { inventoryService } from '../config/supabaseClient';
import { XMarkIcon, ArrowUpTrayIcon, ShoppingBagIcon, ExclamationTriangleIcon, CheckCircleIcon, CurrencyDollarIcon, ArrowTopRightOnSquareIcon, PrinterIcon, QrCodeIcon } from '@heroicons/react/24/outline';
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
  
  // State for Add to Inventory modal
  const [showAddToInventoryModal, setShowAddToInventoryModal] = useState(false);
  const [inventoryQuantity, setInventoryQuantity] = useState(1);
  const [inventoryLocation, setInventoryLocation] = useState('');
  const [isAddingToInventory, setIsAddingToInventory] = useState(false);
  
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

  // Load scanned codes from localStorage on mount
  useEffect(() => {
    const savedScans = localStorage.getItem('scannedCodes');
    if (savedScans) {
      try {
        const parsed = JSON.parse(savedScans);
        setScannedCodes(parsed);
      } catch (error) {
        console.error('Error loading saved scans:', error);
      }
    }
  }, []);

  // Save scanned codes to localStorage whenever they change
  useEffect(() => {
    if (scannedCodes.length > 0) {
      localStorage.setItem('scannedCodes', JSON.stringify(scannedCodes));
    } else {
      localStorage.removeItem('scannedCodes');
    }
  }, [scannedCodes]);

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

  async function lookupProductByCode(code) {
    console.log(`🔍 Looking up product by code: ${code}, UserID: ${userId || 'N/A'}`);
    setLoading(true);
    setProductInfo(null); // Clear previous product info
    setIsApiProcessing(false); // Reset processing state
    setLastScannedCode(code); // Track the last scanned code

    // Stop any ongoing auto-refresh when starting a new lookup
    if (isAutoRefreshing) {
      console.log('⏹️ Stopping auto-refresh due to new manual scan');
      stopAutoRefresh();
    }

    try {
      // First try the local database (Supabase)
      let productFromDb = await dbProductLookupService.getProductByFnsku(code);

      if (!productFromDb) {
        console.log(`Product not found by FNSKU (${code}) in DB/Cache, trying as LPN in DB...`);
        // getProductByLpn only checks manifest_data, so its result always needs mapping if found.
        const lpnData = await dbProductLookupService.getProductByLpn(code);
        if (lpnData) {
          productFromDb = mapSupabaseProductToDisplay(lpnData); // mapSupabaseProductToDisplay sets source to 'local_database'
        }
      }

      if (productFromDb) {
        let displayProduct;
        // If productFromDb came from getProductByFnsku, it might already be mapped from api_cache or be raw from manifest_data
        if (productFromDb.source === 'api_cache' || productFromDb.source === 'fnsku_cache') {
          console.log('✅ Using directly from API Cache source:', productFromDb);
          displayProduct = productFromDb; // Already mapped by apiCacheService.mapCacheToDisplay
          toast.success("✅ Found in API cache - No API charge!", {
            icon: "💚"
          });
        } else if (productFromDb.rawSupabase) { // It came from manifest_data via getProductByFnsku's LPN or FNSKU check, but was mapped by mapSupabaseProductToDisplay
          console.log('✅ Mapped from local_database (manifest_data via LPN/FNSKU specific mapping pathway):', productFromDb);
          displayProduct = productFromDb; // Already mapped by mapSupabaseProductToDisplay
          toast.success("✅ Found in local database - No API charge!", {
            icon: "💚"
          });
        } else {
          // This case implies productFromDb is raw from manifest_data (e.g., direct return from getProductByFnsku before mapping)
          console.log('📦 Mapping raw data from manifest_data:', productFromDb);
          displayProduct = mapSupabaseProductToDisplay(productFromDb);
          // mapSupabaseProductToDisplay sets source to 'local_database' and cost_status to 'no_charge'
          toast.success("✅ Found in local database - No API charge!", {
            icon: "💚"
          });
        }
        
        // Even if found in local DB, check cache FIRST before calling Rainforest API
        if (displayProduct && displayProduct.asin && displayProduct.asin.trim() !== '') {
          // STEP 1: Check api_lookup_cache FIRST before calling Rainforest API
          let imageFoundInCache = false;
          
          try {
            const cacheKey = displayProduct.fnsku || displayProduct.sku || displayProduct.asin;
            console.log('🔍 [LOCAL DB] Checking api_lookup_cache for image, key:', cacheKey);
            
            const cachedData = await apiCacheService.getCachedLookup(cacheKey);
            
            if (cachedData && cachedData.image_url) {
              console.log('✅ [LOCAL DB] Found image in cache - using cached image (NO Rainforest API charge!)');
              displayProduct.image_url = cachedData.image_url;
              
              // Also use other cached data
              if (cachedData.product_name && cachedData.product_name !== `Product ${cacheKey}`) {
                displayProduct.name = cachedData.product_name;
              }
              if (cachedData.price) {
                displayProduct.price = cachedData.price;
              }
              
              imageFoundInCache = true;
              toast.success("✅ Using cached image - no API charge!", { autoClose: 2000 });
              setProductInfo(displayProduct);
              return; // Exit early - no need to call Rainforest
            } else {
              console.log('❌ [LOCAL DB] No image in cache for key:', cacheKey);
            }
          } catch (cacheCheckError) {
            console.warn('⚠️ [LOCAL DB] Error checking cache:', cacheCheckError);
            // Continue to Rainforest API if cache check fails
          }
          
          // STEP 2: Only call Rainforest API if image NOT in cache
          if (!imageFoundInCache && !displayProduct.image_url) {
            console.log('📦 [LOCAL DB] Image not in cache - fetching from Rainforest API (will be charged)');
            toast.info("📦 Fetching product image from Rainforest API...", { autoClose: 2000 });
            
            try {
              const rainforestData = await fetchProductDataFromRainforest(displayProduct.asin);
              
              if (rainforestData) {
                const enhancedProduct = {
                  ...displayProduct,
                  name: rainforestData.title || displayProduct.name || 'Product',
                  image_url: rainforestData.image || displayProduct.image_url || '',
                  price: rainforestData.price || displayProduct.price,
                  rating: rainforestData.rating || displayProduct.rating || null,
                  reviews_count: rainforestData.reviews_count || displayProduct.reviews_count || null,
                  brand: rainforestData.brand || displayProduct.brand || '',
                  category: rainforestData.category || displayProduct.category || '',
                  description: rainforestData.description || displayProduct.description || ''
                };
                
                console.log('✅ Enhanced product data from Rainforest API:', enhancedProduct);
                
                // Save Rainforest data to cache for future use
                try {
                  const fnskuToSave = enhancedProduct.fnsku || enhancedProduct.sku || enhancedProduct.asin;
                  
                  if (!fnskuToSave || !enhancedProduct.asin) {
                    console.error('❌ Cannot save to cache: Missing fnsku or asin', {
                      fnsku: enhancedProduct.fnsku,
                      sku: enhancedProduct.sku,
                      asin: enhancedProduct.asin
                    });
                  } else {
                    const cacheData = {
                      fnsku: fnskuToSave,
                      asin: enhancedProduct.asin,
                      name: enhancedProduct.name,
                      description: enhancedProduct.description,
                      price: enhancedProduct.price,
                      category: enhancedProduct.category,
                      image_url: enhancedProduct.image_url,
                      source: 'rainforest_api'
                    };
                    
                    console.log('💾 Saving Rainforest data to api_lookup_cache:', cacheData);
                    const savedToCache = await apiCacheService.saveLookup(cacheData);
                    
                    // Update manifest_data in background (non-blocking)
                    if (savedToCache && enhancedProduct.image_url) {
                      (async () => {
                        try {
                          const { supabase } = await import('../config/supabaseClient');
                          const { data: manifestProduct } = await supabase
                            .from('manifest_data')
                            .select('id')
                            .eq('Fn Sku', fnskuToSave)
                            .maybeSingle();
                          
                          if (manifestProduct) {
                            await supabase
                              .from('manifest_data')
                              .update({ image_url: enhancedProduct.image_url })
                              .eq('id', manifestProduct.id);
                          }
                        } catch (err) {
                          // Silent fail - not critical
                        }
                      })();
                    }
                    
                    if (savedToCache) {
                      console.log('✅ Saved Rainforest API data to cache - future lookups will be free!', savedToCache);
                      toast.success("💾 Product data saved - future scans will be FREE! 🎉", { autoClose: 3000 });
                    } else {
                      console.error('❌ Failed to save to cache - saveLookup returned null');
                      toast.warn("⚠️ Could not save image to cache. Next scan may charge again.", { autoClose: 4000 });
                    }
                  }
                } catch (cacheError) {
                  console.error('❌ Error saving Rainforest data:', cacheError);
                  console.error('Error details:', {
                    message: cacheError.message,
                    code: cacheError.code,
                    details: cacheError.details,
                    hint: cacheError.hint
                  });
                  toast.error("❌ Failed to save to cache. Check console for details.", { autoClose: 5000 });
                }
                
                setProductInfo(enhancedProduct);
              } else {
                setProductInfo(displayProduct);
              }
            } catch (error) {
              console.error("Error fetching Rainforest API data:", error);
              setProductInfo(displayProduct);
            }
          } else {
            // Already has complete data, no need for Rainforest
            setProductInfo(displayProduct);
          }
        } else {
          // No ASIN, can't enhance
          setProductInfo(displayProduct);
        }
        
        // Removed scan history logging to avoid database issues  
        // if (displayProduct) {
        //   console.log("[Scanner.jsx] Attempting to log scan event (from DB/Cache). Code:", code, "Product Details:", displayProduct);
        //   const logResult = await dbProductLookupService.logScanEvent(code, displayProduct);
        //   console.log("[Scanner.jsx] Scan event log result (from DB/Cache):", logResult);
        // }
      } else {
        // Not found locally - call unified backend scan endpoint
        console.log(`Product not found in local DB/Cache by FNSKU or LPN (${code}), calling backend /api/scan...`);
        toast.info("🔍 Scanning product...", {
          autoClose: 2000
        });
        
        try {
          // Get backend URL from environment
          let backendUrl = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || 'http://localhost:5000';
          
          // Remove trailing /api if present (VITE_API_URL might include it)
          if (backendUrl.endsWith('/api')) {
            backendUrl = backendUrl.replace('/api', '');
          }
          
          const scanUrl = `${backendUrl}/api/scan`;
          
          console.log("🚀 Calling unified scan endpoint:", scanUrl);
          const response = await axios.post(scanUrl, {
            code: code,
            user_id: userId
          }, {
            timeout: 60000 // 60 seconds timeout (15 polls * 2s + Rainforest API + buffer)
          });
          
          const apiResult = response.data;
          console.log("🚀 Backend scan response:", apiResult);
          
          if (apiResult && apiResult.success) {
            // Map backend response to frontend product format
            const displayableProduct = {
              fnsku: apiResult.fnsku || code,
              asin: apiResult.asin || '',
              name: apiResult.title || '',
              image_url: apiResult.image || '',
              price: apiResult.price || '',
              brand: apiResult.brand || '',
              category: apiResult.category || '',
              description: apiResult.description || '',
              upc: apiResult.upc || '',
              amazon_url: apiResult.amazon_url || '',
              source: apiResult.source || 'api',
              cost_status: apiResult.cost_status || (apiResult.cached ? 'no_charge' : 'charged')
            };
            
            // Show appropriate toast based on source
            if (apiResult.cached) {
              toast.success("✅ Found in cache - No API charge!", { icon: "💚" });
            } else if (apiResult.source === 'api') {
              toast.success("✅ Product scanned successfully!", { icon: "💚" });
            }
            
            // Set product info - backend already handled everything!
            setProductInfo(displayableProduct);
          } else {
            // Handle error response
            const errorMsg = apiResult?.message || apiResult?.error || "Failed to scan product";
            toast.error(`❌ ${errorMsg}`, { autoClose: 5000 });
            console.error("Backend scan error:", apiResult);
          }
        } catch (error) {
          console.error("Error calling backend scan endpoint:", error);
          if (error.response) {
            const errorMsg = error.response.data?.message || error.response.data?.error || "Backend error";
            toast.error(`❌ ${errorMsg}`, { autoClose: 5000 });
          } else if (error.code === 'ECONNABORTED') {
            toast.error("❌ Request timeout - the scan is taking longer than expected", { autoClose: 5000 });
          } else {
            toast.error("❌ Failed to connect to backend. Please ensure the backend server is running.", { autoClose: 5000 });
          }
        } finally {
          setLoading(false);
        }
      }
    } catch (error) {
      console.error("Error looking up product by code:", error);
      
      // Check for specific error types
      if (error.message?.includes('Backend server is not running')) {
        toast.error("❌ Backend server is not running. Please start the Flask backend server.", {
          autoClose: 8000,
          icon: "⚠️"
        });
      } else if (error.message?.includes('Monthly Limit Reached') || error.message?.includes('limit')) {
        toast.error("❌ API Monthly Limit Reached. Please upgrade your plan or use the backend server to avoid limits.", {
          autoClose: 10000,
          icon: "⚠️"
        });
      } else if (error.message?.includes('External API') || error.message?.includes('Backend API') || error.message?.includes('FNSKU API')) {
        toast.error(`❌ ${error.message}`, { autoClose: 6000 });
      } else {
        toast.error("❌ Error looking up product by code: " + (error.message || 'Unknown error'));
      }
    } finally {
      setLoading(false);
    }
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
        return {
          title: product.title || '',
          image: product.main_image?.link || product.images?.[0]?.link || '',
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
    if (!productInfo || !productInfo.asin) {
      toast.error("No ASIN available to print label");
      return;
    }

    const amazonUrl = `https://www.amazon.com/dp/${productInfo.asin}`;
    
    // Use QR code API service for reliable printing (smaller size for top right corner)
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(amazonUrl)}`;
    
    // Product data should already be enhanced from Rainforest API when scanned
    // But if image is missing, try to fetch it one more time
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

  // Helper function to create label HTML
  const createLabelHTML = (productInfo, amazonUrl, qrCodeHtml) => {
    // Calculate prices automatically
    const retailPrice = productInfo.price != null ? parseFloat(productInfo.price) : 0;
    const ourPrice = retailPrice / 2; // 50% off retail
    
    // Show full product name (no truncation)
    const productName = productInfo.name || 'Product';
    
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Product Label - ${productInfo.asin}</title>
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
              /* Enhanced dithering for thermal printers */
              img.product-image {
                image-rendering: -webkit-optimize-contrast !important;
                image-rendering: crisp-edges !important;
                image-rendering: pixelated !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                filter: contrast(1.2) brightness(0.9) !important;
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
            }
            .product-image {
              max-width: 100%;
              max-height: 2.8in;
              width: auto;
              height: auto;
              object-fit: contain;
              border: 3px solid #000;
              background: white;
              box-shadow: 0 0 0 2px #000;
              padding: 0.02in;
              /* Dithering mode for thermal printer clarity */
              image-rendering: -webkit-optimize-contrast;
              image-rendering: crisp-edges;
              image-rendering: pixelated;
              /* Enhanced contrast and dithering effect for thermal printers */
              filter: contrast(1.2) brightness(0.9) grayscale(0%);
              /* Force high-quality rendering */
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
              /* Dithering effect via CSS */
              image-rendering: auto;
              image-rendering: -moz-crisp-edges;
              image-rendering: crisp-edges;
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
            ASIN: ${productInfo.asin}
          </div>

          ${productInfo.image_url ? `
            <div class="product-image-section">
              <img src="${productInfo.image_url}" alt="Product Image" class="product-image" 
                   onerror="this.style.display='none';"
                   style="image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges; image-rendering: pixelated; filter: contrast(1.2) brightness(0.9);" />
            </div>
          ` : ''}

          ${retailPrice > 0 ? `
            <div class="price-section">
              <div class="retail-price">
                <span class="retail-price-label">RETAIL:</span> $${retailPrice.toFixed(2)}
              </div>
              <div class="our-price-label">OUR PRICE:</div>
              <div class="our-price">
                $${ourPrice.toFixed(2)}
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
    setLastScannedCode(product.sku || product.asin || product.fnsku);
    setShowSearchResults(false);
    setSearchQuery('');
    // Add to scanned codes history with product info
    const code = product.sku || product.asin || product.fnsku;
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
        let backendUrl = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || 'http://localhost:5000';
        if (backendUrl.endsWith('/api')) {
          backendUrl = backendUrl.replace('/api', '');
        }
        const response = await axios.post(`${backendUrl}/api/scan`, {
          code: code,
          user_id: userId
        }, { timeout: 120000 });
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

  // Handle deleting individual scan
  const handleDeleteScan = (index) => {
    setScannedCodes(prev => {
      const updated = prev.filter((_, i) => i !== index);
      // Update localStorage
      if (updated.length > 0) {
        localStorage.setItem('scannedCodes', JSON.stringify(updated));
      } else {
        localStorage.removeItem('scannedCodes');
      }
      return updated;
    });
    toast.success('Scan removed');
  };

  // Handle clearing all scans
  const handleClearAllScans = () => {
    if (window.confirm('Are you sure you want to clear all recent scans?')) {
      setScannedCodes([]);
      localStorage.removeItem('scannedCodes');
      toast.success('All scans cleared');
    }
  };

  // Handle viewing Amazon from recent scan
  const handleViewOnAmazonFromScan = (scanItem) => {
    if (scanItem.productInfo && scanItem.productInfo.asin) {
      const amazonUrl = `https://www.amazon.com/dp/${scanItem.productInfo.asin}`;
      window.open(amazonUrl, '_blank');
      toast.success(`🔗 Opening Amazon page for ASIN: ${scanItem.productInfo.asin}`);
    } else {
      toast.error("No ASIN available for this scan");
    }
  };

  // Handle printing label from recent scan
  const handlePrintLabelFromScan = async (scanItem) => {
    if (!scanItem.productInfo || !scanItem.productInfo.asin) {
      toast.error("No ASIN available to print label");
      return;
    }

    const amazonUrl = `https://www.amazon.com/dp/${scanItem.productInfo.asin}`;
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(amazonUrl)}`;
    
    let labelProductData = { ...scanItem.productInfo };
    
    // If image is missing, try to fetch it
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
    setInventoryLocation('');
    setShowAddToInventoryModal(true);
  };

  // Handle adding product to inventory
  const handleAddToInventory = async () => {
    if (!productInfo) {
      toast.error("No product information available");
      return;
    }

    if (!inventoryQuantity || inventoryQuantity < 1) {
      toast.error("Please enter a valid quantity (at least 1)");
      return;
    }

    setIsAddingToInventory(true);
    try {
      // First, check if product exists in product lookup database
      let productId = null;
      const existingProduct = await dbProductLookupService.getProductByFnsku(productInfo.fnsku || productInfo.sku);
      
      if (existingProduct) {
        productId = existingProduct.id;
      } else {
        // Try to create a new product lookup entry (optional - may fail due to RLS)
        // If it fails, we'll still add to inventory without product_id
        try {
          const productData = {
            name: productInfo.name || 'Unknown Product',
            sku: productInfo.fnsku || productInfo.sku || productInfo.asin,
            fnsku: productInfo.fnsku,
            asin: productInfo.asin,
            lpn: productInfo.lpn,
            upc: productInfo.upc,
            price: productInfo.price,
            category: productInfo.category || 'Uncategorized',
            description: productInfo.description || productInfo.name,
            condition: 'New',
            source: 'Scanner',
            created_at: new Date().toISOString()
          };
          
          const savedProduct = await dbProductLookupService.saveProductToManifest(productData, { conflictKey: 'fnsku' });
          productId = savedProduct?.id;
        } catch (manifestError) {
          // If saving to manifest_data fails (e.g., RLS policy), continue without product_id
          console.warn('Could not save to manifest_data (may be RLS restricted):', manifestError);
          // Continue without productId - inventory item will still be saved
        }
      }

      // Check if inventory item already exists
      const existingInventory = await inventoryService.getInventoryBySku(productInfo.fnsku || productInfo.sku || productInfo.asin);
      
      // Only include fields that exist in the inventory table
      const inventoryItem = {
        sku: productInfo.fnsku || productInfo.sku || productInfo.asin,
        name: productInfo.name || 'Unknown Product',
        quantity: parseInt(inventoryQuantity, 10), // The addOrUpdateInventory function will handle adding to existing quantity
        location: inventoryLocation || 'Default',
        condition: 'New',
        price: productInfo.price || 0,
        cost: productInfo.price ? (productInfo.price / 2) : 0 // Our price (50% of retail)
      };
      
      // Only add product_id if it exists (may be null if manifest_data save failed)
      if (productId) {
        inventoryItem.product_id = productId;
      }

      const result = await inventoryService.addOrUpdateInventory(inventoryItem);
      
      if (result) {
        toast.success(`✅ Added ${inventoryQuantity} ${inventoryQuantity === 1 ? 'item' : 'items'} to inventory${existingInventory ? ' (quantity updated)' : ''}!`);
        setShowAddToInventoryModal(false);
        setInventoryQuantity(1);
        setInventoryLocation('');
      } else {
        toast.error("Failed to add to inventory. Please try again.");
      }
    } catch (error) {
      console.error("Error adding to inventory:", error);
      toast.error(`Failed to add to inventory: ${error.message || 'Unknown error'}`);
    } finally {
      setIsAddingToInventory(false);
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-8">

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
            <div className="mb-4">
              <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-4 md:p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <QrCodeIcon className="h-6 w-6 text-green-400" />
                    Barcode Scanner
                  </h3>
                  <button
                    onClick={() => setIsCameraActive(false)}
                    className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    title="Close Scanner"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <BarcodeReader 
                  onCodeDetected={handleCodeDetected}
                  active={isCameraActive}
                  showViewFinder={true}
                  className="w-full"
                />
              </div>
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

              {/* Product Image */}
              {productInfo.image_url && (
                <div className="mb-4 flex justify-center">
                  <img 
                    src={productInfo.image_url} 
                    alt={productInfo.name || 'Product'} 
                    className="max-w-full h-48 w-auto object-contain border border-gray-200 rounded-lg bg-white shadow-sm"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                </div>
              )}

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

              <div className="mt-3 flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
                    onClick={handleViewOnAmazon}
                    disabled={loading || !productInfo.asin}
                  >
                    <ArrowTopRightOnSquareIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
                    View on Amazon
                  </button>
                  <button
                    type="button"
                    className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    onClick={handlePrintLabel}
                    disabled={loading || !productInfo.asin}
                  >
                    <PrinterIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
                    Print Label
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
      <div className="mt-6 bg-white p-6 rounded-lg shadow-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Recent Scans</h2>
          {scannedCodes.length > 0 && (
            <button
              onClick={handleClearAllScans}
              className="text-sm text-red-600 hover:text-red-800 font-medium"
            >
              Clear All
            </button>
          )}
        </div>
        {scannedCodes.length > 0 ? (
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {scannedCodes.map((item, index) => (
              <div key={`${item.code}-${item.timestamp}-${index}`} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-semibold text-gray-800">{item.code}</span>
                      <span className="capitalize text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">({item.type})</span>
                      <span className="text-xs text-gray-400">{new Date(item.timestamp).toLocaleString()}</span>
                    </div>
                    {item.productInfo ? (
                      <div className="mt-2 space-y-1">
                        <p className="text-sm font-medium text-gray-900">{item.productInfo.name || 'Product Name'}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                          {item.productInfo.asin && <span>ASIN: <span className="font-mono">{item.productInfo.asin}</span></span>}
                          {item.productInfo.fnsku && <span>FNSKU: <span className="font-mono">{item.productInfo.fnsku}</span></span>}
                          {item.productInfo.lpn && <span>LPN: <span className="font-mono">{item.productInfo.lpn}</span></span>}
                          {item.productInfo.price != null && <span>Price: <span className="font-semibold text-green-600">${parseFloat(item.productInfo.price).toFixed(2)}</span></span>}
                        </div>
                        {item.productInfo.image_url && (
                          <img 
                            src={item.productInfo.image_url} 
                            alt={item.productInfo.name || 'Product'} 
                            className="mt-2 h-16 w-16 object-contain border border-gray-200 rounded"
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 italic mt-1">Loading product details...</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteScan(index)}
                    className="ml-2 text-red-600 hover:text-red-800 hover:bg-red-50 p-1 rounded flex-shrink-0"
                    title="Delete this scan"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>
                {item.productInfo && (
                  <div className="mt-3 flex flex-col gap-2">
                    {item.productInfo.asin && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleViewOnAmazonFromScan(item)}
                          className="flex-1 inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
                        >
                          <ArrowTopRightOnSquareIcon className="h-3 w-3 mr-1" />
                          View on Amazon
                        </button>
                        <button
                          onClick={() => handlePrintLabelFromScan(item)}
                          className="flex-1 inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                          <PrinterIcon className="h-3 w-3 mr-1" />
                          Print Label
                        </button>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        setProductInfo(item.productInfo);
                        handleOpenAddToInventory();
                      }}
                      className="w-full inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                    >
                      <ShoppingBagIcon className="h-3 w-3 mr-1" />
                      Add to Inventory
                    </button>
                  </div>
                )}
              </div>
            ))}
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
                Location
              </label>
              <input
                type="text"
                id="inventoryLocation"
                name="inventoryLocation"
                value={inventoryLocation}
                onChange={(e) => setInventoryLocation(e.target.value)}
                placeholder="e.g., Warehouse A, Shelf 3"
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                disabled={isAddingToInventory}
              />
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
                  setInventoryLocation('');
                }}
                disabled={isAddingToInventory}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                onClick={handleAddToInventory}
                disabled={isAddingToInventory || !inventoryQuantity || inventoryQuantity < 1}
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