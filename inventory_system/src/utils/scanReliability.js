/**
 * Pure helpers for reliable one-scan lookup behavior.
 * Kept free of React so unit tests can import them directly.
 */

export const CAMERA_SCAN_COOLDOWN_MS = 2000;
export const SINGLE_PROCESSING_POLL_MAX_ATTEMPTS = 20;
export const BATCH_PROCESSING_POLL_MAX_ATTEMPTS = 8;
export const AUTH_PENDING_SCAN_TTL_MS = 15000;

/**
 * @param {object|null|undefined} product
 * @param {object|null|undefined} apiResult
 * @returns {boolean}
 */
export function isLocalProductIncomplete(product, apiResult = null) {
  if (!product) return true;
  if (apiResult?.processing === true || apiResult?.lookup_still_pending) {
    return true;
  }
  if (product.notFound || product.not_found) {
    return true;
  }

  const hasOnlyFnsku = Boolean(product.fnsku) && !product.asin;
  const name = String(product.name || product.title || '').trim();
  const hasPlaceholderName = !name
    || name.startsWith('FNSKU:')
    || name.includes('Processing')
    || name.startsWith('Product ')
    || name.startsWith('Amazon Product (ASIN:')
    || name.length < 5;
  const priceRaw = product.price;
  const hasNoPrice = priceRaw == null
    || priceRaw === ''
    || priceRaw === '0'
    || priceRaw === '0.00'
    || Number(priceRaw) <= 0;
  const hasNoImage = !(product.image_url || product.image || (Array.isArray(product.images) && product.images.length > 0));

  if (hasOnlyFnsku && (hasPlaceholderName || (hasNoPrice && hasNoImage))) {
    return true;
  }

  // Cache stub with no ASIN and no usable catalog identity.
  if (!product.asin && hasPlaceholderName && hasNoPrice && hasNoImage) {
    return true;
  }

  return false;
}

/**
 * Local hits that are incomplete should not short-circuit /api/scan.
 * @param {object|null|undefined} product
 * @param {boolean} forceApiLookup
 * @returns {boolean}
 */
export function shouldAcceptLocalCacheHit(product, forceApiLookup = false) {
  if (forceApiLookup) return false;
  if (!product) return false;
  return !isLocalProductIncomplete(product);
}

/**
 * @param {boolean} batchMode
 * @returns {number}
 */
export function getProcessingPollMaxAttempts(batchMode) {
  return batchMode ? BATCH_PROCESSING_POLL_MAX_ATTEMPTS : SINGLE_PROCESSING_POLL_MAX_ATTEMPTS;
}

/**
 * Cap the attempt value sent to /api/scan/status so soft give-up stays client-driven
 * until the vendor marks a terminal miss.
 * @param {number} attempts
 * @param {number} serverSoftLimit
 * @returns {number}
 */
export function getStatusPollAttemptParam(attempts, serverSoftLimit = 12) {
  const n = Number(attempts) || 0;
  const limit = Math.max(1, Number(serverSoftLimit) || 12);
  return Math.min(Math.max(n, 1), limit);
}
