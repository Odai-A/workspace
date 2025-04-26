import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  QrCodeIcon, 
  XMarkIcon, 
  InformationCircleIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import { toast } from 'react-toastify';
import { Dialog } from '@headlessui/react';
import { FiHash, FiCamera, FiBox, FiTag, FiInfo } from 'react-icons/fi';
import BarcodeReader from '../components/BarcodeReader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { productLookupService } from '../services/databaseService';
import { fetchProductByFnsku } from '../services/api';

const Scanner = () => {
  const [scanning, setScanning] = useState(false);
  const [scannedCode, setScannedCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [productInfo, setProductInfo] = useState(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode');
  const returnUrl = searchParams.get('return');
  
  const handleBarcodeDetected = ({ code }) => {
    setScannedCode(code);
    setScanning(false);
    toast.success(`Code detected: ${code}`);
    lookupProduct(code);
  };

  const handleScannerError = (err) => {
    console.error('Scanner error:', err);
    toast.error('Scanner error: ' + (err.message || 'Unknown error'));
    setScanning(false);
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualInput.trim()) {
      toast.warning('Please enter a valid FNSKU code');
      return;
    }
    setScannedCode(manualInput);
    lookupProduct(manualInput);
  };

  const lookupProduct = async (code) => {
    if (!code) return;
    
    setLoading(true);
    setProductInfo(null); // Reset product info at the start of a new lookup
    try {
      // First check if we have this product cached in our database
      try {
        // Use the original service function name
        const cachedProduct = await productLookupService.getProductByFnsku(code); 
        
        if (cachedProduct) {
          console.log('Found product in database:', cachedProduct);
          setProductInfo(cachedProduct); // Restore setting state on cache hit
          toast.info('Product found in local database');
          setLoading(false);
          return; // Restore early return on cache hit
        }
      } catch (dbError) {
        // Log the specific error for cache check failure
        console.error('Error checking local database cache:', dbError);
        // Continue to API lookup if database check fails
      }
      
      console.log(`Code ${code} not in cache, proceeding to API lookup.`); // Restore log
      
      // Determine if this is likely an FNSKU code
      const isFnsku = code.startsWith('X') && code.length >= 10;
      
      if (!isFnsku) {
        toast.warning('The scanned code does not appear to be an FNSKU. Try a different code.');
        setLoading(false);
        return;
      }
      
      // Call our API service function - restore useMock: false
      // fetchProductByFnsku handles saving internally now.
      const productDetails = await fetchProductByFnsku(code, { useMock: false }); 
      console.log('API returned product details:', productDetails);
      
      // Restore the simpler check and state setting
      if (productDetails) { 
        setProductInfo(productDetails); 
        toast.success('Product details retrieved successfully');
        // No need for the manual save block here anymore
      } else {
        // Handle API error response - original mock logic remains
        toast.error('Could not find product information.'); // Simplified error
        
        // Create a mock product for demo purposes (or handle error differently)
        const mockProduct = {
          fnsku: code,
          asin: `B0${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
          name: `Amazon Product (FNSKU: ${code})`,
          description: 'This is a mock product generated for demonstration purposes.',
          price: parseFloat((Math.random() * 100 + 10).toFixed(2)),
          category: 'Mock Category',
          image_url: 'https://via.placeholder.com/300',
          condition: 'New',
          lookup_timestamp: new Date().toISOString(),
          source: 'Mock Data'
        };
        
        setProductInfo(mockProduct);
        toast.info('Using mock data for demonstration');
      }
    } catch (error) {
      // This is our final fallback for any unexpected errors
      console.error('Unexpected error looking up product:', error);
      toast.error('An unexpected error occurred: ' + (error.message || 'Unknown error'));
      
      // Provide mock data as a last resort
      const fallbackProduct = {
        fnsku: code,
        asin: 'B0UNKNOWN',
        name: `Scanned Product (FNSKU: ${code})`,
        description: 'Product information could not be retrieved due to an error.',
        price: 0,
        category: 'Unknown',
        image_url: 'https://via.placeholder.com/300?text=Error',
        condition: 'Unknown',
        lookup_timestamp: new Date().toISOString(),
        source: 'Error Fallback'
      };
      
      setProductInfo(fallbackProduct);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setScannedCode('');
    setManualInput('');
    setProductInfo(null);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">FNSKU Scanner</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4">Scan FNSKU Barcode</h2>
          
          <div className="mb-4">
            <button
              onClick={() => setScanning(!scanning)}
              className={`w-full flex items-center justify-center px-4 py-2 rounded-lg ${
                scanning ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
              }`}
            >
              {scanning ? (
                <>
                  <XMarkIcon className="w-5 h-5 mr-2" />
                  Stop Scanning
                </>
              ) : (
                <>
                  <FiCamera className="w-5 h-5 mr-2" />
                  Start Scanner
                </>
              )}
            </button>
          </div>
          
          {scanning && (
            <div className="mb-4 border rounded-lg p-2 bg-gray-100 dark:bg-gray-800">
              <BarcodeReader
                active={scanning}
                onDetected={handleBarcodeDetected}
                onError={handleScannerError}
                className="w-full h-64"
              />
            </div>
          )}
          
          <div className="mt-4">
            <p className="text-sm text-gray-600 mb-2">Or enter FNSKU manually:</p>
            <form onSubmit={handleManualSubmit} className="flex">
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="Enter FNSKU (e.g., X000ABC123)"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-l-md focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                type="submit"
                className="bg-blue-600 text-white px-4 py-2 rounded-r-md hover:bg-blue-700"
              >
                <MagnifyingGlassIcon className="h-5 w-5" />
              </button>
            </form>
          </div>
        </Card>
        
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4">Scan Results</h2>
          
          {loading ? (
            <div className="flex justify-center items-center h-40">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : scannedCode ? (
            <div>
              <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-900 mb-4">
                <h3 className="text-md font-semibold mb-2">Scanned Code:</h3>
                <div className="flex items-center">
                  <FiHash className="w-5 h-5 mr-2" />
                  <span className="text-lg font-mono">{scannedCode}</span>
                </div>
              </div>
              
              {productInfo && (
                <div className="p-4 border rounded-lg bg-blue-50 dark:bg-blue-900">
                  <h3 className="text-md font-semibold mb-2">Product Information:</h3>
                  <div className="space-y-2">
                    <div className="flex items-start">
                      <FiBox className="w-5 h-5 mr-2 mt-1" />
                      <div>
                        <span className="font-semibold">Name:</span> {productInfo.name}
                      </div>
                    </div>
                    <div className="flex items-center">
                      <FiTag className="w-5 h-5 mr-2" />
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold">ASIN:</span>
                        <span>{productInfo.asin || 'N/A'}</span>
                        {productInfo.asin && (
                          <button
                            onClick={() => window.open(`https://www.amazon.com/dp/${productInfo.asin}`, '_blank')}
                            className="ml-2 inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-yellow-500 hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-400"
                            title="View this ASIN on Amazon Product Page"
                          >
                            <MagnifyingGlassIcon className="h-3 w-3 mr-1" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-start">
                      <FiInfo className="w-5 h-5 mr-2 mt-1" />
                      <div>
                        <span className="font-semibold">Description:</span> {productInfo.description || 'No description available'}
                      </div>
                    </div>
                    <div className="flex items-start">
                      <span className="font-semibold">Price:</span> ${productInfo.price ? productInfo.price.toFixed(2) : '0.00'}
                    </div>
                    <div className="flex items-start">
                      <span className="font-semibold">Category:</span> {productInfo.category || 'Uncategorized'}
                    </div>
                  </div>
                </div>
              )}
              
              <div className="flex justify-end mt-4">
                <Button
                  variant="outline"
                  onClick={handleReset}
                  className="flex items-center"
                >
                  <ArrowPathIcon className="h-5 w-5 mr-2" />
                  Reset
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-gray-500">
              <QrCodeIcon className="h-10 w-10 mb-2" />
              <p>No barcode scanned yet</p>
              <p className="text-sm">Scan or enter an FNSKU code to see results</p>
            </div>
          )}
        </Card>
      </div>
      
      <div className="flex justify-center">
        <button 
          onClick={() => navigate(returnUrl || -1)}
          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg"
        >
          Back
        </button>
      </div>
    </div>
  );
};

export default Scanner;