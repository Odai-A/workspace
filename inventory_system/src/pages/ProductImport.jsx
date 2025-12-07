import React, { useState, useRef } from 'react';
import { toast } from 'react-toastify';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { ArrowUpTrayIcon, CheckCircleIcon, XCircleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { supabase } from '../config/supabaseClient';
import { getApiEndpoint } from '../utils/apiConfig';

// Comprehensive column mapping - maps common variations to standard field names
const COLUMN_MAPPINGS = {
  fnsku: [
    'fnsku', 'fn sku', 'fn-sku', 'fnsku #', 'fnsku#', 'fnsku number',
    'sku', 'skus', 'sku #', 'sku#', 'sku number', 'sku id', 'sku id #',
    'fba sku', 'fba-sku', 'amazon sku', 'amazon-sku',
    'product sku', 'product-sku', 'item sku', 'item-sku',
    'merchant sku', 'merchant-sku', 'seller sku', 'seller-sku'
  ],
  asin: [
    'asin', 'asins', 'asin #', 'asin#', 'asin number',
    'b00 asin', 'b00-asin', 'b00asin',
    'amazon asin', 'amazon-asin', 'amazon product id',
    'product asin', 'product-asin'
  ],
  lpn: [
    'lpn', 'lpns', 'lpn #', 'lpn#', 'lpn number',
    'x-z asin', 'x-z-asin', 'xz asin', 'xz-asin',
    'license plate', 'license plate number',
    'tracking number', 'tracking #', 'tracking#',
    'shipment id', 'shipment-id', 'shipment identifier'
  ],
  upc: [
    'upc', 'upcs', 'upc #', 'upc#', 'upc number', 'upc code',
    'barcode', 'barcodes', 'barcode #', 'barcode#',
    'ean', 'eans', 'ean #', 'ean#', 'ean number',
    'gtin', 'gtins', 'gtin #', 'gtin#',
    'product code', 'product-code', 'item code', 'item-code'
  ],
  name: [
    'name', 'product name', 'product-name', 'product title', 'product-title',
    'item name', 'item-name', 'item description', 'item-desc', 'itemdesc',
    'description', 'descriptions', 'product description', 'product-desc',
    'title', 'titles', 'product title', 'product-title',
    'item', 'items', 'item name', 'item-name',
    'gl desc', 'gl-desc', 'gldesc', 'gl description',
    'product', 'products', 'product name', 'product-name'
  ],
  price: [
    'price', 'prices', 'unit price', 'unit-price', 'unitprice',
    'retail', 'retail price', 'retail-price', 'retailprice',
    'msrp', 'msrp price', 'msrp-price',
    'cost', 'costs', 'unit cost', 'unit-cost', 'unitcost',
    'selling price', 'selling-price', 'sellingprice',
    'list price', 'list-price', 'listprice',
    'amount', 'amounts', 'value', 'values'
  ],
  category: [
    'category', 'categories', 'product category', 'product-category',
    'item category', 'item-category', 'itemcategory',
    'type', 'types', 'product type', 'product-type',
    'department', 'departments', 'dept', 'depts',
    'classification', 'classifications', 'class', 'classes'
  ],
  quantity: [
    'quantity', 'quantities', 'qty', 'qtys', 'qty.', 'qty #', 'qty#',
    'units', 'unit', 'unit count', 'unit-count', 'unitcount',
    'count', 'counts', 'amount', 'amounts',
    'stock', 'stocks', 'stock quantity', 'stock-quantity',
    'inventory', 'inventories', 'inventory quantity', 'inventory-quantity',
    'available', 'available quantity', 'available-quantity'
  ],
  brand: [
    'brand', 'brands', 'brand name', 'brand-name', 'brandname',
    'manufacturer', 'manufacturers', 'manufacturer name', 'manufacturer-name',
    'maker', 'makers', 'vendor', 'vendors', 'supplier', 'suppliers'
  ]
};

// Helper function to parse a single CSV line, handling quoted fields
const parseCSVLine = (line) => {
  const result = [];
  let inQuote = false;
  let field = '';
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '\"' && !(i > 0 && line[i-1] === '\\')) {
      if (i < line.length - 1 && line[i + 1] === '\"') {
        field += '\"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (char === ',' && !inQuote) {
      result.push(field.trim());
      field = '';
    } else {
      field += char;
    }
  }
  result.push(field.trim());
  return result;
};

