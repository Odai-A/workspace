import React, { useState, useEffect, useRef } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import BarcodeReader from './BarcodeReader';
import { getProductLookup } from '../services/api';
import { productLookupService as dbProductLookupService } from '../services/databaseService';
import { inventoryService } from '../config/supabaseClient';
import { XMarkIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { mockService } from '../services/mockData';

/**
 * Scanner component for barcode scanning and product lookup
 */
const Scanner = () => {
  const [scannedCodes, setScannedCodes] = useState([]);
  const [productInfo, setProductInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  
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
    console.log("Detected code via Camera:", code);
    setIsCameraActive(false);
    
    setScannedCodes(prev => {
      const newHistory = [
        { code, timestamp: new Date().toISOString(), type: 'camera' },
        ...prev.filter(item => item.code !== code)
      ].slice(0, 10);
      return newHistory;
    });
    
    lookupProductByCode(code);
  }

  async function lookupProductByCode(code) {
    setLoading(true);
    setProductInfo(null); // Clear previous product info
    try {
      let productFromDb = await dbProductLookupService.getProductByFnsku(code);

      if (!productFromDb) {
        console.log(`Product not found by FNSKU (${code}), trying as LPN...`);
        productFromDb = await dbProductLookupService.getProductByLpn(code);
      }

      if (productFromDb) {
        const displayProduct = mapSupabaseProductToDisplay(productFromDb);
        setProductInfo(displayProduct);
        toast.success("Product found in database");
        if (displayProduct) {
          console.log("[Scanner.jsx] Attempting to log scan event (from DB). Code:", code, "Product Details:", displayProduct);
          const logResult = await dbProductLookupService.logScanEvent(code, displayProduct);
          console.log("[Scanner.jsx] Scan event log result (from DB):", logResult);
        }
      } else {
        console.log(`Product not found in DB by FNSKU or LPN (${code}), trying external API...`);
        const apiResult = await getProductLookup(code); 
        
        if (apiResult) {
          let displayableProduct = null;
          let productForLogging = apiResult; 
          try {
            const savedProduct = await dbProductLookupService.saveProductLookup(apiResult); 
            
            if (savedProduct) {
              toast.success("Product found via API and saved to database");
              displayableProduct = mapSupabaseProductToDisplay(savedProduct);
              productForLogging = displayableProduct; 
            } else {
              toast.warn("Product found via API, but failed to save to our database.");
              displayableProduct = mapSupabaseProductToDisplay(apiResult); 
            }
          } catch (saveError) {
            console.error("Error saving API result to Supabase:", saveError);
            toast.error("Product found via API, but error saving to our database.");
            displayableProduct = mapSupabaseProductToDisplay(apiResult);
          }
          setProductInfo(displayableProduct);
          if (displayableProduct) {
            console.log("[Scanner.jsx] Attempting to log scan event (from API). Code:", code, "Product Details:", productForLogging);
            const logResult = await dbProductLookupService.logScanEvent(code, productForLogging);
            console.log("[Scanner.jsx] Scan event log result (from API):", logResult);
          }
        } else {
          toast.error("Product not found by scanned code in database or via API.");
        }
      }
    } catch (error) {
      console.error("Error looking up product by code:", error);
      toast.error("Error looking up product by code");
    } finally {
      setLoading(false);
    }
  }

  const handleManualScan = async (barcodeToScan) => {
    if (!barcodeToScan.trim()) {
      toast.error("Please enter a barcode to scan.");
      return;
    }
    setIsManualScanning(true);
    setManualScanError(null);
    setManualScanResult(null);
    setProductInfo(null);
    
    setScannedCodes(prev => {
      const newHistory = [
        { code: barcodeToScan, timestamp: new Date().toISOString(), type: 'manual' },
        ...prev.filter(item => item.code !== barcodeToScan)
      ].slice(0, 10);
      return newHistory;
    });

    await lookupProductByCode(barcodeToScan);
    setIsManualScanning(false);
  };

  const handleViewDetails = () => {
    if (productInfo) {
      // Implement product detail view navigation here
      toast.info("View details functionality will be implemented soon");
    }
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

  return (
    <div className="container mx-auto p-4">
      <ToastContainer position="top-right" autoClose={3000} />
      
      <h1 className="text-2xl font-bold mb-4">Product Scanner</h1>
      
      {/* Add File Import Button */}
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setShowFileImportModal(true)}
          className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded flex items-center"
        >
          <ArrowUpTrayIcon className="h-5 w-5 mr-2" />
          Import File
        </button>
      </div>
      
      {/* Search Bar */}
      <div className="mb-6 bg-white p-4 rounded-lg shadow">
        <div className="flex items-center">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search by LPN, FNSKU, or ASIN"
              className="w-full p-2 border rounded-lg"
            />
            {searchLoading && (
              <div className="absolute right-3 top-2">
                <div className="animate-spin h-5 w-5 border-2 border-blue-500 rounded-full border-t-transparent"></div>
              </div>
            )}
          </div>
          <div className="ml-3 flex items-center">
            <input
              id="exactMatch"
              type="checkbox"
              checked={exactMatch}
              onChange={() => setExactMatch(!exactMatch)}
              className="h-4 w-4 text-blue-600"
            />
            <label htmlFor="exactMatch" className="ml-2 text-sm text-gray-700">
              Exact Match
            </label>
          </div>
        </div>
        
        {/* Search Results */}
        {showSearchResults && searchResults.length > 0 && (
          <div className="mt-2 max-h-60 overflow-y-auto bg-white border rounded-lg shadow-lg">
            <ul className="divide-y divide-gray-200">
              {searchResults.map((product) => (
                <li
                  key={product.id}
                  className="p-3 hover:bg-gray-100 cursor-pointer"
                  onClick={() => selectProduct(product)}
                >
                  <div className="flex justify-between">
                    <div className="font-medium">{product.name}</div>
                    <div className="text-sm text-gray-500">${product.price?.toFixed(2) || 'N/A'}</div>
                  </div>
                  <div className="text-sm text-gray-600">
                    {product.sku || product.asin || product.fnsku}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {showSearchResults && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
          <div className="mt-2 p-3 bg-gray-100 rounded-lg text-center text-gray-600">
            No products found
          </div>
        )}
      </div>
      
      {/* Scanner Interface */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">Barcode Scanner</h2>
          
          {/* Camera Scanner Section */}
          <div className="mb-4">
            <button
              onClick={() => setIsCameraActive(prev => !prev)}
              className={`w-full px-4 py-2 rounded text-white font-semibold ${isCameraActive ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'}`}
            >
              {isCameraActive ? 'Stop Camera Scan' : 'Start Camera Scan'}
            </button>
          </div>
          {isCameraActive && (
            <div className="border p-2 rounded-lg mb-4 bg-gray-100 min-h-[300px]">
              <BarcodeReader
                active={isCameraActive}
                onDetected={handleCodeDetected}
                onError={(err) => {
                  console.error("BarcodeReader component error:", err);
                  toast.error("Camera scanner error. Please ensure camera permissions are granted.");
                  setIsCameraActive(false);
                }}
                showViewFinder={true}
                className="w-full h-full"
              />
            </div>
          )}
          
          {/* Manual Barcode Input Section */}
          <h3 className="text-lg font-semibold mb-2 mt-6">Manual Barcode Entry</h3>
          <div className="mb-4 flex items-center gap-2">
            <input
              type="text"
              placeholder="Enter barcode manually"
              className="border p-2 rounded flex-grow"
              value={manualBarcode}
              onChange={(e) => setManualBarcode(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && manualBarcode.trim()) {
                  handleManualScan(manualBarcode);
                }
              }}
              disabled={isManualScanning}
            />
            <button
              onClick={() => handleManualScan(manualBarcode)}
              className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded"
              disabled={isManualScanning || !manualBarcode.trim()}
            >
              {isManualScanning ? 'Looking up...' : 'Lookup'}
            </button>
          </div>
          
          {/* Display area for manual scan status (optional, productInfo is primary) */}
          {isManualScanning && <p className="text-center text-gray-600">Looking up manual barcode...</p>}
          {/* productInfo will be displayed in the "Product Information" section */}

        </div>
      
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">Product Information</h2>
          
          {/* Reset Button and View Detail Button */}
          <div className="flex justify-between mb-4">
            <button
              onClick={() => setProductInfo(null)}
              className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded"
              disabled={!productInfo || loading}
            >
              Reset
            </button>
            
            {productInfo && (
              <button
                onClick={handleViewDetails}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
              >
                View Details
              </button>
            )}
          </div>
          
          {/* Loading Indicator */}
          {loading && (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          )}
          
          {/* Product Info Display */}
          {!loading && productInfo && (
            <div className="border p-4 rounded-lg space-y-2">
              <h3 className="text-lg font-bold truncate" title={productInfo.name}>{productInfo.name}</h3>
              
              <p className="text-sm text-gray-700">
                <strong>LPN (X-Z ASIN):</strong> {productInfo.lpn || 'N/A'}
              </p>
              <p className="text-sm text-gray-700">
                <strong>FNSKU:</strong> {productInfo.fnsku || 'N/A'}
              </p>
              <p className="text-sm text-gray-700">
                <strong>ASIN (B00):</strong> {productInfo.asin || 'N/A'}
              </p>
              <p className="text-sm text-gray-700">
                <strong>UPC:</strong> {productInfo.upc || 'N/A'}
              </p>
              <p className="text-sm text-gray-700">
                <strong>Category:</strong> {productInfo.category || 'N/A'}
              </p>
              <p className="text-sm text-gray-700">
                <strong>Quantity:</strong> {productInfo.quantity !== undefined ? productInfo.quantity : 'N/A'}
              </p>
              <p className="text-green-600 font-semibold text-md">
                <strong>MSRP:</strong> ${typeof productInfo.price === 'number' ? productInfo.price.toFixed(2) : 'N/A'}
              </p>

              {/* Add View on Amazon button if ASIN is available */}
              {productInfo.asin && (
                <div className="mt-4">
                  <button
                    onClick={() => window.open(`https://www.amazon.com/dp/${productInfo.asin}`, '_blank')}
                    className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 px-4 rounded flex items-center justify-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" className="w-5 h-5 mr-2" viewBox="0 0 16 16">
                      <path d="M2.534 16c-.263 0-.44-.093-.553-.27C1.869 15.55.034 11.29.034 7.785c0-2.81.908-4.943 2.804-6.4C4.133.463 5.78-.001 7.683-.001c2.473 0 4.03.902 5.132 2.104s1.31 2.964 1.31 5.317c0 .312-.02.69-.06 1.146-.093.986-.335 2.033-.94 3.288-.513 1.073-1.18 1.986-2.004 2.727-.832.748-1.82 1.244-3.013 1.5-.3.06-.728.093-1.293.093-.613 0-1.107-.033-1.48-.093a4.59 4.59 0 0 1-.373-.066c-.68-.153-1.233-.426-1.653-.813-.6-.6-.98-1.433-.98-2.51s.413-1.913 1.026-2.486c.62-.58 1.48-.873 2.573-.873.933 0 1.68.206 2.24.62.56.413.946 1.006 1.16 1.786.04.153.06.293.06.426 0 .32-.086.58-.26.78-.173.2-.406.3-.7.3-.246 0-.466-.073-.66-.22-.193-.146-.373-.4-.54-.76-.166-.36-.36-.633-.58-.82-.22-.186-.486-.28-.793-.28-.633 0-1.173.22-1.62.66-.446.44-.67 1.013-.67 1.72 0 .613.186 1.093.56 1.44.373.346.866.52 1.48.52.446 0 .84-.086 1.18-.26.34-.173.613-.406.82-.7.206-.293.34-.646.406-1.06.066-.413.1-.866.1-1.36 0-2.006-.506-3.64-1.52-4.9-1.006-1.26-2.42-1.893-4.24-1.893-1.64 0-3.006.486-4.093 1.46-.966.86-1.45 2.233-1.45 4.112 0 3.013 1.493 6.446 2.666 7.926.12.16.18.286.18.373 0 .186-.073.28-.22.28Z"/>
                      <path d="M12.872.62H16v2.977h-1.126V1.747h-2.002V.62Zm-1.405 0V1.747h2.002v1.85H16V.62h-4.533Z"/>
                    </svg>
                    View on Amazon
                  </button>
                </div>
              )}

              
              {/* Displaying productInfo.description if it was mapped and different from name, 
                  but our current mapSupabaseProductToDisplay maps both to Supabase 'Description' column. 
                  If 'Description' is long, the h3 title is already showing it. 
                  You can uncomment this if you have a separate, more detailed description field. 
              {productInfo.description && productInfo.description !== productInfo.name && (
                <div className="mt-2">
                  <h4 className="font-semibold text-sm">Full Description:</h4>
                  <p className="text-gray-700 text-xs whitespace-pre-wrap">{productInfo.description}</p>
                </div>
              )} 
              */}
              
              {/* Placeholder for image if you map an image_url in productInfo
              {productInfo.image_url && (
                <div className="mt-4 flex justify-center">
                  <img 
                    src={productInfo.image_url} 
                    alt={productInfo.name} 
                    className="max-h-48 object-contain rounded"
                  />
                </div>
              )} 
              */}
            </div>
          )}
          
          {!loading && !productInfo && (
            <div className="border p-4 rounded-lg text-center text-gray-500">
              <p>Scan a barcode, use manual lookup, or search for a product to view details.</p>
            </div>
          )}
        </div>
      </div>
      
      {/* Scanned Codes History */}
      <div className="mt-6 bg-white p-4 rounded-lg shadow">
        <h2 className="text-xl font-bold mb-4">Recent Scans</h2>
        
        {scannedCodes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {scannedCodes.map((item, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{item.code}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {new Date(item.timestamp).toLocaleTimeString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => lookupProductByCode(item.code)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Lookup
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-center">No recent scans</p>
        )}
      </div>
      
      {/* File Import Modal */}
      {showFileImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Import File</h2>
              <button 
                className="text-gray-500 hover:text-gray-700"
                onClick={() => setShowFileImportModal(false)}
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            
            {/* Import Type Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Import Type</label>
              <div className="flex space-x-4">
                <button
                  className={`px-4 py-2 rounded ${fileImportType === 'products' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                  onClick={() => handleImportTypeChange('products')}
                >
                  Products
                </button>
                <button
                  className={`px-4 py-2 rounded ${fileImportType === 'inventory' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                  onClick={() => handleImportTypeChange('inventory')}
                >
                  Inventory
                </button>
              </div>
              
              <p className="mt-2 text-sm text-gray-500">
                {fileImportType === 'products' 
                  ? 'Import product information from a CSV or Excel file.' 
                  : 'Import inventory quantities and locations from a CSV or Excel file.'}
              </p>
            </div>
            
            {/* File Input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select File (CSV)
              </label>
              <input
                type="file"
                accept=".csv"
                className="w-full p-2 border rounded"
                onChange={handleFileSelect}
                ref={fileInputRef}
                disabled={importLoading}
              />
              <p className="mt-1 text-sm text-gray-500">
                Only CSV files are supported. For Excel files, save as CSV first.
              </p>
            </div>
            
            {/* Preview */}
            {importPreview.length > 0 && (
              <div className="mb-4">
                <h3 className="font-medium mb-2">Preview (First 5 rows)</h3>
                <div className="overflow-x-auto max-h-64 overflow-y-auto border rounded">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        {Object.keys(importPreview[0]).map((header, index) => (
                          <th 
                            key={index}
                            className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {importPreview.map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          {Object.values(row).map((cell, cellIndex) => (
                            <td 
                              key={cellIndex}
                              className="px-3 py-2 whitespace-nowrap text-sm text-gray-900"
                            >
                              {cell || '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  Total rows to import: {importTotal}
                </p>
              </div>
            )}
            
            {/* Import Progress */}
            {importLoading && importTotal > 0 && (
              <div className="mb-4">
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">Progress</span>
                  <span className="text-sm font-medium text-gray-700">
                    {Math.round((importProgress / importTotal) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div 
                    className="bg-blue-600 h-2.5 rounded-full" 
                    style={{ width: `${(importProgress / importTotal) * 100}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  Processed {importProgress} of {importTotal} items
                </p>
              </div>
            )}
            
            {/* Action Buttons */}
            <div className="flex justify-end space-x-3 mt-6">
              <button
                className="px-4 py-2 bg-gray-300 hover:bg-gray-400 rounded"
                onClick={() => setShowFileImportModal(false)}
                disabled={importLoading}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded disabled:bg-blue-300"
                onClick={processFileImport}
                disabled={!importFile || importLoading}
              >
                {importLoading ? 'Importing...' : 'Import File'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Scanner; 