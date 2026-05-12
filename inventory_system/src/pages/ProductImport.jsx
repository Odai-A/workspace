import React, { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { ArrowUpTrayIcon, CheckCircleIcon, XCircleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { supabase } from '../config/supabaseClient';
import { getApiEndpoint } from '../utils/apiConfig';
import {
  findManifestHeaderRowIndex as findManifestHeaderRowIndexHeuristic,
  buildAdaptiveColumnMappings,
} from '../utils/manifestImportHeuristics';

// Comprehensive column mapping - maps common variations to standard field names
const COLUMN_MAPPINGS = {
  fnsku: [
    'fnsku', 'fn sku', 'fn-sku', 'fnsku #', 'fnsku#', 'fnsku number',
    'fulfillment sku', 'fulfillment-sku', 'fba fn sku', 'fn_sku',
    'sku', 'skus', 'sku #', 'sku#', 'sku number', 'sku id', 'sku id #',
    'fba sku', 'fba-sku', 'amazon sku', 'amazon-sku',
    'product sku', 'product-sku', 'item sku', 'item-sku',
    'merchant sku', 'merchant-sku', 'seller sku', 'seller-sku'
  ],
  asin: [
    'asin', 'asins', 'asin #', 'asin#', 'asin number',
    'b00 asin', 'b00-asin', 'b00asin',
    'amazon id', 'amazon-id', 'amazon product', 'child asin', 'child-asin',
    'parent asin', 'parent-asin', 'asin1', 'asin 1', 'prod asin', 'prod-asin'
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
    'category', 'categories', 'Category', 'CATEGORY',
    'product category', 'product-category',
    'item category', 'item-category', 'itemcategory',
    'type', 'types', 'product type', 'product-type',
    'department', 'departments', 'dept', 'depts',
    'classification', 'classifications', 'class', 'classes',
    'merch category', 'gl category', 'commodity category',
  ],
  subcategory: [
    'sub-category', 'sub category', 'subcategory', 'subcategories',
    'sub cat', 'sub-cat', 'product subcategory', 'product-subcategory',
    'item subcategory', 'gl subcategory', 'gl-subcategory'
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

// Detect CSV delimiter by analyzing the first line
const detectDelimiter = (firstLine) => {
  const delimiters = [',', '\t', ';', '|'];
  let maxCount = 0;
  let detectedDelimiter = ',';
  
  for (const delimiter of delimiters) {
    let count = 0;
    let inQuote = false;
    for (let i = 0; i < firstLine.length; i++) {
      const char = firstLine[i];
      if (char === '"' && !(i > 0 && firstLine[i-1] === '\\')) {
        inQuote = !inQuote;
      } else if (char === delimiter && !inQuote) {
        count++;
      }
    }
    if (count > maxCount) {
      maxCount = count;
      detectedDelimiter = delimiter;
    }
  }
  
  return detectedDelimiter;
};

// Helper function to parse a single CSV line, handling quoted fields and different delimiters
const parseCSVLine = (line, delimiter = ',') => {
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
    } else if (char === delimiter && !inQuote) {
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

/** 0-based index of header row in raw \n-split lines (may include blank lines). */
const resolveHeaderRowIndex0 = (rawLines, headerRowMode) => {
  if (headerRowMode && headerRowMode !== 'auto') {
    const n = parseInt(String(headerRowMode), 10);
    if (!Number.isNaN(n) && n >= 1) {
      return Math.min(rawLines.length - 1, Math.max(0, n - 1));
    }
  }
  return findManifestHeaderRowIndexHeuristic(rawLines, COLUMN_MAPPINGS);
};

// Canonical keys for truckload metadata stored in manifest_data.manifest_extras (JSONB)
const TRUCKLOAD_MANIFEST_EXTRA_LABELS = [
  'Seller',
  'Task ID',
  'Listing ID',
  'Sub-Category',
  'Pallet ID',
  'Package ID',
  'Warehouse',
  'Transaction ID',
  'EXT MSRP',
  'Quantity',
];

const collectTruckloadManifestExtras = (csvRow) => {
  if (!csvRow || typeof csvRow !== 'object') return null;
  const out = {};
  const keys = Object.keys(csvRow);
  for (const label of TRUCKLOAD_MANIFEST_EXTRA_LABELS) {
    const hit = keys.find((k) => normalizeForComparison(k) === normalizeForComparison(label));
    if (!hit) continue;
    const v = String(csvRow[hit] ?? '').trim();
    if (v) out[label] = v;
  }
  return Object.keys(out).length ? out : null;
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
    
    case 'upc': {
      // Excel often saves long UPCs as scientific notation (e.g. 7.24129E+11); do not strip E/+ or digits break.
      let u = String(value).trim().replace(/^["']|["']$/g, '');
      if (u === '' || u.toLowerCase() === 'n/a' || u.toLowerCase() === 'na') return null;
      const numish = u.replace(/,/g, '');
      if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(numish)) {
        if (/[eE]/.test(numish) || numish.includes('.')) {
          const n = parseFloat(numish);
          if (Number.isFinite(n)) {
            const r = Math.round(n);
            if (Math.abs(n - r) < 1e-9 || /[eE]/.test(numish) || Math.abs(n) >= 1e6) {
              return String(r);
            }
          }
        } else if (/^\d+$/.test(numish)) {
          return numish;
        }
      }
      cleaned = u.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9]/g, '');
      return cleaned === '' ? null : cleaned;
    }
    case 'identifier':
    case 'fnsku':
    case 'asin':
    case 'lpn':
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
    upc: 'upc',
    name: 'text',
    price: 'price',
    category: 'text',
    subcategory: 'text',
    quantity: 'quantity',
    brand: 'text'
  };
  
  const normalized = {};
  
  for (const fieldName of Object.keys(COLUMN_MAPPINGS)) {
    const value = getValue(fieldName);
    const fieldType = fieldTypes[fieldName] || 'text';
    normalized[fieldName] = cleanValue(value, fieldType);
  }

  const sub = normalized.subcategory;
  if (sub) {
    if (normalized.category) {
      normalized.category = `${normalized.category} — ${sub}`;
    } else {
      normalized.category = sub;
    }
  }
  delete normalized.subcategory;

  return normalized;
};

const ProductImport = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [importStatusHint, setImportStatusHint] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvRows, setCsvRows] = useState([]);
  const [columnMappings, setColumnMappings] = useState({});
  const [previewData, setPreviewData] = useState([]);
  const [includeInInventory, setIncludeInInventory] = useState(false);
  const [enrichmentMode, setEnrichmentMode] = useState('none');
  const [maxEnrichmentCalls, setMaxEnrichmentCalls] = useState(0);
  const [headerRowMode, setHeaderRowMode] = useState('auto');
  const [resolvedHeaderRow1Based, setResolvedHeaderRow1Based] = useState(null);
  const fileInputRef = useRef(null);
  const lastCsvTextRef = useRef('');

  const applyCsvText = useCallback(
    (csvText, mode) => {
      const rawLines = csvText.split(/\r\n|\n/);
      const headerIdx0 = resolveHeaderRowIndex0(rawLines, mode);

      if (rawLines.length < headerIdx0 + 2) {
        toast.error('The CSV file must contain a header row and at least one data row.');
        return false;
      }

      const headerLine = rawLines[headerIdx0];
      const delimiter = detectDelimiter(headerLine);
      const headers = parseCSVLine(headerLine, delimiter).map((h) =>
        h.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
      );
      const validHeaders = headers.filter((h) => h && h.trim() !== '');

      if (validHeaders.length === 0) {
        toast.error('No valid columns detected in the CSV file. Please check the file format.');
        return false;
      }

      const sampleLines = [];
      for (let i = headerIdx0 + 1; i < rawLines.length && sampleLines.length < 24; i++) {
        if (!rawLines[i].trim()) continue;
        sampleLines.push(rawLines[i]);
      }

      const sampleRows = sampleLines.map((line) => {
        const values = parseCSVLine(line, delimiter);
        const row = {};
        validHeaders.forEach((header, index) => {
          row[header] = (values[index] || '').trim();
        });
        return row;
      });

      const previewRows = sampleRows.slice(0, 10);
      const adaptiveMappings = buildAdaptiveColumnMappings(validHeaders, sampleRows, COLUMN_MAPPINGS);

      setCsvHeaders(validHeaders);
      setCsvRows(previewRows);
      setColumnMappings(adaptiveMappings);
      setPreviewData(previewRows.map((row) => mapRowToNormalized(row, adaptiveMappings)));
      setResolvedHeaderRow1Based(headerIdx0 + 1);
      return { ok: true, columnCount: validHeaders.length, header1Based: headerIdx0 + 1 };
    },
    []
  );

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
    setHeaderRowMode('auto');
    setResolvedHeaderRow1Based(null);

    // Auto-parse and show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let csvText = e.target.result;

        // Remove BOM if present (common in Excel exports)
        if (csvText.charCodeAt(0) === 0xFEFF) {
          csvText = csvText.slice(1);
        }

        lastCsvTextRef.current = csvText;
        const applied = applyCsvText(csvText, 'auto');
        if (!applied?.ok) {
          return;
        }

        setShowPreview(true);
        toast.success(
          `Loaded ${applied.columnCount} columns; header row ${applied.header1Based} (auto-detected). Adjust the header row or mappings if anything looks wrong.`
        );
      } catch (error) {
        console.error('Error parsing file:', error);
        toast.error(`Failed to parse the CSV file: ${error.message || 'Please verify the file format and try again.'}`);
      }
    };
    
    reader.readAsText(file);
  };

  const handleMappingChange = (fieldName, csvColumn) => {
    setColumnMappings((prev) => {
      const next = { ...prev, [fieldName]: csvColumn || null };
      setPreviewData(csvRows.map((row) => mapRowToNormalized(row, next)));
      return next;
    });
  };

  const handleHeaderRowModeChange = (value) => {
    setHeaderRowMode(value);
    const text = lastCsvTextRef.current;
    if (!text) return;
    const applied = applyCsvText(text, value);
    if (applied?.ok) {
      setShowPreview(true);
      toast.info(
        value === 'auto'
          ? `Using header row ${applied.header1Based} (auto).`
          : `Using header row ${applied.header1Based} (manual).`
      );
    }
  };

  const handleImport = async () => {
      if (!selectedFile) {
      toast.error('Please select a CSV file to import.');
      return;
    }

    setIsLoading(true);
    setImportProgress(0);
    setTotalRows(0);
    setImportStatusHint('');
    toast.info('Product import process initiated. This may take a moment.');

    const reader = new FileReader();

    reader.onload = async (event) => {
      let csvText = event.target.result;
      
      // Remove BOM if present (common in Excel exports)
      if (csvText.charCodeAt(0) === 0xFEFF) {
        csvText = csvText.slice(1);
      }
      
      const lines = csvText.split(/\r\n|\n/);

      const headerIdx0 = resolveHeaderRowIndex0(lines, headerRowMode);
      if (lines.length < headerIdx0 + 2) {
        toast.error('The CSV file must contain a header row and at least one data row.');
        setImportStatusHint('');
        setIsLoading(false);
        return;
      }

      const headerLine = lines[headerIdx0];
      const dataLines = [];
      for (let i = headerIdx0 + 1; i < lines.length; i++) {
        dataLines.push(lines[i]);
      }
      // Denominator = every data line we scan (including blanks) so % never hits 100% before parse finishes
      setTotalRows(dataLines.length);

      // Detect delimiter from the header line
      const delimiter = detectDelimiter(headerLine);
      const headers = parseCSVLine(headerLine, delimiter).map(h => h.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1'));
      
      // Filter out empty headers
      const validHeaders = headers.filter(h => h && h.trim() !== '');
      
      // Prefer mappings from preview; if missing identifiers, re-run adaptive inference on file samples
      let mappings = columnMappings;
      if (!mappings.fnsku && !mappings.asin && !mappings.lpn) {
        const sampleRows = [];
        for (let i = 0; i < dataLines.length && sampleRows.length < 24; i++) {
          const ln = dataLines[i];
          if (!ln.trim()) continue;
          const rowValues = parseCSVLine(ln, delimiter);
          while (rowValues.length < validHeaders.length) rowValues.push('');
          const row = {};
          validHeaders.forEach((header, index) => {
            row[header] = (rowValues[index] || '').trim();
          });
          sampleRows.push(row);
        }
        mappings = buildAdaptiveColumnMappings(validHeaders, sampleRows, COLUMN_MAPPINGS);
      }

      // Validate that we have at least one identifier column
      if (!mappings.fnsku && !mappings.asin && !mappings.lpn) {
        toast.error('Unable to detect FNSKU, ASIN, or LPN columns. Please map at least one identifier column before proceeding.');
        setImportStatusHint('');
        setIsLoading(false);
        return;
      }

      const BATCH_SIZE = 1000;
      const allRows = [];
      let successCount = 0;
      let errorCount = 0;
      let batchNumber = 0;
      let totalCacheHits = 0;
      let totalEnrichmentsCharged = 0;
      let totalEnrichmentsDeferred = 0;
      let totalInventoryUpserted = 0;

      const importSessionId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

      // Process all rows
      for (let i = 0; i < dataLines.length; i++) {
        const line = dataLines[i];
        if (!line.trim()) {
          setImportProgress((prev) => prev + 1);
          continue;
        }
        
        const rowValues = parseCSVLine(line, delimiter);
        if (rowValues.length < validHeaders.length) {
          // Pad with empty values if row has fewer columns
          while (rowValues.length < validHeaders.length) {
            rowValues.push('');
          }
        }
        
        const csvRow = {};
        validHeaders.forEach((header, index) => {
          csvRow[header] = (rowValues[index] || '').trim();
        });
        
        // Map to normalized format + preserve truckload-only columns for manifest_extras
        const normalized = mapRowToNormalized(csvRow, mappings);
        const withExtras = {
          ...normalized,
          manifest_extras: collectTruckloadManifestExtras(csvRow),
        };

        // Validate row has at least one identifier
        if (!withExtras.fnsku && !withExtras.asin && !withExtras.lpn) {
          errorCount++;
          setImportProgress((prev) => prev + 1);
          continue;
        }

        allRows.push(withExtras);
        setImportProgress((prev) => prev + 1);
      }

      const numBatches = allRows.length ? Math.ceil(allRows.length / BATCH_SIZE) : 0;
      setTotalRows(dataLines.length + Math.max(numBatches, 1));
      setImportProgress(dataLines.length);
      setImportStatusHint(
        numBatches > 0
          ? `Saving ${allRows.length} row(s) in ${numBatches} server batch(es).${
              enrichmentMode !== 'none'
                ? ' Rainforest enrichment can add several seconds per batch.'
                : ' No external product APIs will be called.'
            }`
          : 'No valid rows to upload.'
      );

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
            brand: item.brand,
            manifest_extras: item.manifest_extras || null,
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
              headers: Object.values(mappings),
              include_in_inventory: includeInInventory,
              enrichment_mode: enrichmentMode,
              max_enrichment_calls: maxEnrichmentCalls,
              import_session_id: importSessionId,
              file_name: selectedFile?.name || null
            })
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
            throw new Error(errorData.message || `HTTP ${response.status}`);
          }

          const result = await response.json();
          successCount += result.success || 0;
          errorCount += result.failed || 0;
          totalCacheHits += result.cache_hits || 0;
          totalEnrichmentsCharged += result.enrichments_charged || 0;
          totalEnrichmentsDeferred += result.enrichments_deferred || 0;
          totalInventoryUpserted += result.inventory_upserted || 0;

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
        setImportStatusHint(
          `Saving batch ${batchNumber} of ${numBatches} (${batch.length} rows)…`
        );
        await sendBatch(batch, batchNumber);

        setImportProgress(dataLines.length + batchNumber);
      }

      setImportProgress(dataLines.length + Math.max(numBatches, 1));
      setImportStatusHint('');

      let summaryMessage = `Import completed. ${successCount} catalog/manifest rows processed.`;
      if (includeInInventory) {
        summaryMessage += ` Inventory: ${totalInventoryUpserted} SKU(s) updated or added.`;
      }
      summaryMessage += ` Cache hits: ${totalCacheHits}.`;
      if (enrichmentMode !== 'none') {
        summaryMessage += ` Paid enrichments (this import): ${totalEnrichmentsCharged}.`;
        if (totalEnrichmentsDeferred > 0) {
          summaryMessage += ` Deferred/skipped (cap or lock): ${totalEnrichmentsDeferred}.`;
        }
      }
      if (errorCount > 0) summaryMessage += ` ${errorCount} rows skipped (validation).`;
      
      if (errorCount > 0) {
        toast.warning(summaryMessage, { autoClose: 10000 });
      } else if (successCount > 0) {
        toast.success(summaryMessage);
      } else {
        toast.warn('No data was imported. Please verify your CSV file format and column mappings.');
      }
      
      setIsLoading(false);
      setImportStatusHint('');
      setSelectedFile(null);
      setShowPreview(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };

    reader.onerror = () => {
      toast.error('Failed to read the selected file. Please ensure it is not corrupted and try again.');
      setImportStatusHint('');
      setIsLoading(false);
    };

    reader.readAsText(selectedFile);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Import Products from CSV</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 -mt-4 mb-6">
        After import, open{' '}
        <Link to="/manifests" className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
          Manifests
        </Link>{' '}
        to search that upload, print labels, or scan-lookup within the file.
      </p>
      
      <Card className="max-w-4xl mx-auto">
        <div className="p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Upload manifest (CSV)</h2>

          <div className="mb-6 p-4 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30">
            <p className="text-sm text-amber-900 dark:text-amber-200 font-medium">Manifest import (default: no paid APIs)</p>
            <p className="text-xs text-amber-800 dark:text-amber-300/90 mt-1">
              By default, imports only write your CSV to the database and use the existing global cache if present.
              If you turn on Rainforest enrichment below, lookups are billed per request and can slow large imports.
            </p>
            <div className="mt-4 space-y-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeInInventory}
                  onChange={(e) => setIncludeInInventory(e.target.checked)}
                  className="mt-1 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-800 dark:text-gray-200">
                  <strong>Add products to my business inventory</strong> (quantities from your CSV merge with existing SKUs). Leave off to only save catalog + manifest in the database.
                </span>
              </label>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Enrichment (Rainforest) — optional
                </label>
                <select
                  value={enrichmentMode}
                  onChange={(e) => setEnrichmentMode(e.target.value)}
                  className="w-full md:w-auto px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md text-sm"
                >
                  <option value="none">Off — do not call Rainforest or other enrichment APIs on import (default)</option>
                  <option value="missing_only">On — fetch missing product data from Rainforest (paid; slower)</option>
                  <option value="full">On — re-fetch all ASINs (highest cost)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Max paid enrichments this import (per chunk cap)
                </label>
                <input
                  type="number"
                  min={0}
                  max={5000}
                  value={maxEnrichmentCalls}
                  onChange={(e) => setMaxEnrichmentCalls(Math.max(0, Math.min(5000, parseInt(e.target.value, 10) || 0)))}
                  className="w-full max-w-xs px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md text-sm"
                />
              </div>
            </div>
          </div>
          
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

          {showPreview && lastCsvTextRef.current && (
            <div className="mb-6 p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">Messy or non-standard files</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                We scan the first lines for a plausible header (keywords like SKU, ASIN, Qty), use fuzzy header names,
                and infer ASIN / FNSKU / LPN from sample cell patterns when headers are vague. Pick the exact header line
                if auto-detect is wrong (same line number as in Excel or a text editor).
              </p>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Header row</label>
              <select
                value={headerRowMode}
                onChange={(e) => handleHeaderRowModeChange(e.target.value)}
                className="w-full max-w-md px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md text-sm"
              >
                <option value="auto">
                  Auto-detect
                  {resolvedHeaderRow1Based != null ? ` (currently row ${resolvedHeaderRow1Based})` : ''}
                </option>
                {Array.from({ length: 80 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={String(n)}>
                    Row {n} (manual)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Column Mapping Preview */}
          {showPreview && csvHeaders.length > 0 && (
            <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-start mb-3">
                <InformationCircleIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 mr-2 mt-0.5" />
                <div>
                  <h3 className="text-sm font-medium text-blue-900 dark:text-blue-200">Column Mapping Detected</h3>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                    Headers are matched with fuzzy text similarity and a large synonym list; ASIN / FNSKU / LPN can also
                    be inferred from the first rows of data when column titles are wrong or missing. Adjust any field
                    below if a column was mis-assigned.
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
                  {Math.min(100, Math.round((importProgress / totalRows) * 100))}% ({importProgress}/{totalRows})
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                <div 
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                  style={{ width: `${Math.min(100, (importProgress / totalRows) * 100)}%` }}
                ></div>
              </div>
              {importStatusHint && (
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">{importStatusHint}</p>
              )}
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
                includeInInventory ? 'Import & add to inventory' : 'Import manifest (catalog only)'
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default ProductImport;
