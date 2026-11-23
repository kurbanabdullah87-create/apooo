import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { clearBankQueryData } from "./bank";

describe("clearBankQueryData", () => {
  it("removes only the requested owner's decrypted bank cache", () => {
    const client = new QueryClient();
    client.setQueryData(["bank-accounts", "owner-a"], [{ id: "account-a" }]);
    client.setQueryData(["bank-movements", "owner-a", "account-a"], [{ id: "movement-a", counterparty: "Sensitive" }]);
    client.setQueryData(["bank-documents", "owner-a"], [{ file_data: "secret" }]);
    client.setQueryData(["bank-movements", "owner-b", "account-b"], [{ id: "movement-b" }]);

    clearBankQueryData(client, "owner-a");

    expect(client.getQueryData(["bank-accounts", "owner-a"])).toBeUndefined();
    expect(client.getQueryData(["bank-movements", "owner-a", "account-a"])).toBeUndefined();
    expect(client.getQueryData(["bank-documents", "owner-a"])).toBeUndefined();
    expect(client.getQueryData(["bank-movements", "owner-b", "account-b"])).toEqual([{ id: "movement-b" }]);
    client.clear();
  });
});
