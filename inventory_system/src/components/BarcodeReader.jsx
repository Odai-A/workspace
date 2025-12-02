import React, { useState, useRef, useEffect } from 'react';
import { BrowserMultiFormatReader } from '@zxing/library';
import { NotFoundException } from '@zxing/library';
import PropTypes from 'prop-types';

const BarcodeReader = ({ 
  onDetected, 
  onCodeDetected, // Support both prop names for compatibility
  onError,
  active = false,
  constraints = {},
  className = '',
  showViewFinder = true
}) => {
  // Use onCodeDetected if provided, otherwise fall back to onDetected
  const handleDetectedCallback = onCodeDetected || onDetected;
  const fileInputRef = useRef(null);
  const readerRef = useRef(null);
  const [isDecoding, setIsDecoding] = useState(false);
  const [error, setError] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [result, setResult] = useState(null);

  // Initialize ZXing reader
  useEffect(() => {
    if (!readerRef.current) {
      readerRef.current = new BrowserMultiFormatReader();
    }
  }, []);

  // Decode barcode from image file
  const decodeImageFile = async (file) => {
    if (!file) return;

    setIsDecoding(true);
    setError(null);
    setResult(null);

    let imageURL = null;

    try {
      // Create preview
      imageURL = URL.createObjectURL(file);
      setPreviewImage(imageURL);

      // Decode barcode from image
      // Create an image element and decode from it
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = imageURL;
      });

      // Create canvas from image for decoding
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);

      // Decode from canvas
      const decodeResult = await readerRef.current.decodeFromCanvas(canvas);

      if (decodeResult && decodeResult.getText()) {
        const code = decodeResult.getText().trim();
        const format = decodeResult.getBarcodeFormat().toString();

        setResult({
          code,
          format,
          confidence: 100,
        });

        // Call callback with result
        if (handleDetectedCallback) {
          handleDetectedCallback({
            code,
            format,
            confidence: 100,
          });
        }
      } else {
        throw new NotFoundException('No barcode found');
      }
    } catch (err) {
      // NotFoundException is expected when no barcode is found
      if (err instanceof NotFoundException || err.name === 'NotFoundException') {
        setError('No barcode detected. Please try a clearer image.');
      } else {
        setError(err.message || 'Failed to decode barcode. Please try another image.');
      }

      if (onError) {
        onError(err);
      }
    } finally {
      setIsDecoding(false);
    }
  };

  // Handle file selection
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file.');
        return;
      }

      decodeImageFile(file);
    }

    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Reset when active changes
  useEffect(() => {
    if (!active) {
      setPreviewImage(null);
      setResult(null);
      setError(null);
      setIsDecoding(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [active]);

  // Cleanup preview URL
  useEffect(() => {
    return () => {
      if (previewImage) {
        URL.revokeObjectURL(previewImage);
      }
    };
  }, [previewImage]);

  return (
    <div className={`relative w-full ${className}`}>
      {/* Scanner Container */}
      <div 
        className="barcode-reader relative overflow-hidden rounded-xl shadow-2xl bg-gradient-to-br from-gray-900 to-gray-800"
        style={{ 
          minHeight: "500px",
          maxHeight: "800px",
          width: "100%",
          aspectRatio: "16/9"
        }}
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
          id="barcode-file-input"
        />

        {/* Main content area */}
        {!previewImage && !isDecoding && !result && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            {/* Camera icon */}
            <div className="mb-6">
              <svg 
                className="w-24 h-24 text-green-400 mx-auto" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" 
                />
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" 
                />
              </svg>
            </div>

            {/* Title */}
            <h3 className="text-2xl font-bold text-white mb-2">
              Take Photo to Scan
            </h3>
            <p className="text-gray-300 mb-6 text-sm">
              Capture or upload an image with a barcode
            </p>

            {/* Action button */}
            <label
              htmlFor="barcode-file-input"
              className="inline-flex items-center gap-2 px-6 py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg shadow-lg transition-colors cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Take Photo
            </label>

            {/* Viewfinder overlay (optional visual guide) */}
            {showViewFinder && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-80 h-48 md:w-96 md:h-56">
                  {/* Corner brackets */}
                  <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-green-400/50 rounded-tl-lg"></div>
                  <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-green-400/50 rounded-tr-lg"></div>
                  <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-green-400/50 rounded-bl-lg"></div>
                  <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-green-400/50 rounded-br-lg"></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Preview image */}
        {previewImage && (
          <div className="absolute inset-0 flex flex-col">
            <div className="relative flex-1 overflow-hidden">
              <img
                src={previewImage}
                alt="Preview"
                className="w-full h-full object-contain"
              />
              
              {/* Overlay for scanning area indicator */}
              {showViewFinder && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="relative w-80 h-48 md:w-96 md:h-56">
                    <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-green-400 rounded-tl-lg"></div>
                    <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-green-400 rounded-tr-lg"></div>
                    <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-green-400 rounded-bl-lg"></div>
                    <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-green-400 rounded-br-lg"></div>
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons below preview */}
            <div className="bg-gray-900/90 backdrop-blur-sm p-4 flex gap-3">
              <label
                htmlFor="barcode-file-input"
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Retake
              </label>
            </div>
          </div>
        )}

        {/* Loading state */}
        {isDecoding && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-30">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-green-400 mb-4"></div>
            <p className="text-white text-lg font-medium">Decoding barcode...</p>
            <p className="text-gray-300 text-sm mt-2">Please wait</p>
          </div>
        )}

        {/* Success result */}
        {result && !isDecoding && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-green-500/90 backdrop-blur-sm z-30">
            <div className="bg-white rounded-lg p-6 max-w-sm mx-4 text-center shadow-2xl">
              <div className="mb-4">
                <svg className="w-16 h-16 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Barcode Found!</h3>
              <p className="text-2xl font-mono font-bold text-green-600 mb-1 break-all">{result.code}</p>
              <p className="text-sm text-gray-600 mb-4">Format: {result.format}</p>
              <label
                htmlFor="barcode-file-input"
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded-lg transition-colors cursor-pointer"
              >
                Scan Another
              </label>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && !isDecoding && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-500/90 backdrop-blur-sm z-30">
            <div className="bg-white rounded-lg p-6 max-w-sm mx-4 text-center shadow-2xl">
              <div className="mb-4">
                <svg className="w-16 h-16 text-red-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Scan Failed</h3>
              <p className="text-gray-700 mb-4">{error}</p>
              <label
                htmlFor="barcode-file-input"
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors cursor-pointer"
              >
                Try Again
              </label>
            </div>
          </div>
        )}
      </div>
      
      {/* Instructions */}
      <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1 text-sm text-blue-800 dark:text-blue-300">
            <p className="font-medium mb-1">Scanning Tips:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Tap "Take Photo" to open your camera</li>
              <li>Ensure good lighting and hold steady</li>
              <li>Position the barcode clearly in the frame</li>
              <li>Keep the barcode flat and avoid glare</li>
              <li>Works perfectly on iPhone Safari and all devices</li>
              <li>No blur, no mirroring, crystal clear scanning</li>
            </ul>
          </div>
        </div>
      </div>
      
      {/* CSS for animations */}
      <style>{`
        .barcode-reader {
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
        
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        
        /* Mobile optimizations */
        @media (max-width: 640px) {
          .barcode-reader {
            min-height: 450px !important;
            max-height: 600px !important;
          }
        }
      `}</style>
    </div>
  );
};

BarcodeReader.propTypes = {
  onDetected: PropTypes.func,
  onCodeDetected: PropTypes.func,
  onError: PropTypes.func,
  active: PropTypes.bool,
  constraints: PropTypes.object,
  className: PropTypes.string,
  showViewFinder: PropTypes.bool
};

export default BarcodeReader;
