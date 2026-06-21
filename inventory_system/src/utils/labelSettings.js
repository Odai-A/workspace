/**
 * Utility functions for label printing settings
 */

const DEFAULT_DISCOUNT_PERCENT = 50; // 50% off by default
export const LABEL_PRINTER_PROFILES = ['4x6', '2inch'];
const DEFAULT_LABEL_PRINTER_PROFILE = '4x6';

/**
 * Get the discount percentage for label printing
 * @returns {number} Discount percentage (0-100)
 */
export const getLabelDiscountPercent = () => {
  const saved = localStorage.getItem('labelDiscountPercent');
  if (saved) {
    const percent = parseFloat(saved);
    // Validate the percentage is between 0 and 100
    if (!isNaN(percent) && percent >= 0 && percent <= 100) {
      return percent;
    }
  }
  return DEFAULT_DISCOUNT_PERCENT;
};

/**
 * Set the discount percentage for label printing
 * @param {number} percent - Discount percentage (0-100)
 */
export const setLabelDiscountPercent = (percent) => {
  const validatedPercent = Math.max(0, Math.min(100, parseFloat(percent) || DEFAULT_DISCOUNT_PERCENT));
  localStorage.setItem('labelDiscountPercent', validatedPercent.toString());
  return validatedPercent;
};

/**
 * Calculate the selling price based on retail price and discount percentage
 * @param {number} retailPrice - The retail price
 * @param {number} discountPercent - Optional discount percentage (uses saved setting if not provided)
 * @returns {number} The calculated selling price
 */
export const calculateSellingPrice = (retailPrice, discountPercent = null) => {
  const retail = parseFloat(retailPrice) || 0;
  const discount = discountPercent !== null ? discountPercent : getLabelDiscountPercent();
  const discountMultiplier = (100 - discount) / 100;
  return retail * discountMultiplier;
};

/**
 * Get the default printer profile for labels
 * @returns {'4x6' | '2inch'}
 */
export const getLabelPrinterProfile = () => {
  const saved = localStorage.getItem('labelPrinterProfile');
  if (saved && LABEL_PRINTER_PROFILES.includes(saved)) {
    return saved;
  }
  return DEFAULT_LABEL_PRINTER_PROFILE;
};

/**
 * Save the default printer profile for labels
 * @param {string} profile
 * @returns {'4x6' | '2inch'}
 */
export const setLabelPrinterProfile = (profile) => {
  const next = LABEL_PRINTER_PROFILES.includes(profile) ? profile : DEFAULT_LABEL_PRINTER_PROFILE;
  localStorage.setItem('labelPrinterProfile', next);
  return next;
};

/**
 * When enabled, 4x6 labels show a large QR code in the price area instead of retail/sale prices.
 * @returns {boolean}
 */
export const getLabelQrInsteadOfPrice4x6 = () => {
  return localStorage.getItem('labelQrInsteadOfPrice4x6') === 'true';
};

/**
 * @param {boolean} enabled
 * @returns {boolean}
 */
export const setLabelQrInsteadOfPrice4x6 = (enabled) => {
  localStorage.setItem('labelQrInsteadOfPrice4x6', enabled ? 'true' : 'false');
  return !!enabled;
};

/** CSS shared by Scanner + Inventory 4x6 label templates. */
export const LABEL_4X6_QR_PRICE_CSS = `
  .label-qr-instead-of-price .qr-code-top-right,
  .label-qr-instead-of-price .header-row .qr {
    display: none !important;
  }
  .price-section.price-section-qr-only,
  .price-block.price-block-qr-only {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 100%;
    margin-top: auto;
    margin-bottom: 0.05in;
    padding: 0.05in 0 0.04in;
    text-align: center;
    align-self: stretch;
  }
  .price-qr-large {
    width: 1.4in;
    height: 1.4in;
    border: 2px solid #000;
    padding: 0.05in;
    background: #fff;
    object-fit: contain;
    display: block;
    margin: 0 auto;
  }
`;

/** Body class when 4x6 labels use a bottom QR instead of prices. */
export const getLabelQrInsteadOfPriceBodyClass = () => (
  getLabelQrInsteadOfPrice4x6() ? 'label-qr-instead-of-price' : ''
);

/**
 * Build a larger QR image URL from an existing qrserver.com URL.
 * @param {string} qrCodeUrl
 * @param {number} pixelSize
 * @returns {string}
 */
export const getLargeQrCodeUrl = (qrCodeUrl, pixelSize = 240) => {
  if (!qrCodeUrl) return '';
  if (/size=\d+x\d+/.test(qrCodeUrl)) {
    return qrCodeUrl.replace(/size=\d+x\d+/, `size=${pixelSize}x${pixelSize}`);
  }
  return qrCodeUrl;
};

/**
 * Price block for Scanner 4x6 labels (single + batch scan).
 */
export const buildScanner4x6PriceSectionHtml = ({
  retailPrice = 0,
  ourPrice = 0,
  discountPercent = 50,
  qrCodeUrl = '',
}) => {
  if (getLabelQrInsteadOfPrice4x6() && qrCodeUrl) {
    const largeQr = getLargeQrCodeUrl(qrCodeUrl, 240);
    return `
      <div class="price-section price-section-qr-only">
        <img class="price-qr-large" src="${largeQr}" alt="Amazon QR Code" />
      </div>
    `;
  }

  if (retailPrice > 0) {
    return `
      <div class="price-section">
        <div class="retail-price">
          <span class="retail-price-label">RETAIL:</span> $${retailPrice.toFixed(2)}
        </div>
        <div class="our-price-label">OUR PRICE:</div>
        <div class="our-price">
          $${ourPrice.toFixed(2)} <span style="font-size: 12pt; color: #059669;">(${discountPercent}% OFF)</span>
        </div>
      </div>
    `;
  }

  return '';
};

/**
 * Price block for Inventory 4x6 batch labels.
 */
export const buildInventory4x6PriceBlockHtml = ({
  retailPrice = 0,
  ourPrice = 0,
  qrCodeUrl = '',
}) => {
  if (getLabelQrInsteadOfPrice4x6() && qrCodeUrl) {
    const largeQr = getLargeQrCodeUrl(qrCodeUrl, 240);
    return `
      <div class="price-block price-block-qr-only">
        <img class="price-qr-large" src="${largeQr}" alt="Amazon QR Code" />
      </div>
    `;
  }

  return `
    <div class="price-block">
      <div class="retail">Retail: $${retailPrice.toFixed(2)}</div>
      <div class="price">$${ourPrice.toFixed(2)}</div>
    </div>
  `;
};

