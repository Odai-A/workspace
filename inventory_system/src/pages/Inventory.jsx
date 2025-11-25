import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowDownTrayIcon,
  ChevronDownIcon,
  XMarkIcon,
  ArrowPathIcon,
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
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';
import { productLookupService, apiCacheService } from '../services/databaseService';
import { inventoryService, supabase } from '../config/supabaseClient';
import axios from 'axios';

const ITEMS_PER_PAGE = 15;

const Inventory = () => {
  const { apiClient } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [error, setError] = useState(null);
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Sample data for locations, categories, etc.
  const locations = ['All Locations', 'Warehouse A', 'Warehouse B', 'Warehouse C', 'Warehouse D'];
  const categories = ['All Categories', 'Smart Speakers', 'Streaming Devices', 'E-readers', 'Smart Home', 'Tablets'];
  const statuses = ['All', 'In Stock', 'Low Stock', 'Out of Stock'];
  
  // Debounce search term
  useEffect(() => {
    const timerId = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1); // Reset to first page on new search
    }, 500);
    return () => clearTimeout(timerId);
  }, [searchTerm]);

  const fetchInventory = useCallback(async () => {
    console.log("fetchInventory called. Page:", currentPage, "Search:", debouncedSearchTerm);
    setLoading(true);
    setError(null);
    try {
      // First, try to get from inventory table (items added via scanner)
      const inventoryResult = await inventoryService.getInventory({
        page: currentPage,
        limit: ITEMS_PER_PAGE,
        searchQuery: debouncedSearchTerm,
      });
      
      console.log("fetchInventory - Inventory table result:", inventoryResult);
      
      // Also get from manifest_data for products that might not be in inventory yet
      const manifestResult = await productLookupService.getProducts({
        page: currentPage,
        limit: ITEMS_PER_PAGE,
        searchQuery: debouncedSearchTerm,
      });
      
      console.log("fetchInventory - Manifest table result:", manifestResult);
      
      // Combine results, prioritizing inventory items
      // Map inventory items to match the expected format
      // Helper function to determine if a string is an ASIN (starts with B0 and is 10 chars)
      const isAsin = (str) => str && typeof str === 'string' && str.length === 10 && str.startsWith('B0');
      
      // Helper function to determine if a string is an FNSKU (typically starts with X00 or similar)
      const isFnsku = (str) => str && typeof str === 'string' && (str.startsWith('X') || str.length > 10);
      
      const inventoryItems = await Promise.all((inventoryResult.data || []).map(async (item) => {
        let asin = item.asin || '';
        let fnsku = '';
        let lpn = '';
        let image_url = '';
        
        // Determine what the SKU actually is
        const skuValue = item.sku || '';
        if (isAsin(skuValue)) {
          // SKU is actually an ASIN
          asin = skuValue;
          fnsku = ''; // We don't have FNSKU in this case
        } else if (isFnsku(skuValue)) {
          // SKU is an FNSKU
          fnsku = skuValue;
        } else {
          // SKU might be something else, use it as FNSKU by default
          fnsku = skuValue;
        }
        
        // If product_id exists, try to get ASIN and image_url from manifest_data
        if (item.product_id) {
          try {
            // Try to get product from manifest_data using product_id
            const { data: manifestData, error } = await supabase
              .from('manifest_data')
              .select('*')
              .eq('id', item.product_id)
              .maybeSingle();
            
            if (manifestData && !error) {
              // Extract ASIN from manifest_data
              if (!asin && manifestData['B00 Asin']) {
                asin = manifestData['B00 Asin'];
              }
              // Extract FNSKU from manifest_data
              if (!fnsku && manifestData['Fn Sku']) {
                fnsku = manifestData['Fn Sku'];
              }
              // Extract LPN from manifest_data
              if (manifestData['X-Z ASIN']) {
                lpn = manifestData['X-Z ASIN'];
              }
              // Extract image_url if available
              if (manifestData.image_url) {
                image_url = manifestData.image_url;
              }
            } else if (fnsku && !asin) {
              // Fallback: try to get by FNSKU
              const manifestProduct = await productLookupService.getProductByFnsku(fnsku);
              if (manifestProduct) {
                if (!asin && manifestProduct.asin) {
                  asin = manifestProduct.asin;
                }
                if (!lpn && manifestProduct.lpn) {
                  lpn = manifestProduct.lpn;
                }
                if (!image_url && manifestProduct.image_url) {
                  image_url = manifestProduct.image_url;
                }
              }
            }
          } catch (err) {
            console.warn('Could not fetch data from manifest_data:', err);
          }
        } else if (fnsku && !asin) {
          // If no product_id but we have FNSKU, try to lookup
          try {
            const manifestProduct = await productLookupService.getProductByFnsku(fnsku);
            if (manifestProduct) {
              if (!asin && manifestProduct.asin) {
                asin = manifestProduct.asin;
              }
              if (!lpn && manifestProduct.lpn) {
                lpn = manifestProduct.lpn;
              }
              if (!image_url && manifestProduct.image_url) {
                image_url = manifestProduct.image_url;
              }
            }
          } catch (err) {
            console.warn('Could not fetch ASIN from manifest_data:', err);
          }
        }
        
        // If we have ASIN but no image, check cache first (NO API CALLS - only use Supabase data)
        if (asin && !image_url) {
          try {
            // Check api_lookup_cache for image (no charge - just database lookup)
            const cachedData = await apiCacheService.getCachedLookup(asin);
            if (cachedData && cachedData.image_url) {
              image_url = cachedData.image_url;
              console.log(`✅ Found image in cache for ASIN ${asin} - no API charge`);
            } else if (fnsku) {
              // Also try by FNSKU
              const cachedByFnsku = await apiCacheService.getCachedLookup(fnsku);
              if (cachedByFnsku && cachedByFnsku.image_url) {
                image_url = cachedByFnsku.image_url;
                console.log(`✅ Found image in cache for FNSKU ${fnsku} - no API charge`);
              }
            }
            // NO Rainforest API call - only use cached data to avoid charges
          } catch (err) {
            console.warn('Could not fetch image from cache:', err);
            // Don't call Rainforest API - just use what we have
          }
        }
        
        return {
          id: item.id,
          product_id: item.product_id,
          'Description': item.name || 'Unknown Product',
          'X-Z ASIN': lpn, // LPN from manifest_data
          'Fn Sku': fnsku,
          'B00 Asin': asin,
          'Quantity': item.quantity || 0,
          'MSRP': item.price || 0,
          'Category': item.category || 'Uncategorized',
          'Location': item.location || 'Default',
          image_url: image_url,
          source: 'inventory_table',
          // Store raw data for print label
          _rawData: item
        };
      }));
      
      // Map manifest items to expected format
      const manifestItems = (manifestResult.data || []).map(item => ({
        ...item,
        image_url: item.image_url || item['Image URL'] || '',
        source: 'manifest_data'
      }));
      
      // Combine and deduplicate by SKU/FNSKU/ASIN, preserving image_url
      const combinedItems = [...inventoryItems];
      manifestItems.forEach(manifestItem => {
        const manifestSku = manifestItem['Fn Sku'] || manifestItem['X-Z ASIN'];
        const manifestAsin = manifestItem['B00 Asin'];
        const existingIndex = combinedItems.findIndex(invItem => 
          (invItem['Fn Sku'] === manifestSku || 
           invItem['X-Z ASIN'] === manifestSku ||
           invItem['B00 Asin'] === manifestAsin)
        );
        
        if (existingIndex >= 0) {
          // Update existing item with image_url from manifest if it doesn't have one
          if (!combinedItems[existingIndex].image_url && manifestItem.image_url) {
            combinedItems[existingIndex].image_url = manifestItem.image_url;
          }
        } else {
          combinedItems.push(manifestItem);
        }
      });
      
      // Apply client-side search filter if needed (for better matching)
      let filteredItems = combinedItems;
      if (debouncedSearchTerm && debouncedSearchTerm.trim()) {
        const searchLower = debouncedSearchTerm.toLowerCase();
        filteredItems = combinedItems.filter(item => {
          const description = (item['Description'] || item.name || '').toLowerCase();
          const asin = (item['B00 Asin'] || item.asin || '').toLowerCase();
          const fnsku = (item['Fn Sku'] || item.sku || '').toLowerCase();
          const lpn = (item['X-Z ASIN'] || item.lpn || '').toLowerCase();
          
          return description.includes(searchLower) ||
                 asin.includes(searchLower) ||
                 fnsku.includes(searchLower) ||
                 lpn.includes(searchLower);
        });
      }
      
      // Ensure all items have image_url properly set
      const itemsWithImages = filteredItems.map(item => ({
        ...item,
        image_url: item.image_url || item['Image URL'] || item._rawData?.image_url || ''
      }));
      
      setProducts(itemsWithImages);
      setTotalItems(itemsWithImages.length);
    } catch (err) {
      console.error('Error loading inventory:', err);
      setError('Failed to load inventory data');
      toast.error('Failed to load inventory data');
      setProducts([]);
      setTotalItems(0);
    } finally {
      setLoading(false);
      console.log("fetchInventory finished.");
    }
  }, [currentPage, debouncedSearchTerm]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString(); // Simpler date format
    } catch (error) {
      return 'Invalid Date';
    }
  };

  // REMOVED: fetchImageFromRainforest function
  // We no longer automatically fetch from Rainforest API to avoid charges
  // Images should come from:
  // 1. manifest_data table (image_url column)
  // 2. api_lookup_cache table (cached from previous scans)
  // If you need to fetch images, do it manually via the Scanner page where it's cached

  // Create print label HTML (similar to Scanner.jsx)
  const createPrintLabelHTML = (productInfo) => {
    if (!productInfo || !productInfo.asin) {
      return '<html><body><p>Error: Product information not available</p></body></html>';
    }

    const retailPrice = parseFloat(productInfo.price) || 0;
    const ourPrice = retailPrice / 2;
    const amazonUrl = `https://www.amazon.com/dp/${productInfo.asin}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(amazonUrl)}`;
    const qrCodeHtml = `<img src="${qrCodeUrl}" alt="QR Code" style="width: 80px; height: 80px;" />`;

    const escapeHtml = (text) => {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    };

    // Show full product name (no truncation)
    const productName = productInfo.name || 'Product';

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Product Label - ${escapeHtml(productName)}</title>
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
              img {
                image-rendering: -webkit-optimize-contrast !important;
                image-rendering: crisp-edges !important;
                image-rendering: pixelated !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
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
            .no-print {
              position: fixed;
              top: 20px;
              right: 20px;
              z-index: 1000;
            }
            .print-button {
              padding: 10px 20px;
              background: #3b82f6;
              color: white;
              border: none;
              border-radius: 5px;
              cursor: pointer;
              font-size: 14px;
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
              ${qrCodeHtml}
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
  
  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
  };

  // Reset filters
  const handleResetFilters = () => {
    setSearchTerm('');
    toast.info('Filters have been reset');
  };

  // Export to CSV
  const handleExport = () => {
    try {
      // Filter items if needed based on current filters/search
      const dataToExport = products;
      
      // Convert data to CSV format
      const headers = ['Product Description', 'LPN', 'ASIN', 'Quantity', 'MSRP', 'Category'];
      
      const csvRows = [
        headers.join(','),
        ...dataToExport.map(item => [
          `"${(item.Description || '').replace(/"/g, '""')}"`,
          `"${(item['X-Z ASIN'] || '').replace(/"/g, '""')}"`,
          `"${(item['B00 Asin'] || '').replace(/"/g, '""')}"`,
          item.Quantity !== null && item.Quantity !== undefined ? item.Quantity.toString() : 'N/A',
          item.MSRP !== null && item.MSRP !== undefined ? `$${item.MSRP.toFixed(2)}` : 'N/A',
          `"${(item.Category || '').replace(/"/g, '""')}"`
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
      
      toast.success('Inventory data has been exported to CSV');
    } catch (error) {
      console.error('Error exporting inventory:', error);
      toast.error('Failed to export inventory data');
    }
  };

  // Handle adding stock - open modal
  const handleAddStock = () => {
    setShowAddStockModal(true);
  };

  // Handle adding new items through the modal
  const handleAddItems = async (newItems) => {
    try {
      const addedItems = [];
      
      for (const newItem of newItems) {
        // First, check if the product exists in the product lookup database
        let productId = null;
        const existingProduct = await productLookupService.getProductByFnSku(newItem.FnSku);
        
        if (existingProduct) {
          productId = existingProduct.id;
        } else {
          // Create a new product lookup entry
          const productData = {
            name: newItem.Description,
            FnSku: newItem.FnSku,
            B00Asin: newItem['B00 Asin'],
            category: newItem.Category || 'Uncategorized',
            condition: 'New',
            source: 'Manual Entry',
            created_at: new Date().toISOString()
          };
          
          const savedProduct = await productLookupService.addOrUpdateProduct(productData);
          productId = savedProduct.id;
        }
        
        // Check if inventory item with this SKU already exists
        const existingInventory = await productLookupService.getProductByFnSku(newItem.FnSku);
        
        if (existingInventory) {
          // Update existing inventory
          const updatedItem = await productLookupService.addOrUpdateProduct({
            ...existingInventory,
            quantity: existingInventory.quantity + (newItem.Quantity || 0),
            updated_at: new Date().toISOString(),
            last_updated_reason: 'Added stock via form'
          });
          
          addedItems.push(updatedItem);
          toast.info(`Updated quantity for existing item: ${newItem.Description}`);
        } else {
          // Add new inventory item
          const inventoryData = {
            product_id: productId,
            product_name: newItem.Description,
            FnSku: newItem.FnSku,
            quantity: newItem.Quantity || 0,
            min_quantity: 10,
            location: 'All Locations',
            category: newItem.Category || 'Uncategorized',
            status: 'Active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          
          const savedItem = await productLookupService.addOrUpdateProduct(inventoryData);
          addedItems.push(savedItem);
        }
      }
      
      // Refresh inventory list
      fetchInventory();
      
      // Show success message
      toast.success(`Added ${addedItems.length} items to inventory`);
    } catch (error) {
      console.error('Error adding inventory items:', error);
      toast.error('Failed to add items to inventory. Please try again.');
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

  // Delete an inventory item
  const handleDeleteItem = async (item) => {
    if (!window.confirm(`Are you sure you want to delete "${item.Description}" from inventory?`)) {
      return;
    }

    setIsDeleting(true);
    try {
      // Determine which service to use based on source
      let result;
      if (item.source === 'inventory_table' && item.id) {
        // Delete from inventory table
        result = await inventoryService.deleteInventoryItem(item.id);
      } else if (item.source === 'manifest_data' && item.id) {
        // Delete from manifest_data (if user has permission)
        result = await productLookupService.deleteProduct(item.id);
      } else {
        toast.error('Cannot delete: Item source unknown or missing ID');
        return;
      }

      if (result && (result.success || !result.error)) {
        // Update the local state
        setProducts(products.filter(i => i.id !== item.id));
        // Remove from selected items if it was selected
        const newSelected = new Set(selectedItems);
        newSelected.delete(item.id);
        setSelectedItems(newSelected);
        
        toast.success(`${item.Description} has been removed from inventory`);
        // Refresh inventory to ensure consistency
        fetchInventory();
      } else {
        throw new Error(result?.error?.message || 'Delete failed');
      }
    } catch (error) {
      console.error('Error deleting inventory item:', error);
      toast.error(`Failed to delete inventory item: ${error.message || 'Unknown error'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedItems.size === 0) {
      toast.warning('Please select at least one item to delete');
      return;
    }

    const selectedArray = Array.from(selectedItems);
    const selectedProducts = products.filter(p => selectedArray.includes(p.id));
    const itemNames = selectedProducts.map(p => p.Description || 'Unknown').join(', ');
    
    if (!window.confirm(`Are you sure you want to delete ${selectedItems.size} item(s)?\n\n${itemNames}`)) {
      return;
    }

    setIsDeleting(true);
    try {
      // Separate items by source
      const inventoryItems = selectedProducts.filter(p => p.source === 'inventory_table' && p.id);
      const manifestItems = selectedProducts.filter(p => p.source === 'manifest_data' && p.id);

      let deletedCount = 0;
      let errors = [];

      // Delete from inventory table
      if (inventoryItems.length > 0) {
        const inventoryIds = inventoryItems.map(i => i.id);
        const result = await inventoryService.deleteInventoryItems(inventoryIds);
        if (result.success) {
          deletedCount += result.deletedCount || inventoryIds.length;
        } else {
          errors.push(`Failed to delete ${inventoryItems.length} inventory item(s)`);
        }
      }

      // Delete from manifest_data (one by one since we don't have bulk delete there)
      for (const item of manifestItems) {
        try {
          const result = await productLookupService.deleteProduct(item.id);
          if (result) {
            deletedCount++;
          } else {
            errors.push(`Failed to delete ${item.Description}`);
          }
        } catch (error) {
          errors.push(`Failed to delete ${item.Description}: ${error.message}`);
        }
      }

      if (deletedCount > 0) {
        toast.success(`Successfully deleted ${deletedCount} item(s)`);
        setSelectedItems(new Set());
        fetchInventory();
      }

      if (errors.length > 0) {
        toast.error(`Some items could not be deleted: ${errors.join(', ')}`);
      }
    } catch (error) {
      console.error('Error in bulk delete:', error);
      toast.error(`Failed to delete items: ${error.message || 'Unknown error'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle item selection
  const handleSelectItem = (itemId) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  // Handle select all
  const handleSelectAll = () => {
    if (selectedItems.size === products.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(products.map(p => p.id).filter(id => id)));
    }
  };

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
            checked={selectedItems.size > 0 && selectedItems.size === products.length}
            onChange={handleSelectAll}
            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ),
      accessor: 'select',
      cell: (props) => {
        const rowData = props.row.original;
        const itemId = rowData.id;
        if (!itemId) return null;
        return (
          <input
            type="checkbox"
            checked={selectedItems.has(itemId)}
            onChange={() => handleSelectItem(itemId)}
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
            // Get image URL from multiple possible sources
            const imageUrl = rowData.image_url || 
                           rowData._rawData?.image_url || 
                           (rowData.source === 'manifest_data' ? (rowData['Image URL'] || rowData.image_url) : '') || 
                           '';
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
              <div className="text-xs text-gray-500 mt-1">LPN: {rowData['X-Z ASIN'] || 'N/A'}</div>
              <div className="text-xs text-gray-500">FNSKU: {rowData['Fn Sku'] || 'N/A'}</div>
              <div className="text-xs text-gray-500">ASIN: {rowData['B00 Asin'] || 'N/A'}</div>
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
          if (!rowData['B00 Asin']) {
            toast.error('ASIN not available for this product');
            return;
          }
          
          // Create product info object for printing
          const productInfo = {
            name: rowData['Description'] || 'Unknown Product',
            asin: rowData['B00 Asin'],
            fnsku: rowData['Fn Sku'] || '',
            lpn: rowData['X-Z ASIN'] || '',
            price: rowData['MSRP'] || 0,
            image_url: rowData.image_url || rowData._rawData?.image_url || ''
          };
          
          // Import and use the print label function from Scanner
          // We'll create a simplified version here
          const printLabelHTML = createPrintLabelHTML(productInfo);
          const printWindow = window.open('', '_blank');
          if (printWindow) {
            printWindow.document.write(printLabelHTML);
            printWindow.document.close();
            printWindow.onload = () => {
              printWindow.print();
            };
          }
        };
        
        return (
          <div className="flex items-center justify-end space-x-1">
            {rowData['B00 Asin'] && (
              <>
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
                <button
                  onClick={handlePrintLabel}
                  className="p-1 text-green-600 hover:text-green-800"
                  title="Print Label"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.007M6.34 18H5.332m0 0a3.001 3.001 0 00-1.743-2.634M5.332 18h13.305m0 0a3.004 3.004 0 001.743-2.634M18.637 11.03a1.5 1.5 0 00-1.5-1.5h-1.382m0 0a3.004 3.004 0 00-1.792-2.549M15.755 9.57l-1.5-1.5m0 0a3.004 3.004 0 00-1.743-2.634m1.743 2.634L12 6.75m-6.637 4.28a3.004 3.004 0 001.743 2.634l-.229 2.523M19.5 12c.243 0 .477.03.707.085M19.5 12l-1.5-1.5m1.5 1.5l-1.5 1.5" />
                  </svg>
                </button>
              </>
            )}
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
                title="Delete Item"
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
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-gray-600">
            Track and manage stock levels across all locations
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          {selectedItems.size > 0 && (
            <Button 
              variant="danger"
              className="flex items-center"
              onClick={handleBulkDelete}
              disabled={isDeleting}
            >
              <TrashIcon className="h-5 w-5 mr-2" />
              Delete Selected ({selectedItems.size})
            </Button>
          )}
          <Button 
            variant="outline" 
            className="flex items-center"
            onClick={handleExport}
          >
            <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
            Export
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
        </div>
        
        {loading && products.length === 0 ? (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
        ) : !loading && products.length === 0 && !error ? (
            <div className="text-center py-8 text-gray-500">
                No inventory items found. Try a different search.
            </div>
        ) : (
            <>
              {console.log("RENDERING TABLE: products state:", products)} 
              {console.log("RENDERING TABLE: columns state:", columns)} 
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
          <div className="p-4">
            <Pagination
              currentPage={currentPage}
              totalPages={Math.ceil(totalItems / ITEMS_PER_PAGE)}
              onPageChange={handlePageChange}
              totalItems={totalItems}
              itemsPerPage={ITEMS_PER_PAGE}
            />
          </div>
        )}
      </Card>

      {/* Temporarily comment out AddStockModal until its logic is refactored for Supabase */}
      {/* <AddStockModal 
        isOpen={showAddStockModal}
        onClose={() => setShowAddStockModal(false)}
        onAddItems={handleAddItems} 
      /> */}
    </div>
  );
};

export default Inventory;