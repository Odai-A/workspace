import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { NotFoundException } from '@zxing/library';
import { ocrFromCanvas, terminateOcrWorker } from '../../utils/ocrBarcodeFallback';

const CONSTRAINT_PRESETS = [
  {
    width: { ideal: 1920, min: 1280 },
    height: { ideal: 1080, min: 720 },
    facingMode: { ideal: 'environment' },
    aspectRatio: { ideal: 16 / 9 },
    frameRate: { ideal: 30, min: 15 },
  },
  {
    width: { ideal: 1280, min: 640 },
    height: { ideal: 720, min: 480 },
    facingMode: { ideal: 'environment' },
    frameRate: { ideal: 24, min: 15 },
  },
  {
    facingMode: { ideal: 'environment' },
  },
];

/**
 * Get a video stream with progressive constraints (fallback on OverconstrainedError).
 */
async function getUserMediaWithFallback() {
  let lastError;
  for (const videoConstraints of CONSTRAINT_PRESETS) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      });
      return stream;
    } catch (e) {
      lastError = e;
      if (e?.name !== 'OverconstrainedError') throw e;
    }
  }
  throw lastError || new Error('Could not get camera access');
}

/**
 * Crop canvas to center ROI (fraction of width/height). Returns new canvas.
 */
function cropCanvasToROI(canvas, fraction = 0.6) {
  const w = canvas.width;
  const h = canvas.height;
  const roiW = Math.max(100, Math.floor(w * fraction));
  const roiH = Math.max(100, Math.floor(h * fraction));
  const x = Math.floor((w - roiW) / 2);
  const y = Math.floor((h - roiH) / 2);
  const out = document.createElement('canvas');
  out.width = roiW;
  out.height = roiH;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, x, y, roiW, roiH, 0, 0, roiW, roiH);
  return out;
}

