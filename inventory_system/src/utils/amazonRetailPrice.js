/**
 * Prefer Amazon list / RRP (strikethrough) over discounted buy-box price from Rainforest `product` objects.
 * When the listing has no main price (discontinued), use other on-page prices (e.g. "New from", more buying choices).
 * @param {Record<string, unknown>|null|undefined} product - Rainforest API `response.data.product`
 * @returns {number|null}
 */
export function rainforestRetailPriceFromProduct(product) {
  if (!product || typeof product !== 'object') return null;

  const priceObjValue = (priceObj) => {
    if (priceObj == null) return null;
    let n;
    if (typeof priceObj === 'object' && priceObj !== null && 'value' in priceObj) {
      const v = priceObj.value;
      if (v === '' || v == null) return null;
      n = parseFloat(v);
    } else {
      n = parseFloat(priceObj);
    }
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  };

  const auxiliaryOfferPrices = () => {
    const vals = [];
    const bb =
      product.buybox_winner && typeof product.buybox_winner === 'object'
        ? product.buybox_winner
        : {};
    for (const key of ['new_offers_from', 'used_offers_from', 'mixed_offers_from']) {
      const v = priceObjValue(bb[key]);
      if (v != null) vals.push(v);
    }
    const sec = bb.secondary_buybox;
    if (sec && typeof sec === 'object') {
      for (const k of ['price', 'rrp']) {
        const v = priceObjValue(sec[k]);
        if (v != null) vals.push(v);
      }
    }
    const choices = product.more_buying_choices;
    if (Array.isArray(choices)) {
      for (const ch of choices) {
        if (ch && typeof ch === 'object') {
          const v = priceObjValue(ch.price);
          if (v != null) vals.push(v);
        }
      }
    }
    return vals;
  };

  const bb =
    product.buybox_winner && typeof product.buybox_winner === 'object'
      ? product.buybox_winner
      : {};
  const sale = priceObjValue(bb.price) ?? priceObjValue(product.price);
  const rrp = priceObjValue(bb.rrp);
  const listP = priceObjValue(product.list_price);
  const listCandidates = [rrp, listP].filter((x) => x != null && x > 0);
  if (listCandidates.length > 0) {
    const retail = Math.max(...listCandidates);
    if (sale != null) {
      if (retail < sale) return sale;
      return retail;
    }
    return retail;
  }
  if (sale != null) return sale;
  const aux = auxiliaryOfferPrices();
  if (aux.length > 0) return Math.max(...aux);
  return null;
}

/**
 * @param {number|null|undefined} rfPrice
 * @param {{ price?: unknown }|null|undefined} cachedRow
 * @returns {number}
 */
export function mergeRainforestPriceWithCache(rfPrice, cachedRow) {
  if (rfPrice != null && Number.isFinite(rfPrice) && rfPrice > 0) return rfPrice;
  const c = cachedRow?.price;
  const n = c != null && c !== '' ? parseFloat(c) : NaN;
  if (Number.isFinite(n) && n > 0) return n;
  return 0;
}
