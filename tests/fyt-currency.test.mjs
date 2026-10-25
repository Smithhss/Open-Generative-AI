import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CURRENCY, currencyConfigFromStatus, formatQuota, formatUsdAmount, quotaToUsd, quotaToUsdCents, } from "../lib/fyt/currency.mjs";
describe("currency", () => {
    it("converts quota to USD with the default 500000 quota per dollar", () => {
        assert.equal(quotaToUsd(5_000_000), 10);
        assert.equal(quotaToUsdCents(10_000_000), 2000);
    });
    it("reads the display settings from /api/status and ignores invalid values", () => {
        const config = currencyConfigFromStatus({
            quota_per_unit: 0,
            quota_display_type: "CNY",
            usd_exchange_rate: 7.3,
            custom_currency_symbol: "  ",
        });
        assert.equal(config.quotaPerUnit, DEFAULT_CURRENCY.quotaPerUnit);
        assert.equal(config.displayType, "CNY");
        assert.equal(config.usdExchangeRate, 7.3);
        assert.equal(config.customSymbol, DEFAULT_CURRENCY.customSymbol);
        assert.equal(currencyConfigFromStatus({ quota_display_type: "EUR" }).displayType, "USD");
    });
    it("formats balances in each display type", () => {
        const base = currencyConfigFromStatus({ quota_per_unit: 500_000, usd_exchange_rate: 7.3 });
        assert.equal(formatQuota(5_000_000, base), "$10.00");
        assert.equal(formatQuota(5_000_000, { ...base, displayType: "CNY" }), "¥73.00");
        assert.equal(formatQuota(5_000_000, { ...base, displayType: "CUSTOM", customSymbol: "€", customExchangeRate: 0.9 }), "€9.00");
        assert.equal(formatQuota(5_000_000, { ...base, displayType: "TOKENS" }), "5,000,000");
    });
    it("keeps enough precision for sub-cent usage costs", () => {
        assert.equal(formatUsdAmount(0.000123), "$0.000123");
        assert.equal(formatUsdAmount(0.0425), "$0.0425");
        assert.equal(formatUsdAmount(1234.5), "$1,234.50");
    });
});
