import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { NotFoundException } from '@zxing/library';

const BarcodeScanner = ({ 
  onDetected, 
  onError, 
  scannerRunning = false, 
  scannerSettings = {}, 
  className = '',
}) => {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const readerRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const canvasRef = useRef(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState(null);
  const [hasScanned, setHasScanned] = useState(false);

  // Initialize ZXing reader
  useEffect(() => {
    if (!readerRef.current) {
      readerRef.current = new BrowserMultiFormatReader();
    }
    return () => {
      stopScanning();
    };
  }, []);

  const stopScanning = useCallback(() => {
    // Clear scan interval
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }

    // Stop video stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      streamRef.current = null;
    }

    // Reset video element
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.load();
    }

    setIsScanning(false);
    setHasScanned(false);
  }, []);

  const startScanning = useCallback(async () => {
    if (!videoRef.current || !containerRef.current || hasScanned) {
      return;
    }

    try {
      setError(null);
      setIsScanning(true);

      // Create optimal camera constraints
      const videoConstraints = {
        width: { ideal: 1920, min: 1280 },
        height: { ideal: 1080, min: 720 },
        facingMode: { ideal: 'environment' }, // Force rear camera
        aspectRatio: { ideal: 16/9 },
        frameRate: { ideal: 60, min: 30 }, // 60fps ideal
        focusMode: 'continuous', // Continuous autofocus
        exposureMode: 'continuous',
        whiteBalanceMode: 'continuous',
        zoom: { ideal: 1.0 },
        ...scannerSettings
      };

      // Get user media with optimal settings
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false
      });

      streamRef.current = stream;

      // Apply stream to video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('autoplay', 'true');
        videoRef.current.setAttribute('muted', 'true');
        videoRef.current.setAttribute('autofocus', 'true');
        
        // Wait for video to be ready
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Video load timeout'));
          }, 10000);

          const onLoadedMetadata = () => {
            clearTimeout(timeout);
            videoRef.current.removeEventListener('loadedmetadata', onLoadedMetadata);
            resolve();
          };

          videoRef.current.addEventListener('loadedmetadata', onLoadedMetadata);
          
          // Also handle if already loaded
          if (videoRef.current.readyState >= 1) {
            clearTimeout(timeout);
            videoRef.current.removeEventListener('loadedmetadata', onLoadedMetadata);
            resolve();
          }
        });

        // Apply additional constraints after stream starts
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          const capabilities = videoTrack.getCapabilities();
          const settings = videoTrack.getSettings();

          // Apply continuous focus if supported
          if (capabilities?.focusMode?.includes('continuous')) {
            try {
              await videoTrack.applyConstraints({
                advanced: [{ focusMode: 'continuous' }]
              });
              console.log('✅ Continuous focus enabled');
            } catch (err) {
              console.warn('Could not set continuous focus:', err);
            }
          }

          // Apply zoom if supported
          if (capabilities?.zoom) {
            try {
              const maxZoom = Math.min(capabilities.zoom.max || 1, 2);
              await videoTrack.applyConstraints({
                advanced: [{ zoom: maxZoom }]
              });
              console.log('✅ Zoom applied');
            } catch (err) {
              console.warn('Could not set zoom:', err);
            }
          }

          // Log camera settings
          console.log('📹 Camera settings:', {
            width: settings.width,
            height: settings.height,
            frameRate: settings.frameRate,
            focusMode: settings.focusMode,
            exposureMode: settings.exposureMode,
            zoom: settings.zoom
          });
        }

        // Play video
        try {
          await videoRef.current.play();
        } catch (playError) {
          console.warn('Autoplay prevented, user interaction required');
        }
      }

      // Create canvas for decoding
      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
      }

      // Start scanning loop - decode every 50ms (20 scans per second)
      scanIntervalRef.current = setInterval(async () => {
        if (!videoRef.current || !canvasRef.current || hasScanned) {
          return;
        }

        try {
          const video = videoRef.current;
          
          // Check if video is ready
          if (video.readyState !== video.HAVE_ENOUGH_DATA) {
            return;
          }

          // Set canvas dimensions to match video
          canvasRef.current.width = video.videoWidth;
          canvasRef.current.height = video.videoHeight;

          // Draw video frame to canvas
          const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(video, 0, 0, canvasRef.current.width, canvasRef.current.height);

          // Decode barcode from canvas
          const result = await readerRef.current.decodeFromCanvas(canvasRef.current);

          if (result && result.getText()) {
            const code = result.getText().trim();
            const format = result.getBarcodeFormat().toString();

            // Stop immediately after first successful scan
            setHasScanned(true);
            stopScanning();

            // Call callback with result
            if (onDetected) {
              onDetected({
                code,
                format,
                confidence: 100, // ZXing doesn't provide confidence, assume high
              });
            }
          }
        } catch (err) {
          // NotFoundException is expected when no barcode is found
          if (!(err instanceof NotFoundException)) {
            console.warn('Scan error:', err);
          }
        }
      }, 50); // 50ms = 20 scans per second

    } catch (err) {
      console.error('Error starting camera:', err);
      setError(err.message || 'Failed to start camera');
      setIsScanning(false);
      
      if (onError) {
        onError(err);
      }
    }
  }, [scannerSettings, onDetected, hasScanned, stopScanning, onError]);

  // Handle scannerRunning prop changes
  useEffect(() => {
    if (scannerRunning && !isScanning && !hasScanned) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        startScanning();
      }, 100);
    } else if (!scannerRunning && isScanning) {
      stopScanning();
    }
  }, [scannerRunning, isScanning, hasScanned, startScanning, stopScanning]);

  // Reset hasScanned when scannerRunning becomes false
  useEffect(() => {
    if (!scannerRunning) {
      setHasScanned(false);
      setError(null);
    }
  }, [scannerRunning]);

  return (
    <div 
      ref={containerRef}
      className={`relative overflow-hidden rounded-lg ${className}`}
      style={{ minHeight: '400px' }}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        autoPlay
        muted
        style={{
          transform: 'scaleX(-1)', // Mirror for better UX
          imageRendering: 'crisp-edges',
          WebkitTransform: 'scaleX(-1)',
        }}
      />
      
      {/* Scanner overlay with visual guides */}
      <div className="absolute inset-0 border-2 border-dashed border-blue-500 rounded-lg pointer-events-none">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-64 h-64 border-2 border-red-500 rounded-md"></div>
        </div>
      </div>
      
      {/* Instructions overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white p-2 text-center text-sm">
        {isScanning ? 'Scanning...' : 'Position barcode within the red box'}
      </div>

      {/* Error message */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center z-30 bg-black/80">
          <div className="bg-red-500/90 text-white px-4 py-2 rounded-lg">
            <p className="text-sm font-medium">{error}</p>
          </div>
        </div>
      )}

      {/* CSS for video quality */}
      <style>{`
        .barcode-scanner video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          image-rendering: -webkit-optimize-contrast;
          image-rendering: crisp-edges;
          -webkit-transform: scaleX(-1);
          transform: scaleX(-1);
          filter: contrast(1.1) brightness(1.05) saturate(1.1);
          -webkit-filter: contrast(1.1) brightness(1.05) saturate(1.1);
        }
      `}</style>
    </div>
  );
};

export default BarcodeScanner;
