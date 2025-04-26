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
        width: { min: 640 },
        height: { min: 480 },
        facingMode: 'environment',
        aspectRatio: { min: 1, max: 2 },
        ...constraints
      },
      area: {
        top: '10%',
        right: '10%',
        left: '10%',
        bottom: '10%',
      },
    },
    locator: {
      patchSize: 'medium',
      halfSample: true,
    },
    numOfWorkers: navigator.hardwareConcurrency || 2,
    frequency: 10,
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
    <div 
      ref={scannerRef} 
      className={`barcode-reader relative overflow-hidden rounded-lg ${className}`}
      style={{ minHeight: "300px" }}
    >
      {showViewFinder && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="border-2 border-dashed border-red-500 rounded w-3/4 h-1/3 flex items-center justify-center">
            <div className="text-center text-white text-xs bg-black bg-opacity-50 p-1 rounded">
              Position barcode here
            </div>
          </div>
        </div>
      )}
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