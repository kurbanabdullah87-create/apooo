import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type BankDirection = "incoming" | "outgoing";
export interface BankMovement {
  id: string;
  owner_id: string;
  direction: BankDirection;
  amount: number;
  date: string;
  counterparty: string;
  description: string;
  created_at: string;
}
export type BankMovementInput = Pick<BankMovement, "direction" | "amount" | "date" | "counterparty" | "description">;

/** Resolve the active identity before showing cached query data; this avoids cross-account flashes on shared devices. */
export function useBankOwnerId() {
  const [ownerId, setOwnerId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => { if (active) setOwnerId(data.user?.id ?? null); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setOwnerId(session?.user.id ?? null));
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);
  return ownerId;
}

export function useBankMovements(ownerId: string | null | undefined) {
  return useQuery({
    queryKey: ["bank-movements", ownerId],
    enabled: Boolean(ownerId),
    staleTime: 0,
    queryFn: async () => {
      if (!ownerId) return [];
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || auth.user?.id !== ownerId) throw new Error("Oturum değişti. Lütfen yeniden deneyin.");
      const { data, error } = await supabase.from("bank_transactions").select("*").eq("owner_id", ownerId).eq("archived", false).order("date", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        amount: Number(row.amount),
        direction: row.direction === "in" || row.direction === "incoming" ? "incoming" : "outgoing",
      })) as BankMovement[];
    },
  });
}

export function useAddBankMovement(ownerId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BankMovementInput) => {
      if (!ownerId) throw new Error("Oturum gerekli");
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || auth.user?.id !== ownerId) throw new Error("Oturum değişti. Lütfen yeniden deneyin.");
      const { data: accounts, error: accountsError } = await supabase.from("bank_accounts").select("id").eq("owner_id", ownerId).eq("archived", false).order("created_at", { ascending: true }).limit(1);
      if (accountsError) throw accountsError;
      let accountId = accounts?.[0]?.id;
      if (!accountId) {
        const { data: account, error } = await supabase.from("bank_accounts").insert({ owner_id: ownerId, bank_name: "Elle kayıt", account_name: "Kişisel hesap", iban: "", account_no: "" }).select("id").single();
        if (error) throw error;
        accountId = account.id;
      }
      const { error } = await supabase.from("bank_transactions").insert({
        owner_id: ownerId,
        account_id: accountId,
        date: input.date,
        description: input.description,
        counterparty: input.counterparty,
        amount: input.amount,
        direction: input.direction === "incoming" ? "in" : "out",
        type: "diger",
        source: "manual",
      });
      if (error) throw error;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["bank-movements", ownerId] }); toast.success("Hareket kaydedildi"); },
    onError: (error: Error) => toast.error(error.message || "Hareket kaydedilemedi"),
  });
}

export function useDeleteBankMovement(ownerId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!ownerId) throw new Error("Oturum gerekli");
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || auth.user?.id !== ownerId) throw new Error("Oturum değişti. Lütfen yeniden deneyin.");
      const { error } = await supabase.from("bank_transactions").delete().eq("id", id).eq("owner_id", ownerId);
      if (error) throw error;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["bank-movements", ownerId] }); toast.success("Hareket silindi"); },
    onError: (error: Error) => toast.error(error.message || "Hareket silinemedi"),
  });
}
