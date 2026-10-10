import { describe, expect, it } from "vitest";
import { maskedPercent, maskedYen } from "../src/contexts/AmountMaskContext";

describe("amount masking", () => {
  it("does not retain an amount in the masked display string", () => {
    expect(maskedYen(123_456, true)).toBe("******");
    expect(maskedPercent(12.3, true)).toBe("******");
  });
  it("formats visible values normally and preserves unavailable percentages", () => {
    expect(maskedYen(123_456, false)).toBe("123,456円");
    expect(maskedPercent(12.34, false)).toBe("12.3%");
    expect(maskedPercent(null, true)).toBe("—");
  });
});
