import React, { useState, useRef, useEffect, useCallback } from 'react';
import Quagga from '@ericblade/quagga2';
import PropTypes from 'prop-types';

const BarcodeReader = ({ 
  onDetected, 
  onError,
  active = false,
  constraints = {},
  className = '',
  showViewFinder = true
}) => {
  const scannerRef = useRef(null);
  const [initialized, setInitialized] = useState(false);

  // Default scanner configuration
  const defaultConfig = {
    inputStream: {
      type: 'LiveStream',
      constraints: {
        width: { ideal: 1280, min: 640 },
        height: { ideal: 720, min: 480 },
        facingMode: 'environment', // Use back camera on mobile
        aspectRatio: { ideal: 16/9, min: 1, max: 2 },
        ...constraints
      },
      area: {
        // Larger scanning area for better mobile detection
        top: '15%',
        right: '15%',
        left: '15%',
        bottom: '15%',
      },
    },
    locator: {
      patchSize: 'medium',
      halfSample: true,
    },
    numOfWorkers: Math.min(navigator.hardwareConcurrency || 2, 4), // Limit workers for mobile
    frequency: 10, // Scan frequency - good balance for mobile
    decoder: {
      readers: [
        'ean_reader',
        'ean_8_reader',
        'upc_reader',
        'upc_e_reader',
        'code_128_reader',
        'code_39_reader',
        'code_93_reader',
        'codabar_reader',
        'i2of5_reader'
      ],
      multiple: false
    },
    locate: true
  };

  const handleProcessed = useCallback((result) => {
    const drawingCtx = Quagga.canvas.ctx.overlay;
    const drawingCanvas = Quagga.canvas.dom.overlay;

    if (!drawingCtx || !drawingCanvas) {
      return;
    }

    drawingCtx.clearRect(
      0, 0, 
      parseInt(drawingCanvas.getAttribute('width')), 
      parseInt(drawingCanvas.getAttribute('height'))
    );

    if (result) {
      // Draw boxes for detected barcodes
      if (result.boxes && showViewFinder) {
        for (let i = 0; i < result.boxes.length; i++) {
          const box = result.boxes[i];
          if (box !== result.box) {
            Quagga.ImageDebug.drawPath(box, { x: 0, y: 1 }, drawingCtx, {
              color: 'rgba(0, 255, 0, 0.5)',
              lineWidth: 2,
            });
          }
        }
      }

      // Highlight successfully detected barcode
      if (result.box && showViewFinder) {
        Quagga.ImageDebug.drawPath(result.box, { x: 0, y: 1 }, drawingCtx, {
          color: 'rgba(0, 0, 255, 0.8)',
          lineWidth: 2,
        });
      }

      // Draw the scanning line on detected barcode
      if (result.codeResult && result.codeResult.code && showViewFinder) {
        Quagga.ImageDebug.drawPath(result.line, { x: 'x', y: 'y' }, drawingCtx, {
          color: 'rgba(255, 0, 0, 0.8)',
          lineWidth: 3,
        });
      }
    }
  }, [showViewFinder]);

  const handleDetected = useCallback((result) => {
    if (result && result.codeResult && result.codeResult.code) {
      const code = result.codeResult.code;
      const format = result.codeResult.format;
      const confidence = Math.round(result.codeResult.confidence * 100);
      
      // Only report results with confidence above threshold
      if (confidence >= 65) {
        if (onDetected) {
          onDetected({
            code,
            format,
            confidence,
          });
        }
      }
    }
  }, [onDetected]);

  useEffect(() => {
    if (!scannerRef.current) {
      return;
    }

    // Start scanner if active is true
    if (active && !initialized) {
      const config = {
        ...defaultConfig,
        inputStream: {
          ...defaultConfig.inputStream,
          target: scannerRef.current
        }
      };

      try {
        Quagga.init(config, (err) => {
          if (err) {
            console.error('Barcode Reader initialization error:', err);
            if (onError) onError(err);
            return;
          }
          
          console.log('Barcode Reader initialized successfully');
          setInitialized(true);
          
          Quagga.start();
          
          // Set up callbacks
          Quagga.onDetected(handleDetected);
          Quagga.onProcessed(handleProcessed);
        });
      } catch (error) {
        console.error('Error initializing Quagga:', error);
        if (onError) onError(error);
      }

      return () => {
        if (initialized) {
          try {
            Quagga.offDetected(handleDetected);
            Quagga.offProcessed(handleProcessed);
            Quagga.stop();
          } catch (error) {
            console.error('Error stopping Quagga:', error);
          }
          setInitialized(false);
        }
      };
    } else if (!active && initialized) {
      // Stop scanner if active is false but scanner is initialized
      try {
        Quagga.offDetected(handleDetected);
        Quagga.offProcessed(handleProcessed);
        Quagga.stop();
      } catch (error) {
        console.error('Error stopping Quagga:', error);
      }
      setInitialized(false);
    }
  }, [active, handleDetected, handleProcessed, initialized, onError]);

  return (
    <div className={`relative w-full ${className}`}>
      {/* Scanner Container */}
      <div 
        ref={scannerRef} 
        className="barcode-reader relative overflow-hidden rounded-xl shadow-2xl bg-black"
        style={{ 
          minHeight: "400px",
          maxHeight: "600px",
          width: "100%"
        }}
      >
        {/* Professional Viewfinder Overlay */}
        {showViewFinder && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            {/* Corner brackets for scanning guide */}
            <div className="relative w-80 h-48 md:w-96 md:h-56">
              {/* Top-left corner */}
              <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-green-400 rounded-tl-lg"></div>
              {/* Top-right corner */}
              <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-green-400 rounded-tr-lg"></div>
              {/* Bottom-left corner */}
              <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-green-400 rounded-bl-lg"></div>
              {/* Bottom-right corner */}
              <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-green-400 rounded-br-lg"></div>
              
              {/* Scanning line animation */}
              <div className="absolute inset-0 overflow-hidden rounded-lg">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-green-400 to-transparent animate-scan-line"></div>
              </div>
              
              {/* Center guide text */}
              <div className="absolute -bottom-12 left-1/2 transform -translate-x-1/2 text-center">
                <div className="bg-black/80 backdrop-blur-sm text-white text-sm font-medium px-4 py-2 rounded-lg shadow-lg">
                  <p className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    </svg>
                    Position barcode within frame
                  </p>
                </div>
              </div>
            </div>
            
            {/* Dimmed overlay outside scanning area */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]">
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-48 md:w-96 md:h-56 bg-transparent"></div>
            </div>
          </div>
        )}
        
        {/* Status indicator */}
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-green-500/90 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-xs font-medium shadow-lg">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
          <span>Scanning...</span>
        </div>
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
              <li>Hold your device steady and ensure good lighting</li>
              <li>Position the barcode within the green frame</li>
              <li>Keep the barcode flat and avoid glare or shadows</li>
              <li>Move closer if the barcode is too small</li>
            </ul>
          </div>
        </div>
      </div>
      
      {/* Add CSS for scanning line animation */}
      <style>{`
        @keyframes scan-line {
          0% {
            transform: translateY(0);
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
          100% {
            transform: translateY(100%);
            opacity: 1;
          }
        }
        .animate-scan-line {
          animation: scan-line 2s ease-in-out infinite;
        }
        
        /* Mobile optimizations */
        @media (max-width: 640px) {
          .barcode-reader {
            min-height: 350px !important;
            max-height: 500px !important;
          }
        }
        
        /* Ensure video fills container */
        .barcode-reader video,
        .barcode-reader canvas {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover;
        }
      `}</style>
    </div>
  );
};

BarcodeReader.propTypes = {
  onDetected: PropTypes.func.isRequired,
  onError: PropTypes.func,
  active: PropTypes.bool,
  constraints: PropTypes.object,
  className: PropTypes.string,
  showViewFinder: PropTypes.bool
};

export default BarcodeReader; 