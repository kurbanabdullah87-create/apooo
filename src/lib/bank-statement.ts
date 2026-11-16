import type { BankDirection } from "@/lib/bank";

export interface ImportedBankMovement {
  direction: BankDirection;
  amount: number;
  date: string;
  counterparty: string;
  description: string;
  reference?: string;
  balance_after?: number;
}

const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").toLocaleLowerCase("tr-TR").replace(/[^a-z0-9]+/g, " ").trim();

function parseAmount(value: string): number | null {
  let raw = value.replace(/[₺\s]/g, "").replace(/TRY|TL/gi, "").replace(/[()]/g, (m) => m === "(" ? "-" : "");
  if (!raw || !/[\d]/.test(raw)) return null;
  if (raw.includes(",")) raw = raw.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(raw)) raw = raw.replace(/\./g, "");
  const amount = Number(raw);
  return Number.isFinite(amount) ? amount : null;
}

function parseDate(date: string, time = ""): string | null {
  let raw = date.trim();
  if (!time) {
    const combined = /^(.*?)[ T](\d{1,2}:\d{2}(?::\d{2})?)$/.exec(raw);
    if (combined) { raw = (combined[1] ?? raw).trim(); time = combined[2] ?? time; }
  }
  let year: number, month: number, day: number;
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(raw);
  if (match) {
    const parts = match.map(Number);
    year = parts[1] ?? 0; month = parts[2] ?? 0; day = parts[3] ?? 0;
  }
  else {
    match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(raw);
    if (!match) return null;
    day = Number(match[1]); month = Number(match[2]); year = Number(match[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
  }
  if (month < 1 || month > 12 || day < 1 || day > new Date(year, month, 0).getDate()) return null;
  const datePart = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const normalizedTime = time.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!normalizedTime) return datePart;
  const hour = Number(normalizedTime[1]), minute = Number(normalizedTime[2]), second = Number(normalizedTime[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) return datePart;
  return `${datePart}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let value = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"' && quoted) { value += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { fields.push(value.trim()); value = ""; }
    else value += char;
  }
  fields.push(value.trim());
  return fields;
}

function parseCsv(text: string): ImportedBankMovement[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const firstLine = lines[0] ?? "";
  const delimiter = [";", "\t", ","].sort((a, b) => splitCsvLine(firstLine, b).length - splitCsvLine(firstLine, a).length)[0] ?? ",";
  const headers = splitCsvLine(firstLine, delimiter).map(normalize);
  const find = (...names: string[]) => headers.findIndex((header) => names.some((name) => header === name || header.includes(name)));
  const dateIndex = find("islem tarihi", "hareket tarihi", "tarih", "date");
  const timeIndex = find("islem saati", "saat", "time");
  const descriptionIndex = find("aciklama", "islem aciklamasi", "description", "detay");
  const counterpartyIndex = find("karsi taraf", "gonderen", "gonderici", "alici", "kimden", "kime", "lehdar", "unvan", "counterparty", "beneficiary", "remitter");
  const directionIndex = find("islem yonu", "yon", "direction", "debit credit");
  const amountIndex = find("tutar", "amount", "islem miktari");
  const debitIndex = find("borc", "debit", "cikan");
  const creditIndex = find("alacak", "credit", "gelen");
  const balanceIndex = find("bakiye", "balance");
  const referenceIndex = find("referans", "dekont no", "islem no", "reference", "ref no");
  if (dateIndex < 0 || (amountIndex < 0 && debitIndex < 0 && creditIndex < 0)) return [];
  const rows: ImportedBankMovement[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line, delimiter);
    const get = (i: number) => i >= 0 ? cells[i] ?? "" : "";
    const date = parseDate(get(dateIndex), get(timeIndex));
    if (!date) continue;
    const debit = parseAmount(get(debitIndex));
    const credit = parseAmount(get(creditIndex));
    const signed = parseAmount(get(amountIndex));
    const rawAmount = credit && credit !== 0 ? Math.abs(credit) : debit && debit !== 0 ? -Math.abs(debit) : signed;
    if (rawAmount === null || rawAmount === 0) continue;
    const description = get(descriptionIndex).slice(0, 500);
    const counterparty = get(counterpartyIndex).slice(0, 120);
    const directionText = normalize(`${get(directionIndex)} ${description}`);
    const explicitlyOutgoing = /\b(giden|cikis|odeme|harcama|borc|debit|outgoing)\b/.test(directionText);
    const explicitlyIncoming = /\b(gelen|giris|tahsil|alacak|credit|incoming)\b/.test(directionText);
    const balance = parseAmount(get(balanceIndex));
    const direction = rawAmount < 0 || (explicitlyOutgoing && !explicitlyIncoming) ? "outgoing" : "incoming";
    rows.push({ direction, amount: Math.abs(rawAmount), date, counterparty, description, ...(get(referenceIndex) ? { reference: get(referenceIndex).slice(0, 120) } : {}), ...(balance !== null ? { balance_after: balance } : {}) });
  }
  return rows;
}

function parseOfx(text: string): ImportedBankMovement[] {
  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>|<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST>)/gi) ?? [];
  return blocks.flatMap((block) => {
    const value = (tag: string) => new RegExp(`<${tag}>([^<\\r\\n]+)`, "i").exec(block)?.[1]?.trim() ?? "";
    const amount = parseAmount(value("TRNAMT"));
    const rawDate = value("DTPOSTED");
    const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/.exec(rawDate);
    if (amount === null || !match) return [];
    const date = `${match[1]}-${match[2]}-${match[3]}${match[4] ? `T${match[4]}:${match[5]}:${match[6]}` : ""}`;
    const description = (value("NAME") || value("MEMO")).slice(0, 500);
    const fitid = value("FITID");
    const balance = parseAmount(value("LEDGERBAL"));
    return [{ direction: amount > 0 ? "incoming" as const : "outgoing" as const, amount: Math.abs(amount), date, counterparty: value("NAME").slice(0, 120), description, ...(fitid ? { reference: fitid.slice(0, 120) } : {}), ...(balance !== null ? { balance_after: balance } : {}) }];
  });
}

function parseQif(text: string): ImportedBankMovement[] {
  return text.split(/^\^\s*$/m).flatMap((block) => {
    const field = (key: string) => new RegExp(`^${key}(.+)$`, "m").exec(block)?.[1]?.trim() ?? "";
    const rawAmount = parseAmount(field("T"));
    const dateRaw = field("D");
    const date = parseDate(dateRaw.replace(/['-]/g, "/"));
    if (rawAmount === null || !date) return [];
    const reference = field("N");
    const payee = field("P");
    const memo = field("M");
    return [{ direction: rawAmount > 0 ? "incoming" as const : "outgoing" as const, amount: Math.abs(rawAmount), date, counterparty: payee.slice(0, 120), description: memo.slice(0, 500), ...(reference ? { reference: reference.slice(0, 120) } : {}) }];
  });
}

export function parseBankStatement(fileName: string, text: string): ImportedBankMovement[] {
  const ext = fileName.toLocaleLowerCase("tr-TR").split(".").pop();
  if (ext === "ofx" || /<OFX[\s>]/i.test(text)) return parseOfx(text);
  if (ext === "qif" || /^!Type:/m.test(text)) return parseQif(text);
  if (["csv", "txt", "tsv"].includes(ext ?? "")) return parseCsv(text);
  return [];
}

export function isSupportedBankStatement(fileName: string) {
  return /\.(csv|txt|tsv|ofx|qif|pdf)$/i.test(fileName);
}

/** Extract selectable text from a bank statement PDF locally in the browser. */
export async function parseBankStatementFile(file: File): Promise<ImportedBankMovement[]> {
  if (!/\.pdf$/i.test(file.name)) return parseBankStatement(file.name, await file.text());
  const [{ getDocument, GlobalWorkerOptions }, worker] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
  ]);
  GlobalWorkerOptions.workerSrc = worker.default;
  const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  if (pdf.numPages > 250) {
    await pdf.cleanup();
    throw new Error("Ekstre PDF'i 250 sayfadan uzun olamaz.");
  }
  const lines: Array<{ page: number; y: number; x: number; text: string }> = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      lines.push({ page: pageNumber, y: item.transform[5], x: item.transform[4], text: item.str.trim() });
    }
  }
  lines.sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const grouped: Array<{ page: number; y: number; parts: typeof lines }> = [];
  for (const item of lines) {
    let line = grouped[grouped.length - 1];
    if (!line || line.page !== item.page || Math.abs(line.y - item.y) > 3) { line = { page: item.page, y: item.y, parts: [] }; grouped.push(line); }
    line.parts.push(item);
  }
  const datePattern = /\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?/;
  const moneyPattern = /(?<![\d])[-+]?\d{1,3}(?:\.\d{3})*(?:,\d{2})|[-+]?\d+(?:[,.]\d{2})(?![\d])/g;
  const outgoingWords = /\b(giden|odeme|harcama|eft cikis|fast cikis|havale cikis|borc|cekilen)\b/i;
  const incomingWords = /\b(gelen|tahsil|para giris|eft giris|fast giris|havale giris|alacak|yatirilan)\b/i;
  const rows: ImportedBankMovement[] = [];
  for (const group of grouped) {
    const line = group.parts.map((part) => part.text).join(" ").replace(/\s+/g, " ").trim();
    const dateMatch = datePattern.exec(line);
    if (!dateMatch) continue;
    const date = parseDate(dateMatch[1] ?? "", dateMatch[2] ?? "");
    const amounts = [...line.matchAll(moneyPattern)].map((match) => ({ value: match[0], index: match.index ?? 0 }));
    if (!date || amounts.length === 0) continue;
    // In common bank statement tables the final numeric column is the running
    // balance; when present, the preceding decimal amount is the movement.
    const selected = amounts.length > 1 ? amounts[amounts.length - 2] : amounts[0];
    if (!selected) continue;
    const signed = parseAmount(selected.value);
    if (signed === null || signed === 0) continue;
    const normalizedLine = normalize(line);
    const direction = signed < 0 || outgoingWords.test(normalizedLine)
      ? "outgoing"
      : incomingWords.test(normalizedLine) ? "incoming" : null;
    if (!direction) continue;
    const sender = /(?:gönderen|gönderici|alıcı|karşı taraf|lehdar)\s*[:：-]\s*([^|;]+)/i.exec(line)?.[1]?.trim() ?? "";
    let description = line.replace(datePattern, " ");
    for (const amount of amounts) description = description.replace(amount.value, " ");
    description = description.replace(/\s+/g, " ").trim().slice(0, 500);
    const balance = amounts.length > 1 ? parseAmount(amounts[amounts.length - 1]?.value ?? "") : null;
    rows.push({ direction, amount: Math.abs(signed), date, counterparty: sender.slice(0, 120), description, ...(balance !== null ? { balance_after: balance } : {}) });
  }
  await pdf.cleanup();
  return rows;
}
