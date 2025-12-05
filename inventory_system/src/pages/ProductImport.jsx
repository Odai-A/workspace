import React, { useState, useRef } from 'react';
import { toast } from 'react-toastify';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { supabase } from '../config/supabaseClient';
import { getApiEndpoint } from '../utils/apiConfig';

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

// Accepted column name variations with priority order (higher priority first)
const ACCEPTED_FNSKU_COLUMNS = [
  'fnsku',
  'sku',
  'FNSKU',
  'SKU',
  'Sku',
  'FNSKU #',
  'fn sku',
  'Fn Sku',
  'FnSku',
  'FNSku'
];

const ACCEPTED_ASIN_COLUMNS = [
  'asin',
  'ASIN',
  'B00 ASIN',
  'ASIN #',
  'asin #',
  'Asin',
  'B00 Asin'
];

// Helper to normalize strings for comparison (remove extra spaces, handle special chars)
const normalizeForComparison = (str) => {
  return str.toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')  // Multiple spaces to single space
    .replace(/[#]/g, '')   // Remove # symbols
    .replace(/[-_]/g, '')  // Remove dashes and underscores
    .trim();
};

// Helper to find matching column in headers (case-insensitive, with priority)
const findMatchingColumn = (headers, acceptedColumns) => {
  // First, try exact matches in priority order
  for (const acceptedCol of acceptedColumns) {
    for (const header of headers) {
      if (header === acceptedCol) {
        return header;
      }
    }
  }
  
  // Then try case-insensitive exact matches in priority order
  for (const acceptedCol of acceptedColumns) {
    const lowerAccepted = acceptedCol.toLowerCase().trim();
    for (const header of headers) {
      const lowerHeader = header.toLowerCase().trim();
      if (lowerHeader === lowerAccepted) {
        return header;
      }
    }
  }
  
  // Finally, try normalized matches (handles variations with #, spaces, dashes, etc.)
  for (const acceptedCol of acceptedColumns) {
    const normalizedAccepted = normalizeForComparison(acceptedCol);
    for (const header of headers) {
      const normalizedHeader = normalizeForComparison(header);
      
      // Check if normalized strings match or one contains the other
      if (normalizedHeader === normalizedAccepted) {
        return header;
      }
      
      // For partial matches, check if one is a substring of the other
      // (e.g., "B00 ASIN" matches "ASIN")
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

// Normalize CSV row into the format used for your inventory import
// Now uses column mapping from detected headers
const normalizeItemForSupabase = (csvRowObject, columnMap) => {
  // Helper to convert empty strings to null
  const toNullIfEmpty = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const str = String(value).trim();
    return str === '' ? null : str;
  };

  // Get values using mapped column names
  const internalFnsku = columnMap.fnskuColumn 
    ? toNullIfEmpty(csvRowObject[columnMap.fnskuColumn])
    : null;
  
  const internalAsin = columnMap.asinColumn
    ? toNullIfEmpty(csvRowObject[columnMap.asinColumn])
    : null;

  const normalized = {
    lpn: toNullIfEmpty(csvRowObject['LPN'] || csvRowObject['X-Z ASIN'] || csvRowObject['XZ ASIN'] || csvRowObject['Lpn']),
    fnsku: internalFnsku,
    asin: internalAsin,
    name: csvRowObject['ItemDesc'] || csvRowObject['GLDesc'] || csvRowObject['Description'] || csvRowObject['Name'] || null,
    description: csvRowObject['ItemDesc'] || csvRowObject['GLDesc'] || csvRowObject['Description'] || null,
    price: csvRowObject['Retail'] ? parseFloat(String(csvRowObject['Retail']).replace(/[^0-9.-]+/g, "")) : null,
    category: csvRowObject['Category'] || null,
    upc: toNullIfEmpty(csvRowObject['UPC'] || csvRowObject['Upc']),
    quantity: csvRowObject['Units'] ? parseInt(String(csvRowObject['Units']).replace(/[^0-9.-]+/g, ""), 10) : null,
  };

  // Ensure numeric fields that failed parsing are null
  if (normalized.price !== null && isNaN(normalized.price)) {
    console.warn("Price normalization resulted in NaN for item:", csvRowObject, "Original Retail:", csvRowObject['Retail']);
    normalized.price = null;
  }
  if (normalized.quantity !== null && isNaN(normalized.quantity)) {
    console.warn("Quantity normalization resulted in NaN for item:", csvRowObject, "Original Units:", csvRowObject['Units']);
    normalized.quantity = null;
  }
  
  // Ensure all keys we care about are at least null if not present in csvRowObject
  const essentialKeys = ['lpn', 'fnsku', 'asin', 'name', 'description', 'price', 'category', 'upc', 'quantity'];
  essentialKeys.forEach(key => {
    if (normalized[key] === undefined) {
      normalized[key] = null;
    }
  });

  return normalized;
};

const ProductImport = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const fileInputRef = useRef(null);

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
    setImportProgress(0);
    setTotalRows(0);
  };

  const handleImport = async () => {
    if (!selectedFile) {
      toast.error('Please select a CSV file to import.');
      return;
    }

    setIsLoading(true);
    setImportProgress(0);
    setTotalRows(0);
    toast.info('Starting product import... This may take a moment.');

    const reader = new FileReader();

    reader.onload = async (event) => {
      const csvText = event.target.result;
      const lines = csvText.split(/\r\n|\n/).filter(line => line.trim() !== '');

      if (lines.length < 2) {
        toast.error('CSV file must contain a header row and at least one data row.');
        setIsLoading(false);
        return;
      }

      const headerLine = lines[0];
      const dataLines = lines.slice(1);
      setTotalRows(dataLines.length);

      // Parse headers using CSV parser to handle quoted fields
      const headers = parseCSVLine(headerLine).map(header => header.trim().replace(/^"(.*)"$/, '$1'));
      console.log("Detected CSV Headers:", headers);
      if(headers.length === 0 || (headers.length === 1 && headers[0] === '')) {
        toast.error('Could not parse headers from CSV. Please check file format.');
        setIsLoading(false);
        return;
      }

      // STEP 1: Detect and map FNSKU and ASIN columns BEFORE processing rows
      const fnskuColumn = findMatchingColumn(headers, ACCEPTED_FNSKU_COLUMNS);
      const asinColumn = findMatchingColumn(headers, ACCEPTED_ASIN_COLUMNS);

      const columnMap = {
        fnskuColumn: fnskuColumn,
        asinColumn: asinColumn
      };

      // Log detected columns for debugging
      if (fnskuColumn) {
        console.log(`✅ Detected FNSKU column: "${fnskuColumn}"`);
      } else {
        console.warn('⚠️ No FNSKU column detected. Accepted variations:', ACCEPTED_FNSKU_COLUMNS);
      }

      if (asinColumn) {
        console.log(`✅ Detected ASIN column: "${asinColumn}"`);
      } else {
        console.warn('⚠️ No ASIN column detected. Accepted variations:', ACCEPTED_ASIN_COLUMNS);
      }

      if (!fnskuColumn && !asinColumn) {
        toast.error('CSV file must contain at least one FNSKU or ASIN column. Accepted column names: ' + 
          ACCEPTED_FNSKU_COLUMNS.join(', ') + ' or ' + ACCEPTED_ASIN_COLUMNS.join(', '));
        setIsLoading(false);
        return;
      }

      // STEP 1: Read CSV and split into batches (NO VALIDATION - backend handles it)
      const BATCH_SIZE = 1000;
      const allRows = [];
      const errorDetails = [];

      // Collect all raw CSV rows (no validation, no normalization)
      for (let i = 0; i < dataLines.length; i++) {
        const line = dataLines[i];
        if (!line.trim()) {
          setImportProgress(prev => prev + 1);
          continue;
        }
        
        const rowValues = parseCSVLine(line);
        if (rowValues.length !== headers.length) {
          // Skip malformed rows but don't validate content
          setImportProgress(prev => prev + 1);
          continue;
        }
        
        // Create raw row object with original CSV headers
        const csvRowObject = {};
        headers.forEach((header, index) => {
          csvRowObject[header] = rowValues[index];
        });

        // Store row index for error tracking
        csvRowObject._rowIndex = i + 2;
        allRows.push(csvRowObject);
        setImportProgress(prev => prev + 1);
      }

      // STEP 2: Send raw rows in batches to backend (backend does validation & normalization)
      let successCount = 0;
      let errorCount = 0;
      let batchNumber = 0;

      const sendBatch = async (batchToSend, batchNum) => {
        try {
          // Get auth token for API call
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;

          // Remove internal tracking field before sending
          const cleanBatch = batchToSend.map(item => {
            const { _rowIndex, ...cleanItem } = item;
            return cleanItem;
          });

          const response = await fetch(getApiEndpoint('/import/batch'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': token ? `Bearer ${token}` : ''
            },
            body: JSON.stringify({
              items: cleanBatch,
              batch: batchNum,
              headers: headers  // Send headers so backend knows column names
            })
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
            throw new Error(errorData.message || `HTTP ${response.status}`);
          }

          const result = await response.json();
          console.log(`✅ Batch ${batchNum} uploaded:`, result);

          // Update counts from batch result
          successCount += result.success || 0;
          errorCount += result.failed || 0;

          return result;
        } catch (error) {
          console.error(`❌ Batch ${batchNum} failed:`, error);
          errorCount += batchToSend.length;
          return { success: false, failed: batchToSend.length };
        }
      };

      // Process batches - send raw CSV rows
      for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
        batchNumber++;
        const batch = allRows.slice(i, i + BATCH_SIZE);
        
        await sendBatch(batch, batchNumber);
        
        // Update progress after each batch
        const processedSoFar = Math.min(i + BATCH_SIZE, allRows.length);
        setImportProgress(processedSoFar);
      }

      // Final progress update
      setImportProgress(dataLines.length);

      let summaryMessage = `Import Complete: ${successCount} saved/updated.`;
      if (errorCount > 0) summaryMessage += ` ${errorCount} failed.`;
      
      // Log import summary
      if (fnskuColumn || asinColumn) {
        console.log('📊 Import Summary:', {
          fnskuColumn: fnskuColumn || 'Not found',
          asinColumn: asinColumn || 'Not found',
          totalRows: dataLines.length,
          batches: batchNumber,
          processed: successCount,
          errors: errorCount
        });
      }
      
      if (errorCount > 0) {
        toast.error(summaryMessage + (errorDetails.length > 0 ? " Check console for error details." : ""), { autoClose: 10000 });
        errorDetails.slice(0, 10).forEach(detail => console.warn("Import Error Detail:", detail));
      } else if (successCount > 0){
        toast.success(summaryMessage);
      } else {
        toast.warn(summaryMessage || "No data processed.")
      }
      
      setIsLoading(false);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };

    reader.onerror = () => {
      toast.error('Failed to read the selected file.');
      setIsLoading(false);
    };

    reader.readAsText(selectedFile);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Import Products from CSV</h1>
      
      <Card className="max-w-xl mx-auto">
        <div className="p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Upload CSV to Inventory</h2>
          
          <div className="mb-4">
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
                  className="bg-blue-600 h-2.5 rounded-full" 
                  style={{ width: `${(importProgress / totalRows) * 100}%` }}
                ></div>
              </div>
            </div>
          )}

          <div className="mt-6">
            <Button
              onClick={handleImport}
              disabled={isLoading || !selectedFile}
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