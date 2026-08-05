import { describe, expect, it } from "vitest";
import { formatMoney, formatNumber, formatQuantity, formatVatRate } from "./format";

describe("formatMoney", () => {
  it("treats the amount as integer minor units (ADR-0011/0017)", () => {
    // 12345 minor units = 123,45 in the major unit — never float math.
    expect(formatMoney(12345, "EUR")).toContain("123,45");
    expect(formatMoney(0, "EUR")).toContain("0,00");
  });

  it("uses the Bulgarian locale's decimal comma", () => {
    const formatted = formatNumber(1234.5);
    expect(formatted).toContain(",5");
    expect(formatted).not.toContain(".5");
  });
});

describe("formatQuantity", () => {
  it("renders thousandths as a decimal, trailing zeros dropped (GF-09)", () => {
    expect(formatQuantity(1500)).toBe("1,5");
    expect(formatQuantity(4000)).toBe("4");
    expect(formatQuantity(2250)).toBe("2,25");
  });
});

describe("formatVatRate", () => {
  it("renders basis points as a percentage (GF-09)", () => {
    expect(formatVatRate(2000)).toContain("20");
    expect(formatVatRate(2000)).toContain("%");
    expect(formatVatRate(900)).toContain("9");
  });
});
