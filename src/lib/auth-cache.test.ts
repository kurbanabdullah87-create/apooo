import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { clearQueriesForIdentityChange } from "./auth-cache";

describe("identity query cache isolation", () => {
  it("clears in-memory user data on sign-out and identity switch", () => {
    const client = new QueryClient();
    client.setQueryData(["customers"], [{ id: "private" }]);
    expect(clearQueriesForIdentityChange(client, "user-a", null, "SIGNED_OUT")).toBe(true);
    expect(client.getQueryData(["customers"])).toBeUndefined();

    client.setQueryData(["work", "job"], [{ id: "team-a" }]);
    expect(clearQueriesForIdentityChange(client, "user-a", "user-b", "SIGNED_IN")).toBe(true);
    expect(client.getQueryData(["work", "job"])).toBeUndefined();
    client.clear();
  });

  it("preserves cache for the same signed-in identity", () => {
    const client = new QueryClient();
    client.setQueryData(["customers"], [{ id: "private" }]);
    expect(clearQueriesForIdentityChange(client, "user-a", "user-a", "TOKEN_REFRESHED")).toBe(false);
    expect(client.getQueryData(["customers"])).toEqual([{ id: "private" }]);
    client.clear();
  });
});
