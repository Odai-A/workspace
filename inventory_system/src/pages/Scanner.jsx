import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  QrCodeIcon, 
  XMarkIcon, 
  InformationCircleIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline';
import { toast } from 'react-toastify';

import MainLayout from '../components/layout/MainLayout';
import BarcodeScanner from '../components/scanner/BarcodeScanner';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { useAuth } from '../contexts/AuthContext';

// Mode options for the scanner
const SCANNER_MODES = {
  LOOKUP: 'lookup',
  STOCK_IN: 'stock_in',
  STOCK_OUT: 'stock_out',
};

// Sample product data - in a real app, this would come from the API
const sampleProducts = [
  { id: 1, sku: '123456789012', name: 'Amazon Echo Dot', price: 49.99, category: 'Smart Speakers' },
  { id: 2, sku: '036000291452', name: 'Fire TV Stick', price: 39.99, category: 'Streaming Devices' },
  { id: 3, sku: '042100005264', name: 'Kindle Paperwhite', price: 129.99, category: 'E-readers' },
  { id: 4, sku: '812345678901', name: 'Ring Doorbell', price: 99.99, category: 'Smart Home' },
];

const Scanner = () => {
  const navigate = useNavigate();
  const { apiClient } = useAuth();
  
  const [scannerActive, setScannerActive] = useState(false);
  const [scanMode, setScanMode] = useState(SCANNER_MODES.LOOKUP);
  const [scannedProduct, setScannedProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Sample locations - in a real app, these would be fetched from the API
  const locations = ['Warehouse A', 'Warehouse B', 'Warehouse C', 'Warehouse D'];
  
  // Reset state when scan mode changes
  useEffect(() => {
    setScannedProduct(null);
    setQuantity(1);
    setError(null);
  }, [scanMode]);

  // Handle scanner errors
  const handleScannerError = (err) => {
    console.error('Scanner error:', err);
    setError('Failed to initialize the barcode scanner. Please check camera permissions.');
    setScannerActive(false);
  };

  // Handle barcode detection
  const handleBarcodeDetected = async ({ code, format, confidence }) => {
    // Stop scanner after successful detection
    setScannerActive(false);
    
    setLoading(true);
    try {
      // In a real app, we would fetch product from the API
      // const response = await apiClient.get(`/products/barcode/${code}`);
      // const product = response.data;
      
      // Simulate API call with sample data
      const product = sampleProducts.find(p => p.sku === code);
      
      if (product) {
        setScannedProduct(product);
        toast.success(`Barcode detected: ${code} (${format})`);
      } else {
        // Product not found
        setError(`No product found with barcode ${code}`);
        toast.error(`Product not found: ${code}`);
      }
    } catch (err) {
      console.error('Error fetching product:', err);
      setError('Failed to fetch product details');
      toast.error('Failed to fetch product details');
    } finally {
      setLoading(false);
    }
  };

  // Process the scanned item based on the selected mode
  const handleProcessItem = async () => {
    if (!scannedProduct) return;
    
    setLoading(true);
    try {
      // In a real app, these would be API calls
      switch (scanMode) {
        case SCANNER_MODES.STOCK_IN:
          // await apiClient.post('/inventory/stock-in', {
          //   product_id: scannedProduct.id,
          //   quantity,
          //   location,
          // });
          toast.success(`Added ${quantity} units of ${scannedProduct.name} to ${location}`);
          break;
          
        case SCANNER_MODES.STOCK_OUT:
          // await apiClient.post('/inventory/stock-out', {
          //   product_id: scannedProduct.id,
          //   quantity,
          //   location,
          // });
          toast.success(`Removed ${quantity} units of ${scannedProduct.name} from ${location}`);
          break;
          
        case SCANNER_MODES.LOOKUP:
          // No action needed for lookup, just show the product details
          break;
      }
      
      // Reset for next scan
      setScannedProduct(null);
      setQuantity(1);
    } catch (err) {
      console.error('Error processing item:', err);
      toast.error('Failed to process item');
    } finally {
      setLoading(false);
    }
  };

  // Navigate to product details page
  const handleViewProductDetails = () => {
    if (scannedProduct) {
      navigate(`/products/${scannedProduct.id}`);
    }
  };

  // Reset the scanner
  const handleReset = () => {
    setScannedProduct(null);
    setQuantity(1);
    setError(null);
    setScannerActive(false);
  };

  return (
    <MainLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Barcode Scanner</h1>
        <p className="text-gray-600">
          Scan product barcodes to quickly lookup items or process inventory operations.
        </p>
      </div>
      
      {/* Mode Selection */}
      <div className="mb-6">
        <div className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap gap-4">
          <Button
            variant={scanMode === SCANNER_MODES.LOOKUP ? 'primary' : 'outline'}
            onClick={() => setScanMode(SCANNER_MODES.LOOKUP)}
            className="flex items-center"
          >
            <MagnifyingGlassIcon className="h-5 w-5 mr-2" />
            Lookup Item
          </Button>
          
          <Button
            variant={scanMode === SCANNER_MODES.STOCK_IN ? 'primary' : 'outline'}
            onClick={() => setScanMode(SCANNER_MODES.STOCK_IN)}
            className="flex items-center"
          >
            <ArrowDownIcon className="h-5 w-5 mr-2" />
            Stock In
          </Button>
          
          <Button
            variant={scanMode === SCANNER_MODES.STOCK_OUT ? 'primary' : 'outline'}
            onClick={() => setScanMode(SCANNER_MODES.STOCK_OUT)}
            className="flex items-center"
          >
            <ArrowUpIcon className="h-5 w-5 mr-2" />
            Stock Out
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scanner Section */}
        <Card 
          title="Barcode Scanner"
          subtitle="Position the barcode within the viewfinder"
        >
          {!scannerActive ? (
            <div className="flex flex-col items-center justify-center p-10 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 mb-4">
              <QrCodeIcon className="h-16 w-16 text-gray-400 mb-4" />
              <p className="text-center text-gray-500 mb-4">
                Click the button below to activate the camera and scan a barcode
              </p>
              <Button
                variant="primary"
                size="lg"
                onClick={() => setScannerActive(true)}
                className="flex items-center"
              >
                <QrCodeIcon className="h-5 w-5 mr-2" />
                Start Scanning
              </Button>
            </div>
          ) : (
            <div className="relative">
              <BarcodeScanner
                onDetected={handleBarcodeDetected}
                onError={handleScannerError}
                scannerRunning={scannerActive}
                scannerSettings={{
                  inputStream: {
                    constraints: {
                      width: { min: 400 },
                      height: { min: 300 },
                      facingMode: 'environment',
                      aspectRatio: { min: 1, max: 2 }
                    }
                  },
                  locator: {
                    patchSize: 'medium',
                    halfSample: true
                  },
                  frequency: 15
                }}
                className="h-72 bg-black mb-4"
              />
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2 bg-white bg-opacity-70"
                onClick={() => setScannerActive(false)}
              >
                <XMarkIcon className="h-5 w-5" />
              </Button>
            </div>
          )}
          
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm flex items-start">
              <InformationCircleIcon className="h-5 w-5 text-red-400 mr-2 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          
          <div className="flex flex-col sm:flex-row sm:justify-between gap-3">
            <Button
              variant="secondary"
              onClick={handleReset}
            >
              Reset Scanner
            </Button>
            
            <Button
              variant="primary"
              disabled={!scannedProduct}
              onClick={handleViewProductDetails}
            >
              View Product Details
            </Button>
          </div>
        </Card>
        
        {/* Results Section */}
        <Card title={scanMode === SCANNER_MODES.LOOKUP ? "Product Information" : "Process Item"}>
          {loading ? (
            <div className="flex justify-center items-center h-56">
              <svg className="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          ) : scannedProduct ? (
            <div>
              {/* Product Details */}
              <div className="mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-500">Product Name</p>
                    <p className="text-lg font-medium">{scannedProduct.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">SKU/Barcode</p>
                    <p className="text-lg font-medium">{scannedProduct.sku}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Price</p>
                    <p className="text-lg font-medium">${scannedProduct.price.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Category</p>
                    <p className="text-lg font-medium">{scannedProduct.category}</p>
                  </div>
                </div>
              </div>

              {/* Stock Operations Form (only for stock in/out modes) */}
              {scanMode !== SCANNER_MODES.LOOKUP && (
                <div className="space-y-4 border-t pt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 mb-1">
                        Quantity
                      </label>
                      <input
                        type="number"
                        id="quantity"
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                        value={quantity}
                        onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 0))}
                        min="1"
                      />
                    </div>
                    <div>
                      <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
                        Location
                      </label>
                      <select
                        id="location"
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        required
                      >
                        <option value="">Select a location</option>
                        {locations.map((loc) => (
                          <option key={loc} value={loc}>{loc}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  <Button
                    variant={scanMode === SCANNER_MODES.STOCK_IN ? 'success' : 'danger'}
                    fullWidth
                    size="lg"
                    disabled={!location}
                    onClick={handleProcessItem}
                  >
                    {scanMode === SCANNER_MODES.STOCK_IN ? 'Confirm Stock In' : 'Confirm Stock Out'}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-56 text-center">
              <QrCodeIcon className="h-12 w-12 text-gray-300 mb-3" />
              <p className="text-gray-500">
                {scanMode === SCANNER_MODES.LOOKUP 
                  ? 'Scan a barcode to view product information'
                  : scanMode === SCANNER_MODES.STOCK_IN
                    ? 'Scan a barcode to add items to inventory' 
                    : 'Scan a barcode to remove items from inventory'
                }
              </p>
            </div>
          )}
        </Card>
      </div>
    </MainLayout>
  );
};

export default Scanner;