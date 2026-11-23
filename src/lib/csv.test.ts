import { describe, expect, it } from "vitest";
import { buildSafeCsv } from "./csv";

describe("buildSafeCsv", () => {
  it("quotes delimiters and neutralizes spreadsheet formula prefixes", () => {
    const csv = buildSafeCsv([["Müşteri", "Tutar"], ["=HYPERLINK(\"https://evil.test\")", "-20,00"]]);
    expect(csv).toContain("\uFEFF");
    expect(csv).toContain('"\'=HYPERLINK(""https://evil.test"")"');
    expect(csv).toContain('"\'-20,00"');
  });
});
