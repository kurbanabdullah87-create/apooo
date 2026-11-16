import type { BankDirection } from "@/lib/bank";

export interface ParsedBankSms {
  amount: number;
  direction: BankDirection;
  date: string | null;
}

/** Best-effort local extraction only. Never treat an SMS as verified bank data. */
export function parseBankSms(text: string): ParsedBankSms | null {
  const normalized = text.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > 4000) return null;

  const money = normalized.match(/(?:tutar(?:ı|i)?\s*[:=]?\s*)(\d[\d.,]*)\s*(?:TL|TRY|₺)?|(?<![\d/])(\d[\d.,]*)\s*(?:TL|TRY|₺)(?!\w)/i);
  const rawAmount = money?.[1] ?? money?.[2];
  if (!rawAmount) return null;
  const canonical = rawAmount.includes(",") && rawAmount.includes(".")
    ? rawAmount.replace(/\./g, "").replace(",", ".")
    : rawAmount.includes(",")
      ? /,\d{1,2}$/.test(rawAmount) ? rawAmount.replace(",", ".") : rawAmount.replace(/,/g, "")
      : rawAmount.includes(".") && !/\.\d{1,2}$/.test(rawAmount) ? rawAmount.replace(/\./g, "") : rawAmount;
  const amount = Number(canonical);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 99_999_999.99) return null;

  const lower = normalized.toLocaleLowerCase("tr-TR");
  const outgoing = /harcama|alışveriş|odeme|ödeme|gönder|transfer|eft|havale|fast|hesabınızdan|kartınızdan|çekim/.test(lower);
  const incoming = /hesabınıza|hesabiniza|yatırıldı|yatirildi|gelen para|para girişi|iade edildi|tahsil edildi/.test(lower);
  if (outgoing === incoming) return null;

  const dateMatch = normalized.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/);
  let date: string | null = null;
  if (dateMatch) {
    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    let year = Number(dateMatch[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    const candidate = new Date(year, month - 1, day);
    if (candidate.getFullYear() === year && candidate.getMonth() === month - 1 && candidate.getDate() === day) {
      date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return { amount, direction: outgoing ? "outgoing" : "incoming", date };
}
