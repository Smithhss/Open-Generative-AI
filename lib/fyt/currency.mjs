// Adapted from foyton-relay c06146b96 frontend/src/lib/api/currency.ts.
/**
 * Go stores money as integer "quota" (default 500 000 quota = 1 USD). How it is
 * shown depends on `/api/status`:
 *   USD    -> $ amount
 *   CNY    -> ¥ amount x usd_exchange_rate
 *   CUSTOM -> custom symbol, amount x custom_currency_exchange_rate
 *   TOKENS -> the raw quota (balances only; prices always use USD)
 * Pure functions only — unit tested with node --test.
 */
export const DEFAULT_CURRENCY = {
    quotaPerUnit: 500_000,
    displayType: "USD",
    usdExchangeRate: 1,
    customSymbol: "¤",
    customExchangeRate: 1,
};
const positive = (value, fallback) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
export function currencyConfigFromStatus(status) {
    if (!status)
        return DEFAULT_CURRENCY;
    const type = status.quota_display_type;
    const displayType = type === "CNY" || type === "TOKENS" || type === "CUSTOM" ? type : "USD";
    return {
        quotaPerUnit: positive(status.quota_per_unit, DEFAULT_CURRENCY.quotaPerUnit),
        displayType,
        usdExchangeRate: positive(status.usd_exchange_rate, DEFAULT_CURRENCY.usdExchangeRate),
        customSymbol: status.custom_currency_symbol?.trim() || DEFAULT_CURRENCY.customSymbol,
        customExchangeRate: positive(status.custom_currency_exchange_rate, DEFAULT_CURRENCY.customExchangeRate),
    };
}
export function quotaToUsd(quota, config = DEFAULT_CURRENCY) {
    return quota / config.quotaPerUnit;
}
/** Whole US cents, for components that still take cents. */
export function quotaToUsdCents(quota, config = DEFAULT_CURRENCY) {
    return Math.round(quotaToUsd(quota, config) * 100);
}
function fractionDigits(value) {
    const abs = Math.abs(value);
    if (abs === 0 || abs >= 1)
        return 2;
    if (abs >= 0.01)
        return 4;
    return 6;
}
function formatAmount(value) {
    const digits = fractionDigits(value);
    return value.toLocaleString("en-US", { minimumFractionDigits: Math.min(2, digits), maximumFractionDigits: digits });
}
/** Display a USD amount in the configured currency (never as tokens). */
export function formatUsdAmount(usd, config = DEFAULT_CURRENCY) {
    switch (config.displayType) {
        case "CNY":
            return `¥${formatAmount(usd * config.usdExchangeRate)}`;
        case "CUSTOM":
            return `${config.customSymbol}${formatAmount(usd * config.customExchangeRate)}`;
        default:
            return `$${formatAmount(usd)}`;
    }
}
/** Display a balance/usage quota; TOKENS mode shows the raw quota. */
export function formatQuota(quota, config = DEFAULT_CURRENCY) {
    if (config.displayType === "TOKENS")
        return Math.round(quota).toLocaleString("en-US");
    return formatUsdAmount(quotaToUsd(quota, config), config);
}
