import React, { useState, useRef, useEffect, useCallback } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
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
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const readerRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const canvasRef = useRef(null);
  const focusTimeoutRef = useRef(null);
  const videoTrackRef = useRef(null);
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

  // Function to re-apply continuous focus (required for Safari)
  const reapplyFocus = useCallback(async () => {
    const track = videoTrackRef.current;
    if (!track) return;

    try {
      const capabilities = track.getCapabilities();
      if (capabilities?.focusMode?.includes('continuous')) {
        await track.applyConstraints({
          advanced: [{ focusMode: 'continuous' }]
        });
        console.log('✅ Focus re-applied');
      }
    } catch (err) {
      console.warn('Could not re-apply focus:', err);
    }
  }, []);

  // Handle tap-to-focus
  const handleVideoTap = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Re-apply focus on tap
    reapplyFocus();
    
    // Visual feedback (optional - you can add a focus indicator here)
    if (videoRef.current) {
      videoRef.current.style.opacity = '0.9';
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.style.opacity = '1';
        }
      }, 200);
    }
  }, [reapplyFocus]);

  const stopScanning = useCallback(() => {
    // Clear scan interval
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }

    // Clear focus timeout
    if (focusTimeoutRef.current) {
      clearTimeout(focusTimeoutRef.current);
      focusTimeoutRef.current = null;
    }

    // Stop video stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      streamRef.current = null;
    }

    videoTrackRef.current = null;

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

      // iPhone Safari optimized camera constraints
      const videoConstraints = {
        facingMode: { exact: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 60 },
        advanced: [
          { focusMode: 'continuous' },
          { zoom: 2.0 }
        ],
        ...constraints
      };

      // Get user media with optimal settings
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false
      });

      streamRef.current = stream;
      const videoTrack = stream.getVideoTracks()[0];
      videoTrackRef.current = videoTrack;

      // Immediately re-apply focus after stream starts (Safari requirement)
      if (videoTrack) {
        try {
          const capabilities = videoTrack.getCapabilities();
          if (capabilities?.focusMode?.includes('continuous')) {
            await videoTrack.applyConstraints({
              advanced: [{ focusMode: 'continuous' }]
            });
            console.log('✅ Initial focus applied');
          }
        } catch (err) {
          console.warn('Could not set initial focus:', err);
        }
      }

      // Apply stream to video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Set all required attributes for iPhone Safari
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('webkit-playsinline', 'true');
        videoRef.current.setAttribute('autofocus', 'true');
        videoRef.current.setAttribute('autoplay', 'true');
        videoRef.current.setAttribute('muted', 'true');
        videoRef.current.setAttribute('disablePictureInPicture', 'true');
        
        // Add tap handler for manual focus
        videoRef.current.addEventListener('click', handleVideoTap);
        videoRef.current.addEventListener('touchend', handleVideoTap);
        
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

        // Re-apply focus after 500ms (Safari locks autofocus after 1 second)
        focusTimeoutRef.current = setTimeout(() => {
          reapplyFocus();
        }, 500);

        // Re-apply focus after 1500ms
        setTimeout(() => {
          reapplyFocus();
        }, 1500);

        // Log camera settings
        if (videoTrack) {
          const settings = videoTrack.getSettings();
          console.log('📹 Camera settings:', {
            width: settings.width,
            height: settings.height,
            frameRate: settings.frameRate,
            focusMode: settings.focusMode,
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
            if (handleDetectedCallback) {
              handleDetectedCallback({
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
  }, [constraints, handleDetectedCallback, hasScanned, stopScanning, onError, reapplyFocus, handleVideoTap]);

  // Handle active prop changes
  useEffect(() => {
    if (active && !isScanning && !hasScanned) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        startScanning();
      }, 100);
    } else if (!active && isScanning) {
      stopScanning();
    }
  }, [active, isScanning, hasScanned, startScanning, stopScanning]);

  // Reset hasScanned when active becomes false
  useEffect(() => {
    if (!active) {
      setHasScanned(false);
      setError(null);
    }
  }, [active]);

  // Cleanup event listeners
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (video) {
        video.removeEventListener('click', handleVideoTap);
        video.removeEventListener('touchend', handleVideoTap);
      }
    };
  }, [handleVideoTap]);

  return (
    <div className={`relative w-full ${className}`}>
      {/* Scanner Container */}
      <div 
        ref={containerRef}
        className="barcode-reader relative overflow-hidden rounded-xl shadow-2xl bg-black"
        style={{ 
          minHeight: "500px",
          maxHeight: "800px",
          width: "100%",
          aspectRatio: "16/9"
        }}
      >
        {/* Video Element */}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover cursor-pointer"
          playsInline
          autoPlay
          muted
          style={{
            transform: 'scaleX(-1)', // Mirror for better UX
            imageRendering: 'crisp-edges',
            WebkitTransform: 'scaleX(-1)',
          }}
        />

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
                    {isScanning ? 'Scanning... Tap to focus' : 'Position barcode within frame'}
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
        {isScanning && (
          <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-green-500/90 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-xs font-medium shadow-lg">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
            <span>Scanning...</span>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-30 bg-black/80">
            <div className="bg-red-500/90 text-white px-4 py-2 rounded-lg">
              <p className="text-sm font-medium">{error}</p>
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
              <li>Hold your device steady and ensure good lighting</li>
              <li>Position the barcode within the green frame</li>
              <li>Keep the barcode flat and avoid glare or shadows</li>
              <li>Tap the video to re-focus if needed (iPhone Safari)</li>
              <li>Move closer if the barcode is too small</li>
              <li>Scanning is instant - no need to wait</li>
              <li>Ensure the entire barcode is visible in the frame</li>
            </ul>
          </div>
        </div>
      </div>
      
      {/* Add CSS for scanning line animation and video quality */}
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
            min-height: 450px !important;
            max-height: 600px !important;
          }
        }
        
        /* Prevent blur and improve rendering */
        .barcode-reader {
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          transform: translateZ(0);
          -webkit-transform: translateZ(0);
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        
        /* Ensure video fills container with high quality */
        .barcode-reader video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          image-rendering: -webkit-optimize-contrast;
          image-rendering: crisp-edges;
          -webkit-transform: scaleX(-1);
          transform: scaleX(-1);
          filter: contrast(1.1) brightness(1.05) saturate(1.1);
          -webkit-filter: contrast(1.1) brightness(1.05) saturate(1.1);
          -webkit-tap-highlight-color: transparent;
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