// Normalize string for comparison (remove spaces, special chars, case-insensitive)
const normalizeForComparison = (str) => {
  if (!str) return '';
  return str.toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')  // Multiple spaces to single space
    .replace(/[#\-_]/g, '')  // Remove #, -, _
    .trim();
};

// Find matching column in headers
const findMatchingColumn = (headers, acceptedVariations) => {
  // First, try exact matches (case-insensitive)
  for (const acceptedCol of acceptedVariations) {
    for (const header of headers) {
      if (normalizeForComparison(header) === normalizeForComparison(acceptedCol)) {
        return header;
      }
    }
  }
  
  // Then try partial matches (one contains the other)
  for (const acceptedCol of acceptedVariations) {
    const normalizedAccepted = normalizeForComparison(acceptedCol);
    for (const header of headers) {
      const normalizedHeader = normalizeForComparison(header);
      
      // Check if one contains the other (for variations like "Product Name" vs "Name")
      if (normalizedAccepted.length >= 3 && normalizedHeader.length >= 3) {
        if (normalizedHeader.includes(normalizedAccepted) || 
            normalizedAccepted.includes(normalizedHeader)) {
          return header;
        }
      }
    }
  }
  
  return null;
};

// Auto-detect column mappings from CSV headers
const detectColumnMappings = (headers) => {
  const mappings = {};
  
  for (const [fieldName, variations] of Object.entries(COLUMN_MAPPINGS)) {
    const matchedColumn = findMatchingColumn(headers, variations);
    if (matchedColumn) {
      mappings[fieldName] = matchedColumn;
    }
  }
  
  return mappings;
};

// Clean and normalize data values
const cleanValue = (value, fieldType = 'text') => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  
  let cleaned = String(value).trim();
  
  if (cleaned === '' || cleaned.toLowerCase() === 'n/a' || cleaned.toLowerCase() === 'na') {
    return null;
  }
  
  // Remove common prefixes/suffixes
  cleaned = cleaned.replace(/^["']|["']$/g, ''); // Remove surrounding quotes
  
  switch (fieldType) {
    case 'number':
    case 'price':
    case 'quantity':
      // Remove currency symbols, commas, and other non-numeric chars except decimal point
      cleaned = cleaned.replace(/[^0-9.-]/g, '');
      if (cleaned === '' || cleaned === '-') return null;
      const num = parseFloat(cleaned);
      return isNaN(num) ? null : num;
    
    case 'text':
    case 'name':
    case 'description':
    case 'category':
    case 'brand':
      // Clean text: remove extra spaces, normalize
      cleaned = cleaned.replace(/\s+/g, ' ').trim();
      return cleaned === '' ? null : cleaned;
    
    case 'identifier':
    case 'fnsku':
    case 'asin':
    case 'lpn':
    case 'upc':
      // Clean identifiers: uppercase, remove spaces and special chars
      cleaned = cleaned.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9]/g, '');
      return cleaned === '' ? null : cleaned;
    
    default:
      return cleaned === '' ? null : cleaned;
  }
};

// Map CSV row to normalized format using column mappings
const mapRowToNormalized = (csvRow, columnMappings) => {
  const getValue = (fieldName) => {
    const mappedColumn = columnMappings[fieldName];
    if (!mappedColumn || !csvRow[mappedColumn]) {
      return null;
    }
    return csvRow[mappedColumn];
  };
  
  // Determine field types for cleaning
  const fieldTypes = {
    fnsku: 'identifier',
    asin: 'identifier',
    lpn: 'identifier',
    upc: 'identifier',
    name: 'text',
    price: 'price',
    category: 'text',
    quantity: 'quantity',
    brand: 'text'
  };
  
  const normalized = {};
  
  for (const fieldName of Object.keys(COLUMN_MAPPINGS)) {
    const value = getValue(fieldName);
    const fieldType = fieldTypes[fieldName] || 'text';
    normalized[fieldName] = cleanValue(value, fieldType);
  }
  
  return normalized;
};

const ProductImport = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvRows, setCsvRows] = useState([]);
  const [columnMappings, setColumnMappings] = useState({});
  const [previewData, setPreviewData] = useState([]);
  const fileInputRef = useRef(null);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    setSelectedFile(file);
    setImportProgress(0);
    setTotalRows(0);
    setShowPreview(false);
    setCsvHeaders([]);
    setCsvRows([]);
    setColumnMappings({});
    setPreviewData([]);
    
    // Auto-parse and show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csvText = e.target.result;
        const lines = csvText.split(/\r\n|\n/).filter(line => line.trim() !== '');
        
        if (lines.length < 2) {
          toast.error('The CSV file must contain a header row and at least one data row.');
          return;
        }
        
        const headerLine = lines[0];
        const dataLines = lines.slice(1, 11); // Preview first 10 rows
        
        const headers = parseCSVLine(headerLine).map(h => h.trim().replace(/^"(.*)"$/, '$1'));
        const rows = dataLines.map(line => {
          const values = parseCSVLine(line);
          const row = {};
          headers.forEach((header, index) => {
            row[header] = values[index] || '';
          });
          return row;
        });
        
        // Auto-detect column mappings
        const detectedMappings = detectColumnMappings(headers);
        
        setCsvHeaders(headers);
        setCsvRows(rows);
        setColumnMappings(detectedMappings);
        
        // Generate preview data
        const preview = rows.map(row => mapRowToNormalized(row, detectedMappings));
        setPreviewData(preview);
        setShowPreview(true);
        
        toast.success(`File loaded successfully. Detected ${headers.length} columns. Please review the column mapping below.`);
      } catch (error) {
        console.error('Error parsing file:', error);
        toast.error('Failed to parse the CSV file. Please verify the file format and try again.');
      }
    };
    
    reader.readAsText(file);
  };

  const handleMappingChange = (fieldName, csvColumn) => {
    setColumnMappings(prev => ({
      ...prev,
      [fieldName]: csvColumn || null
    }));
    
    // Update preview
    const preview = csvRows.map(row => mapRowToNormalized(row, {
      ...columnMappings,
      [fieldName]: csvColumn || null
    }));
    setPreviewData(preview);
  };

  const handleImport = async () => {
      if (!selectedFile) {
      toast.error('Please select a CSV file to import.');
      return;
    }

    setIsLoading(true);
    setImportProgress(0);
    setTotalRows(0);
    toast.info('Product import process initiated. This may take a moment.');

    const reader = new FileReader();

    reader.onload = async (event) => {
      const csvText = event.target.result;
      const lines = csvText.split(/\r\n|\n/).filter(line => line.trim() !== '');

      if (lines.length < 2) {
        toast.error('The CSV file must contain a header row and at least one data row.');
        setIsLoading(false);
        return;
      }

      const headerLine = lines[0];
      const dataLines = lines.slice(1);
      setTotalRows(dataLines.length);

      const headers = parseCSVLine(headerLine).map(h => h.trim().replace(/^"(.*)"$/, '$1'));
      
      // Use detected mappings or fallback to auto-detection
      const mappings = Object.keys(columnMappings).length > 0 
        ? columnMappings 
        : detectColumnMappings(headers);

      // Validate that we have at least one identifier column
      if (!mappings.fnsku && !mappings.asin && !mappings.lpn) {
        toast.error('Unable to detect FNSKU, ASIN, or LPN columns. Please map at least one identifier column before proceeding.');
        setIsLoading(false);
        return;
      }

      const BATCH_SIZE = 1000;
      const allRows = [];
      let successCount = 0;
      let errorCount = 0;
      let batchNumber = 0;

      // Process all rows
      for (let i = 0; i < dataLines.length; i++) {
        const line = dataLines[i];
        if (!line.trim()) {
          setImportProgress(prev => prev + 1);
          continue;
        }
        
        const rowValues = parseCSVLine(line);
        if (rowValues.length !== headers.length) {
          setImportProgress(prev => prev + 1);
          continue;
        }
        
        const csvRow = {};
        headers.forEach((header, index) => {
          csvRow[header] = rowValues[index] || '';
        });
        
        // Map to normalized format
        const normalized = mapRowToNormalized(csvRow, mappings);
        
        // Validate row has at least one identifier
        if (!normalized.fnsku && !normalized.asin && !normalized.lpn) {
          errorCount++;
          setImportProgress(prev => prev + 1);
          continue;
        }
        
        allRows.push(normalized);
        setImportProgress(prev => prev + 1);
      }

      // Send batches to backend
      const sendBatch = async (batchToSend, batchNum) => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;

          // Convert normalized format to backend format
          const backendItems = batchToSend.map(item => ({
            fnsku: item.fnsku,
            asin: item.asin,
            lpn: item.lpn,
            upc: item.upc,
            product_name: item.name,
            price: item.price,
            category: item.category,
            quantity: item.quantity,
            brand: item.brand
          }));

          const response = await fetch(getApiEndpoint('/import/batch'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': token ? `Bearer ${token}` : ''
            },
            body: JSON.stringify({
              items: backendItems,
              batch: batchNum,
              headers: Object.values(mappings) // Send mapped headers
            })
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
            throw new Error(errorData.message || `HTTP ${response.status}`);
          }

          const result = await response.json();
          successCount += result.success || 0;
          errorCount += result.failed || 0;

          return result;
        } catch (error) {
          console.error(`❌ Batch ${batchNum} failed:`, error);
          errorCount += batchToSend.length;
          return { success: false, failed: batchToSend.length };
        }
      };

      // Process batches
      for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
        batchNumber++;
        const batch = allRows.slice(i, i + BATCH_SIZE);
        await sendBatch(batch, batchNumber);
        
        const processedSoFar = Math.min(i + BATCH_SIZE, allRows.length);
        setImportProgress(processedSoFar);
      }

      setImportProgress(dataLines.length);

      let summaryMessage = `Import completed successfully. ${successCount} items have been imported.`;
      if (errorCount > 0) summaryMessage += ` ${errorCount} items were skipped due to validation errors.`;
      
      if (errorCount > 0) {
        toast.warning(summaryMessage, { autoClose: 10000 });
      } else if (successCount > 0) {
        toast.success(summaryMessage);
      } else {
        toast.warn('No data was imported. Please verify your CSV file format and column mappings.');
      }
      
      setIsLoading(false);
      setSelectedFile(null);
      setShowPreview(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };

    reader.onerror = () => {
      toast.error('Failed to read the selected file. Please ensure the file is not corrupted and try again.');
      setIsLoading(false);
    };

    reader.readAsText(selectedFile);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Import Products from CSV</h1>
      
      <Card className="max-w-4xl mx-auto">
        <div className="p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Upload CSV to Inventory</h2>
          
          <div className="mb-6">
            <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              CSV File
            </label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 dark:border-gray-600 border-dashed rounded-md">
              <div className="space-y-1 text-center">
                <ArrowUpTrayIcon className="mx-auto h-12 w-12 text-gray-400" />
                <div className="flex text-sm text-gray-600 dark:text-gray-400">
                  <label
                    htmlFor="file-upload"
                    className="relative cursor-pointer bg-white dark:bg-gray-800 rounded-md font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 dark:focus-within:ring-offset-gray-800 focus-within:ring-indigo-500"
                  >
                    <span>Upload a file</span>
                    <input id="file-upload" name="file-upload" type="file" className="sr-only" accept=".csv" onChange={handleFileChange} ref={fileInputRef} />
                  </label>
                  <p className="pl-1">or drag and drop</p>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">CSV up to 10MB (Larger files may be slow)</p>
                {selectedFile && (
                  <p className="text-sm text-green-600 dark:text-green-400 mt-2">
                    Selected: {selectedFile.name}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Column Mapping Preview */}
          {showPreview && csvHeaders.length > 0 && (
            <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-start mb-3">
                <InformationCircleIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 mr-2 mt-0.5" />
                <div>
                  <h3 className="text-sm font-medium text-blue-900 dark:text-blue-200">Column Mapping Detected</h3>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                    Review and adjust the column mappings below. The system will automatically clean and normalize your data.
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {Object.keys(COLUMN_MAPPINGS).map(fieldName => (
                  <div key={fieldName} className="flex items-center">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-24 capitalize">
                      {fieldName}:
                    </label>
                    <select
                      value={columnMappings[fieldName] || ''}
                      onChange={(e) => handleMappingChange(fieldName, e.target.value)}
                      className="flex-1 ml-2 px-3 py-1.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="">-- Not Mapped --</option>
                      {csvHeaders.map(header => (
                        <option key={header} value={header}>{header}</option>
                      ))}
                    </select>
                    {columnMappings[fieldName] && (
                      <CheckCircleIcon className="h-5 w-5 text-green-500 ml-2" />
                    )}
                  </div>
                ))}
              </div>
              
              {/* Preview Table */}
              {previewData.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Preview (First {previewData.length} rows):</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs border border-gray-300 dark:border-gray-600">
                      <thead className="bg-gray-100 dark:bg-gray-700">
                        <tr>
                          <th className="px-2 py-1 text-left border">FNSKU</th>
                          <th className="px-2 py-1 text-left border">ASIN</th>
                          <th className="px-2 py-1 text-left border">LPN</th>
                          <th className="px-2 py-1 text-left border">Name</th>
                          <th className="px-2 py-1 text-left border">Price</th>
                          <th className="px-2 py-1 text-left border">Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.map((row, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="px-2 py-1 border">{row.fnsku || '-'}</td>
                            <td className="px-2 py-1 border">{row.asin || '-'}</td>
                            <td className="px-2 py-1 border">{row.lpn || '-'}</td>
                            <td className="px-2 py-1 border">{row.name || '-'}</td>
                            <td className="px-2 py-1 border">{row.price || '-'}</td>
                            <td className="px-2 py-1 border">{row.quantity || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {isLoading && totalRows > 0 && (
            <div className="mb-4">
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Progress</span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {Math.round((importProgress / totalRows) * 100)}% ({importProgress}/{totalRows})
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                <div 
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                  style={{ width: `${(importProgress / totalRows) * 100}%` }}
                ></div>
              </div>
            </div>
          )}

          <div className="mt-6">
            <Button
              onClick={handleImport}
              disabled={isLoading || !selectedFile || (showPreview && !columnMappings.fnsku && !columnMappings.asin && !columnMappings.lpn)}
              className="w-full flex justify-center items-center"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Importing...
                </>
              ) : (
                'Import Products to Inventory'
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default ProductImport;
