import React, { useEffect, useRef, useState } from 'react';
import Quagga from '@ericblade/quagga2';

const BarcodeScanner = ({ 
  onDetected, 
  onError, 
  scannerRunning = false, 
  scannerSettings = {}, 
  className = '',
}) => {
  const scannerRef = useRef(null);
  const [initialized, setInitialized] = useState(false);

  // Default scanner configuration
  const defaultScannerConfig = {
    inputStream: {
      type: 'LiveStream',
      constraints: {
        width: { min: 450 },
        height: { min: 300 },
        facingMode: 'environment',
        aspectRatio: { min: 1, max: 2 },
      },
      area: { // Define scan area dimensions
        top: '0%',
        right: '0%',
        left: '0%',
        bottom: '0%',
      },
    },
    locator: {
      patchSize: 'medium',
      halfSample: true,
    },
    numOfWorkers: navigator.hardwareConcurrency || 4,
    frequency: 10,
    decoder: {
      readers: [
        'ean_reader',
        'ean_8_reader',
        'upc_reader',
        'code_128_reader',
        'code_39_reader',
        'code_93_reader'
      ],
    },
    locate: true,
  };

  // Merge default config with provided settings
  const scannerConfig = { ...defaultScannerConfig, ...scannerSettings };

  // Initialize the scanner when component mounts or when scannerRunning changes
  useEffect(() => {
    if (!scannerRef.current) {
      return;
    }

    // Start scanner if scannerRunning is true
    if (scannerRunning && !initialized) {
      Quagga.init(scannerConfig, (err) => {
        if (err) {
          console.error('Error initializing Quagga:', err);
          if (onError) {
            onError(err);
          }
          return;
        }

        setInitialized(true);
        Quagga.start();
      });

      // Set up barcode detection handler
      Quagga.onDetected((result) => {
        if (result && result.codeResult && result.codeResult.code) {
          // Get barcode data
          const code = result.codeResult.code;
          const format = result.codeResult.format;
          const confidence = Math.round(result.codeResult.confidence * 100);
          
          // Only report results with confidence above threshold
          if (confidence >= 70) {
            if (onDetected) {
              onDetected({
                code,
                format,
                confidence,
              });
            }
          }
        }
      });

      // Add optional processing handlers for better accuracy
      Quagga.onProcessed((result) => {
        const drawingCtx = Quagga.canvas.ctx.overlay;
        const drawingCanvas = Quagga.canvas.dom.overlay;

        if (result) {
          // Clear previous drawing
          if (drawingCtx) {
            drawingCtx.clearRect(
              0, 0, 
              parseInt(drawingCanvas.getAttribute('width')), 
              parseInt(drawingCanvas.getAttribute('height'))
            );
          }

          // Draw boxes for detected barcodes
          if (result.boxes) {
            for (let i = 0; i < result.boxes.length; i++) {
              const box = result.boxes[i];
              if (box !== result.box) {
                Quagga.ImageDebug.drawPath(box, { x: 0, y: 1 }, drawingCtx, {
                  color: 'yellow',
                  lineWidth: 2,
                });
              }
            }
          }

          // Highlight successfully detected barcode
          if (result.box) {
            Quagga.ImageDebug.drawPath(result.box, { x: 0, y: 1 }, drawingCtx, {
              color: 'blue',
              lineWidth: 2,
            });
          }

          // Draw the patch that Quagga is using for barcode detection analysis
          if (result.codeResult && result.codeResult.code) {
            Quagga.ImageDebug.drawPath(result.line, { x: 'x', y: 'y' }, drawingCtx, {
              color: 'red',
              lineWidth: 3,
            });
          }
        }
      });

      return () => {
        if (initialized) {
          Quagga.stop();
          setInitialized(false);
        }
      };
    } else if (!scannerRunning && initialized) {
      // Stop scanner if scannerRunning is false but scanner is initialized
      Quagga.stop();
      setInitialized(false);
    }
  }, [scannerRunning, scannerSettings, initialized]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (initialized) {
        Quagga.stop();
      }
    };
  }, [initialized]);

  return (
    <div 
      ref={scannerRef} 
      className={`relative overflow-hidden rounded-lg ${className}`}
    >
      {/* Scanner viewport */}
      <div className="viewport absolute inset-0" />
      
      {/* Scanner overlay with visual guides */}
      <div className="absolute inset-0 border-2 border-dashed border-blue-500 rounded-lg pointer-events-none">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-64 h-64 border-2 border-red-500 rounded-md"></div>
        </div>
      </div>
      
      {/* Instructions overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white p-2 text-center text-sm">
        Position barcode within the red box
      </div>
    </div>
  );
};

export default BarcodeScanner;