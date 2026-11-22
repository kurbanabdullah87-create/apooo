import type { ExpenseCategory } from "@/lib/finance";

const rules: Record<ExpenseCategory, readonly string[]> = {
  yakit: ["akaryakit", "benzin", "motorin", "mazot", "opet", "shell", "petrol", "bp", "yakıt", "yakit"],
  yemek: ["yemek", "market", "lokanta", "restoran", "kahve", "öğle", "ogle", "su alımı"],
  hirdavat: ["hırdavat", "hirdavat", "vida", "boru", "kablo", "demir", "çivi", "civi", "malzeme", "alet", "yedek parça"],
  vergi: ["vergi", "sgk", "stopaj", "damga", "harç", "harc", "muhasebe", "bağkur", "bagkur"],
  diger: [],
};

/** Explainable, offline keyword suggestion only; the user always chooses the final category. */
export function suggestExpenseCategory(description: string): ExpenseCategory | null {
  const normalized = description.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const category of ["yakit", "hirdavat", "yemek", "vergi"] as const) {
    if (rules[category].some((keyword) => normalized.includes(keyword.normalize("NFD").replace(/[\u0300-\u036f]/g, "")))) return category;
  }
  return null;
}
