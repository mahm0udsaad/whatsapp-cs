// Currency formatting for Meta Ads spend/budget figures. Meta returns ISO 4217
// codes (AED, SAR, USD…) in the `account_currency` insights field; we map the
// common ones to Arabic symbols and fall back to the raw code otherwise.

const SYMBOLS: Record<string, string> = {
  AED: "د.إ",
  SAR: "ر.س",
  USD: "$",
  EGP: "ج.م",
  KWD: "د.ك",
  QAR: "ر.ق",
  BHD: "د.ب",
  OMR: "ر.ع",
  JOD: "د.أ",
  EUR: "€",
  GBP: "£",
};

export function currencySymbol(code: string | null | undefined): string {
  if (!code) return "";
  return SYMBOLS[code.toUpperCase()] ?? code.toUpperCase();
}

export function formatMoney(
  amount: string | number | null | undefined,
  currency: string | null | undefined,
  fractionDigits = 2
): string {
  const value = Number(amount ?? 0).toFixed(fractionDigits);
  const sym = currencySymbol(currency);
  return sym ? `${value} ${sym}` : value;
}
