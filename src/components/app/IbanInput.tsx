import { useMemo } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const BANKS: Record<string, string> = {
  "00010": "Ziraat Bankası", "00012": "Halkbank", "00015": "VakıfBank", "00032": "TEB",
  "00046": "Akbank", "00059": "Şekerbank", "00062": "Garanti BBVA", "00064": "İş Bankası",
  "00067": "Yapı Kredi", "00099": "ING", "00111": "QNB", "00123": "HSBC", "00134": "DenizBank",
  "00203": "Albaraka Türk", "00205": "Kuveyt Türk", "00206": "Türkiye Finans", "00209": "Ziraat Katılım",
  "00210": "Vakıf Katılım", "00211": "Emlak Katılım",
};

export function normalizeIban(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

export function isValidTurkishIban(value: string) {
  const iban = normalizeIban(value);
  if (!/^TR\d{24}$/.test(iban) || iban[9] !== "0") return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = [...rearranged].map((char) => /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char).join("");
  let remainder = 0;
  for (let index = 0; index < numeric.length; index += 7) remainder = Number(`${remainder}${numeric.slice(index, index + 7)}`) % 97;
  return remainder === 1;
}

function formattedIban(value: string) {
  return normalizeIban(value).match(/.{1,4}/g)?.join(" ") ?? "";
}

export function IbanInput({ value, onChange, id = "iban" }: { value: string; onChange: (value: string) => void; id?: string }) {
  const normalized = normalizeIban(value);
  const valid = useMemo(() => normalized.length === 26 && isValidTurkishIban(normalized), [normalized]);
  const bank = normalized.startsWith("TR") ? BANKS[normalized.slice(4, 9)] : undefined;
  return <div className="space-y-2">
    <div className="flex gap-2"><Input id={id} inputMode="text" autoCapitalize="characters" autoComplete="off" maxLength={32} value={formattedIban(value)} onChange={(event) => onChange(normalizeIban(event.target.value).slice(0, 26))} placeholder="TR00 0000 0000 0000 0000 0000 00" aria-invalid={normalized.length > 0 && normalized.length === 26 && !valid} aria-describedby={`${id}-hint`}/><Button type="button" variant="outline" size="icon" aria-label="IBAN'ı kopyala" disabled={!valid} onClick={() => void navigator.clipboard.writeText(normalized).then(() => toast.success("IBAN kopyalandı")).catch(() => toast.error("Panoya kopyalanamadı"))}><Copy className="size-4"/></Button></div>
    <p id={`${id}-hint`} aria-live="polite" className={`text-xs ${valid ? "text-success" : normalized.length === 26 ? "text-destructive" : "text-muted-foreground"}`}>{normalized.length === 0 ? "TR IBAN 26 karakter olmalı; boşluklar otomatik biçimlenir." : normalized.length < 26 ? `${normalized.length}/26 karakter` : valid ? `IBAN checksum doğru${bank ? ` · ${bank}` : ""}` : "IBAN geçersiz · ülke, uzunluk veya MOD-97 kontrolü başarısız"}</p>
  </div>;
}
