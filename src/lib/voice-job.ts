import type { Customer } from "@/lib/data";
import type { Payload } from "@/lib/work";

export interface VoiceJobDraft {
  customer?: Customer | undefined;
  title: string;
  plannedHours?: number | undefined;
  price?: number | undefined;
  paymentMethod?: string | undefined;
  notes: string;
}

const norm = (value: string) => value.normalize("NFKC").toLocaleLowerCase("tr-TR").replace(/[İI]/g, "i").replace(/ı/g, "i").replace(/\s+/g, " ").trim();

function parseAmount(raw: string) {
  const value = raw.replace(/\s/g, "");
  const canonical = value.includes(",") && value.includes(".")
    ? value.lastIndexOf(",") > value.lastIndexOf(".") ? value.replace(/\./g, "").replace(",", ".") : value.replace(/,/g, "")
    : value.includes(",") ? /,\d{1,2}$/.test(value) ? value.replace(",", ".") : value.replace(/,/g, "")
      : value.includes(".") && !/\.\d{1,2}$/.test(value) ? value.replace(/\./g, "") : value;
  const amount = Number(canonical);
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
}

export function parseVoiceJob(text: string, customers: Customer[]): VoiceJobDraft {
  let remaining = text.normalize("NFKC").trim();
  const normalized = norm(remaining);
  const customer = [...customers].sort((a, b) => b.name.length - a.name.length).find((c) => normalized.includes(norm(c.name)));
  if (customer) remaining = remaining.replace(new RegExp(customer.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " ");
  let plannedHours: number | undefined;
  const duration = remaining.match(/\b(\d+(?:[.,]\d+)?)\s*(saat|sa|dakika|dk)\b/i);
  if (duration?.[1] && duration[2] && duration[0]) {
    plannedHours = Number(duration[1].replace(",", ".")) * (/^(dk|dakika)$/i.test(duration[2]) ? 1 / 60 : 1);
    remaining = remaining.replace(duration[0], " ");
  }
  let price: number | undefined;
  const money = remaining.match(/\b(\d[\d.,]*)\s*(?:₺|tl\b|lira\b)/i);
  if (money?.[1] && money[0]) { price = parseAmount(money[1]); remaining = remaining.replace(money[0], " "); }
  let paymentMethod: string | undefined;
  const method = remaining.match(/\b(nakit|kart|kredi kartı|havale|eft|fast)\b/i);
  if (method?.[1] && method[0]) { paymentMethod = method[1].toLocaleLowerCase("tr-TR"); remaining = remaining.replace(method[0], " "); }
  if (customer) remaining = remaining.replace(/\b(müşteri|bey|hanım|abi)\b/gi, " ");
  const title = remaining.replace(/[.,;]+/g, " ").replace(/\s+/g, " ").trim();
  return { customer, title: title || "Saha işi", plannedHours, price, paymentMethod, notes: text.trim() };
}

export function applyVoiceJob(form: Payload, draft: VoiceJobDraft): Payload {
  return {
    ...form,
    ...(draft.customer ? { customer_id: draft.customer.id, address: draft.customer.address ?? "" } : {}),
    title: draft.title,
    ...(draft.plannedHours != null ? { planned_hours: draft.plannedHours } : {}),
    ...(draft.price != null ? { price: draft.price } : {}),
    ...(draft.paymentMethod ? { payment_method: draft.paymentMethod } : {}),
    notes: draft.notes,
  };
}
