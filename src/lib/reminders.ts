import { useEffect } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRecords, type Payload } from "@/lib/work";
import { formatTL, todayISO } from "@/lib/finance";

export const REMIND_OPTIONS = [
  { value: "0", label: "Tam zamanında" },
  { value: "10", label: "10 dk önce" },
  { value: "30", label: "30 dk önce" },
  { value: "60", label: "1 saat önce" },
  { value: "1440", label: "1 gün önce" },
];

export const apptStart = (p: Payload) => Date.parse(`${p.date}T${p.time || "09:00"}:00`);

export const notifySupported = () => typeof window !== "undefined" && "Notification" in window;

export async function askNotifyPermission() {
  if (!notifySupported()) return "denied" as const;
  return Notification.requestPermission();
}

/** Telefonu titret: uzun-kısa-uzun deseni */
function vibrate(pattern: number[] = [300, 100, 300, 100, 500]) {
  try {
    if ("vibrate" in navigator) navigator.vibrate(pattern);
  } catch { /* desteklenmiyor */ }
}

async function show(title: string, body: string, tag: string, urgent = false) {
  if (!notifySupported() || Notification.permission !== "granted") return;
  const opts: NotificationOptions & { vibrate?: number[] } = {
    body,
    tag,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: "/randevu" },
    vibrate: urgent ? [400, 100, 400, 100, 600] : [200, 100, 200],
    requireInteraction: urgent, // acil bildirimlerde ekranda kalır
    silent: false,
  };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, opts);
      vibrate(opts.vibrate as number[]);
      return;
    }
    vibrate(opts.vibrate as number[]);
    const n = new Notification(title, opts);
    n.onclick = () => { window.focus(); location.assign("/randevu"); };
  } catch { /* bildirim gösterilemedi */ }
}

const seen = (k: string) => { try { return localStorage.getItem(k) === "1"; } catch { return false; } };
const mark = (k: string) => { try { localStorage.setItem(k, "1"); } catch { /* yok say */ } };

/** Uygulama açıkken (veya arka plandayken) 30 sn'de bir randevuları kontrol eder. */
export function useAppointmentReminders(enabled: boolean, onOpen: () => void) {
  const recs = useRecords("appointment");
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      const now = Date.now();
      for (const r of recs.data ?? []) {
        if (r.payload.status !== "Bekliyor" || r.payload.archived) continue;
        const start = apptStart(r.payload);
        if (!Number.isFinite(start) || now > start + 2 * 3600_000) continue;
        const lead = Number(r.payload.remind ?? 30) * 60_000;
        const name = String(r.payload.name);
        const at = String(r.payload.time ?? "");
        const stages: [string, boolean, string, string, boolean][] = [
          [`pre:${lead}`, lead > 0 && now >= start - lead && now < start, "⏰ Randevu Yaklaşıyor", `${name} · saat ${at}`, false],
          ["now", now >= start, "🔔 Randevu Zamanı Geldi!", `${name} · işi başlatabilirsiniz`, true],
        ];
        for (const [stage, due, title, body, urgent] of stages) {
          const key = `ap:${r.id}:${r.payload.date}${r.payload.time}:${stage}`;
          if (!due || seen(key)) continue;
          mark(key);
          void show(title, body, key, urgent);
          vibrate(urgent ? [300, 100, 300, 100, 500] : [200, 100, 200]);
          toast(title, {
            description: `${name} · ${at}`,
            duration: urgent ? 20000 : 15000,
            action: { label: "Aç", onClick: onOpen },
          });
        }
      }
    };
    tick();
    const t = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [enabled, recs.data, onOpen]);
}

/** Taksit vadelerini uygulama açıkken kontrol eder; ayrıntılı bildirim merkezinde ayrıca listelenir. */
export function useDebtReminders(enabled: boolean, onOpen: () => void) {
  const installments = useQuery({
    queryKey: ["debt-installments"], enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("debt_installments").select("id,debt_id,installment_no,amount,paid_amount,due_on");
      if (error) throw error;
      return data ?? [];
    },
  });
  const debts = useQuery({
    queryKey: ["debt-records"], enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("debt_records").select("id,name,direction");
      if (error) throw error;
      return data ?? [];
    },
  });
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      const today = todayISO();
      const names = new Map((debts.data ?? []).map((d) => [d.id, d]));
      for (const installment of installments.data ?? []) {
        if (installment.due_on !== today || Number(installment.amount) <= Number(installment.paid_amount)) continue;
        const key = `debt-due:${installment.id}:${today}`;
        if (seen(key)) continue;
        mark(key);
        const debt = names.get(installment.debt_id);
        const detail = `${debt?.name ?? "Borç / alacak"} · ${debt?.direction === "payable" ? "ödenecek" : "tahsil edilecek"} · ${installment.installment_no}. taksit · kalan ${formatTL(Number(installment.amount) - Number(installment.paid_amount))}`;
        const title = "🔔 Taksit vadesi bugün";
        void (async () => {
          if (notifySupported() && Notification.permission === "granted") {
            try {
              const options: NotificationOptions = { body: detail, tag: key, icon: "/icon-192.png", data: { url: "/borc" }, requireInteraction: true };
              const registration = await navigator.serviceWorker?.getRegistration();
              if (registration) await registration.showNotification(title, options);
              else new Notification(title, options).onclick = () => { window.focus(); location.assign("/borc"); };
            } catch { /* bildirim izni veya platform desteği olmayabilir */ }
          }
        })();
        toast(title, { description: detail, duration: 20_000, action: { label: "Aç", onClick: onOpen } });
      }
    };
    tick();
    const timer = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [debts.data, enabled, installments.data, onOpen]);
}
