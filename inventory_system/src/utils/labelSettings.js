/**
 * Utility functions for label printing settings
 */

const DEFAULT_DISCOUNT_PERCENT = 50; // 50% off by default

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

