/**
 * OCR fallback for barcode scanning: when barcode decode fails,
 * read letters/digits from the viewfinder ROI and return candidate codes
 * (FNSKU-like alphanumeric or UPC/EAN-like digits).
 */

let workerInstance = null;

/**
 * Get or create a single Tesseract worker (reused to avoid memory churn).
 * @returns {Promise<import('tesseract.js').Worker>}
 */
async function getWorker() {
  if (workerInstance) return workerInstance;
  const { createWorker } = await import('tesseract.js');
  workerInstance = await createWorker('eng', undefined, {
    logger: () => {},
  });
  return workerInstance;
}

/**
 * Normalize OCR text: remove spaces, normalize common confusions (O/0, I/1/l).
 * @param {string} raw
 * @returns {string}
 */
function normalizeCode(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let s = raw.replace(/\s+/g, '').replace(/[-_]/g, '').trim();
  return s.toUpperCase();
}

/**
 * Check if string looks like a valid FNSKU (alphanumeric, typical lengths).
 * @param {string} s
 * @returns {boolean}
 */
function looksLikeFNSKU(s) {
  if (!s || s.length < 8 || s.length > 20) return false;
  return /^[A-Z0-9]+$/.test(s);
}

/**
 * Check if string looks like UPC (12 digits) or EAN-13 (13 digits).
 * @param {string} s
 * @returns {boolean}
 */
function looksLikeUPC(s) {
  if (!s || s.length < 12 || s.length > 13) return false;
  return /^\d{12,13}$/.test(s);
}

/**
 * Parse OCR result for candidate barcode-like strings.
 * Prefer longest plausible code in the block; filter by FNSKU or UPC pattern.
 * @param {string} text - Raw OCR text (may have newlines/spaces)
 * @returns {string|null} Best candidate code or null
 */
function parseCandidateCode(text) {
  if (!text || typeof text !== 'string') return null;
  const normalized = normalizeCode(text);
  if (normalized.length < 8) return null;

  // Try whole string first
  if (looksLikeFNSKU(normalized) || looksLikeUPC(normalized)) return normalized;

  // Split by non-alphanumeric and try each token
  const tokens = text.split(/[\s\n\r\t\-_]+/).map(normalizeCode).filter(Boolean);
  let best = null;
  for (const t of tokens) {
    if (t.length < 8) continue;
    if (looksLikeFNSKU(t) || looksLikeUPC(t)) {
      if (!best || t.length > best.length) best = t;
    }
  }
  return best;
}

/**
 * Run OCR on a canvas (optionally cropped to ROI) and return a candidate code.
 * @param {HTMLCanvasElement} canvas - Full frame canvas
 * @param {{ x: number, y: number, width: number, height: number }} [roi] - Region of interest (fraction 0-1 or pixels). If not provided, uses full canvas.
 * @returns {Promise<string|null>} Candidate code or null
 */
export async function ocrFromCanvas(canvas, roi = null) {
  if (!canvas || !canvas.getContext) return null;

  let targetCanvas = canvas;
  let roiWidth = canvas.width;
  let roiHeight = canvas.height;
  let roiX = 0;
  let roiY = 0;

  if (roi && typeof roi.x === 'number' && typeof roi.width === 'number') {
    // ROI in pixels
    roiX = Math.max(0, Math.floor(roi.x));
    roiY = Math.max(0, Math.floor(roi.y ?? 0));
    roiWidth = Math.min(canvas.width - roiX, Math.max(1, Math.floor(roi.width)));
    roiHeight = Math.min(canvas.height - roiY, Math.max(1, Math.floor(roi.height ?? roiWidth)));
    if (roiWidth < 50 || roiHeight < 50) return null;
    const offscreen = document.createElement('canvas');
    offscreen.width = roiWidth;
    offscreen.height = roiHeight;
    const ctx = offscreen.getContext('2d');
    ctx.drawImage(canvas, roiX, roiY, roiWidth, roiHeight, 0, 0, roiWidth, roiHeight);
    targetCanvas = offscreen;
  }

  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(targetCanvas);
    const candidate = parseCandidateCode(data?.text || '');
    return candidate || null;
  } catch (e) {
    console.warn('OCR fallback error:', e);
    return null;
  }
}

/**
 * Run OCR on an image URL or data URL (e.g. from photo capture).
 * @param {string} imageUrl - Data URL or blob URL
 * @param {{ x: number, y: number, width: number, height: number }} [roi] - Optional ROI in pixels (relative to image size after load)
 * @returns {Promise<string|null>}
 */
export async function ocrFromImageUrl(imageUrl, roi = null) {
  if (!imageUrl) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      let useRoi = roi;
      if (roi && (roi.width <= 1 || roi.height <= 1)) {
        useRoi = {
          x: roi.x * canvas.width,
          y: roi.y * canvas.height,
          width: roi.width * canvas.width,
          height: (roi.height || roi.width) * canvas.height,
        };
      }
      ocrFromCanvas(canvas, useRoi).then(resolve).catch(() => resolve(null));
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

/**
 * Terminate the shared worker (call when scanner is unmounted or app is done).
 */
export function terminateOcrWorker() {
  if (workerInstance) {
    workerInstance.terminate().catch(() => {});
    workerInstance = null;
  }
}
