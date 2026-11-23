import { describe, expect, it } from "vitest";
import { bankMovementFingerprint, countPotentialBankMovementDuplicates } from "./bank";

describe("bankMovementFingerprint", () => {
  const movement = {
    date: "2026-11-22T10:15:00",
    direction: "outgoing" as const,
    amount: 1250,
    counterparty: "Çağrı Market",
    description: "Kart harcaması",
  };

  it("normalizes no-reference rows for safe repeat import", () => {
    expect(bankMovementFingerprint("account-a", movement)).toBe(
      bankMovementFingerprint("account-a", { ...movement, counterparty: "Cagri   Market", description: "Kart   harcaması" }),
    );
  });

  it("uses account-scoped references and keeps distinct rows separate", () => {
    expect(bankMovementFingerprint("account-a", { ...movement, reference: " EFT-123 " })).toBe(
      bankMovementFingerprint("account-a", { ...movement, reference: "eft-123" }),
    );
    expect(bankMovementFingerprint("account-a", { ...movement, reference: "EFT-123" })).not.toBe(
      bankMovementFingerprint("account-b", { ...movement, reference: "EFT-123" }),
    );
    expect(bankMovementFingerprint("account-a", movement)).not.toBe(
      bankMovementFingerprint("account-a", { ...movement, amount: 1251 }),
    );
  });

  it("reports uncertain reference-less matches for user choice", () => {
    const existing = [{ ...movement, id: "existing", owner_id: "owner", account_id: "account-a", created_at: "2026-11-22T11:00:00Z" }];
    expect(countPotentialBankMovementDuplicates(existing, [movement], "account-a")).toBe(1);
    expect(countPotentialBankMovementDuplicates(existing, [{ ...movement, reference: "STMT-1" }], "account-a")).toBe(0);
    expect(countPotentialBankMovementDuplicates(existing, [movement], "account-b")).toBe(0);
  });
});
