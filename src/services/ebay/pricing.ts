export function ebayShippingCost(heightCm: number) {
  if (!Number.isFinite(heightCm) || heightCm <= 0) {
    throw new Error("Für den eBay-Preis fehlt eine gültige Artikelhöhe.");
  }
  if (heightCm < 120) return 8.9;
  if (heightCm < 150) return 13.9;
  if (heightCm < 170) return 16.9;
  if (heightCm < 230) return 85;
  if (heightCm < 300) return 150;
  return 250;
}

export function ebaySuggestedPrice(
  standardPrice: number,
  heightCm: number
) {
  if (!Number.isFinite(standardPrice) || standardPrice <= 0) {
    throw new Error("Für den eBay-Preis fehlt ein gültiger Standardpreis.");
  }
  const shipping = ebayShippingCost(heightCm);
  return Math.max(
    0.01,
    Math.round(
      ((standardPrice + shipping) * 1.17 + Number.EPSILON) * 100
    ) / 100
  );
}