const BarcodeScanner = ({
  onDetected,
  onError,
  onFallbackToPhoto,
  scannerRunning = false,
  scannerSettings = {},
  className = '',
  enableOcrFallback = true,
}) => {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const readerRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const canvasRef = useRef(null);
  const decodeInFlightRef = useRef(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState(null);
  const [hasScanned, setHasScanned] = useState(false);
  const [suggestedCode, setSuggestedCode] = useState(null);
  const [showOcrButton, setShowOcrButton] = useState(false);
  const failedDecodeCountRef = useRef(0);
  const ROI_FRACTION = 0.6;
  const FAILED_THRESHOLD_BEFORE_OCR_HINT = 30;

  const hasBarcodeDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  useEffect(() => {
    if (!readerRef.current) {
      readerRef.current = new BrowserMultiFormatReader();
    }
    return () => {
      stopScanning();
      terminateOcrWorker();
    };
  }, []);

  const stopScanning = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.load();
    }
    setIsScanning(false);
    setHasScanned(false);
    setSuggestedCode(null);
    setShowOcrButton(false);
    failedDecodeCountRef.current = 0;
  }, []);

  const reportSuccess = useCallback(
    (code, format = 'unknown', source = 'zxing') => {
      if (navigator.vibrate) navigator.vibrate(100);
      setHasScanned(true);
      stopScanning();
      if (onDetected) {
        onDetected({ code, format, confidence: 100, source });
      }
    },
    [onDetected, stopScanning]
  );

  const startScanning = useCallback(async () => {
    if (!videoRef.current || !containerRef.current || hasScanned) return;

    try {
      setError(null);
      setIsScanning(true);
      setSuggestedCode(null);
      setShowOcrButton(false);
      failedDecodeCountRef.current = 0;

      const stream = await getUserMediaWithFallback();
      streamRef.current = stream;
      const cameraRunId = `camera-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('autoplay', 'true');
        videoRef.current.setAttribute('muted', 'true');
        videoRef.current.setAttribute('autofocus', 'true');

        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Video load timeout')), 10000);
          const onLoaded = () => {
            clearTimeout(timeout);
            videoRef.current.removeEventListener('loadedmetadata', onLoaded);
            resolve();
          };
          videoRef.current.addEventListener('loadedmetadata', onLoaded);
          if (videoRef.current.readyState >= 1) {
            clearTimeout(timeout);
            videoRef.current.removeEventListener('loadedmetadata', onLoaded);
            resolve();
          }
        });

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          const capabilities = videoTrack.getCapabilities();
          // #region agent log
          fetch('http://127.0.0.1:7401/ingest/d9ae4633-7ca7-4e61-9841-2769087dbd8c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bff232'},body:JSON.stringify({sessionId:'bff232',runId:cameraRunId,hypothesisId:'H5',location:'BarcodeScanner.jsx:startScanning:capabilities',message:'Camera stream started',data:{settings:videoTrack.getSettings?.()||{},hasBarcodeDetector,roiFraction:ROI_FRACTION,scanIntervalMs:50},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          try {
            if (capabilities?.focusMode?.includes('continuous')) {
              await videoTrack.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
            }
          } catch (_) {}
          try {
            if (capabilities?.exposureMode?.includes('continuous')) {
              await videoTrack.applyConstraints({ advanced: [{ exposureMode: 'continuous' }] });
            }
          } catch (_) {}
        }

        try {
          await videoRef.current.play();
        } catch (_) {}
      }

      if (!canvasRef.current) canvasRef.current = document.createElement('canvas');

      const scanInterval = 50;
      scanIntervalRef.current = setInterval(async () => {
        if (!videoRef.current || !canvasRef.current || hasScanned) return;
        if (decodeInFlightRef.current) return;

        const video = videoRef.current;
        if (video.readyState !== video.HAVE_ENOUGH_DATA) return;

        const fullW = video.videoWidth;
        const fullH = video.videoHeight;
        if (fullW < 50 || fullH < 50) return;

        canvasRef.current.width = fullW;
        canvasRef.current.height = fullH;
        const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(video, 0, 0, fullW, fullH);

        decodeInFlightRef.current = true;

        try {
          const roiCanvas = cropCanvasToROI(canvasRef.current, ROI_FRACTION);

          if (hasBarcodeDetector) {
            try {
              const barcodeDetector = new window.BarcodeDetector();
              const barcodes = await barcodeDetector.detect(roiCanvas);
              if (barcodes && barcodes.length > 0) {
                const b = barcodes[0];
                const code = (b.rawValue || '').trim();
                if (code) {
                  // #region agent log
                  fetch('http://127.0.0.1:7401/ingest/d9ae4633-7ca7-4e61-9841-2769087dbd8c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bff232'},body:JSON.stringify({sessionId:'bff232',runId:cameraRunId,hypothesisId:'H2',location:'BarcodeScanner.jsx:detect:barcodeDetector',message:'BarcodeDetector decoded candidate',data:{codeLen:code.length,format:b.format||'unknown'},timestamp:Date.now()})}).catch(()=>{});
                  // #endregion
                  reportSuccess(code, b.format || 'unknown', 'BarcodeDetector');
                  return;
                }
              }
            } catch (_) {}
          }

          const result = await readerRef.current.decodeFromCanvas(roiCanvas);
          if (result && result.getText()) {
            const code = result.getText().trim();
            const format = result.getBarcodeFormat().toString();
            // #region agent log
            fetch('http://127.0.0.1:7401/ingest/d9ae4633-7ca7-4e61-9841-2769087dbd8c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bff232'},body:JSON.stringify({sessionId:'bff232',runId:cameraRunId,hypothesisId:'H3',location:'BarcodeScanner.jsx:detect:zxing',message:'ZXing decoded candidate',data:{codeLen:code.length,format},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            reportSuccess(code, format, 'zxing');
            return;
          }
        } catch (err) {
          if (!(err instanceof NotFoundException)) {
            console.warn('Scan error:', err);
          }
          failedDecodeCountRef.current = (failedDecodeCountRef.current || 0) + 1;
          if (enableOcrFallback && failedDecodeCountRef.current >= FAILED_THRESHOLD_BEFORE_OCR_HINT) {
            setShowOcrButton(true);
            // #region agent log
            fetch('http://127.0.0.1:7401/ingest/d9ae4633-7ca7-4e61-9841-2769087dbd8c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bff232'},body:JSON.stringify({sessionId:'bff232',runId:cameraRunId,hypothesisId:'H3',location:'BarcodeScanner.jsx:detect:decodeFailThreshold',message:'Decode failures reached OCR threshold',data:{failedDecodeCount:failedDecodeCountRef.current},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
          }
        } finally {
          decodeInFlightRef.current = false;
        }
      }, scanInterval);
    } catch (err) {
      console.error('Error starting camera:', err);
      setError(err.message || 'Failed to start camera');
      setIsScanning(false);
      if (onError) onError(err);
      if (onFallbackToPhoto) onFallbackToPhoto();
    }
  }, [scannerSettings, hasScanned, stopScanning, onDetected, onError, onFallbackToPhoto, enableOcrFallback, reportSuccess]);

  useEffect(() => {
    if (scannerRunning && !isScanning && !hasScanned) {
      setTimeout(() => startScanning(), 100);
    } else if (!scannerRunning && isScanning) {
      stopScanning();
    }
  }, [scannerRunning, isScanning, hasScanned, startScanning, stopScanning]);

  useEffect(() => {
    if (!scannerRunning) {
      setHasScanned(false);
      setError(null);
      setSuggestedCode(null);
      setShowOcrButton(false);
    }
  }, [scannerRunning]);

  const handleReadTextInstead = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || hasScanned) return;
    const video = videoRef.current;
    if (video.readyState !== video.HAVE_ENOUGH_DATA) return;
    canvasRef.current.width = video.videoWidth;
    canvasRef.current.height = video.videoHeight;
    const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, canvasRef.current.width, canvasRef.current.height);
    const roi = {
      x: (1 - ROI_FRACTION) / 2 * canvasRef.current.width,
      y: (1 - ROI_FRACTION) / 2 * canvasRef.current.height,
      width: ROI_FRACTION * canvasRef.current.width,
      height: ROI_FRACTION * canvasRef.current.height,
    };
    const candidate = await ocrFromCanvas(canvasRef.current, roi);
    if (candidate) setSuggestedCode(candidate);
    else setError("Couldn't read text. Try better light or hold steady.");
  }, [hasScanned]);

  const handleUseSuggestedCode = useCallback(() => {
    if (suggestedCode) reportSuccess(suggestedCode, 'ocr', 'ocr');
    setSuggestedCode(null);
  }, [suggestedCode, reportSuccess]);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-lg ${className}`}
      style={{ minHeight: '400px' }}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        autoPlay
        muted
        style={{
          imageRendering: 'crisp-edges',
        }}
      />

      <div className="absolute inset-0 border-2 border-dashed border-blue-500 rounded-lg pointer-events-none">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-64 h-64 border-2 border-red-500 rounded-md" />
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white p-2 text-center text-sm flex flex-col gap-1">
        <span>{isScanning ? 'Hold steady and align barcode in the frame' : 'Position barcode within the red box'}</span>
        {showOcrButton && enableOcrFallback && !suggestedCode && (
          <button
            type="button"
            onClick={handleReadTextInstead}
            className="mx-auto px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-black text-xs font-medium rounded"
          >
            Barcode didn&apos;t work – read text instead
          </button>
        )}
      </div>

      {suggestedCode && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/70 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 max-w-sm w-full text-center shadow-xl">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">Did you mean?</p>
            <p className="text-lg font-mono font-bold text-gray-900 dark:text-white break-all mb-4">{suggestedCode}</p>
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={handleUseSuggestedCode}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium"
              >
                Use this
              </button>
              <button
                type="button"
                onClick={() => { setSuggestedCode(null); setError(null); }}
                className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {error && !suggestedCode && !isScanning && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-30 bg-black/80 p-4">
          <p className="text-sm font-medium text-red-200 mb-3 text-center">{error}</p>
          {onFallbackToPhoto && (
            <button
              type="button"
              onClick={onFallbackToPhoto}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium"
            >
              Take photo instead
            </button>
          )}
        </div>
      )}
      {error && suggestedCode === null && isScanning && (
        <div className="absolute top-2 left-2 right-2 z-20 bg-red-500/90 text-white text-xs px-3 py-2 rounded text-center">
          {error}
        </div>
      )}

      <style>{`
        .barcode-scanner video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          image-rendering: -webkit-optimize-contrast;
          image-rendering: crisp-edges;
          filter: contrast(1.1) brightness(1.05) saturate(1.1);
        }
      `}</style>
    </div>
  );
};

export default BarcodeScanner;
