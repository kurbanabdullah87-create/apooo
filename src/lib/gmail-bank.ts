import type { ImportedBankMovement } from "@/lib/bank-statement";

const GOOGLE_GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
// Public OAuth client ID from the user's Google Cloud web client; client IDs are not secrets.
const GOOGLE_GMAIL_CLIENT_ID = "1002878230023-94i9kq71q7npqv1iniqbnvj5sich6p41.apps.googleusercontent.com";
const GMAIL_SEARCH = 'newer_than:365d {subject:işlem subject:harcama subject:transfer subject:FAST subject:EFT subject:ödeme subject:"hesap hareketi" subject:transaction subject:payment}';

type GoogleTokenResponse = { access_token?: string; error?: string; error_description?: string };
type GoogleTokenClient = { requestAccessToken: (options?: { prompt?: string }) => void };
type GmailHeader = { name?: string; value?: string };
type GmailPart = { mimeType?: string; filename?: string; body?: { data?: string; attachmentId?: string }; parts?: GmailPart[] };
type GmailMessage = { id: string; internalDate?: string; payload?: { headers?: GmailHeader[]; mimeType?: string; body?: { data?: string }; parts?: GmailPart[] } };
type GmailApiError = { error?: { status?: string; message?: string; errors?: Array<{ reason?: string }> } };
export type GmailJobRequest = { id: string; subject: string; sender: string; receivedAt: string; excerpt: string };

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: { initTokenClient: (options: {
      client_id: string;
      scope: string;
      include_granted_scopes?: boolean;
      callback: (response: GoogleTokenResponse) => void;
      error_callback?: (error: { type?: string; message?: string }) => void;
    }) => GoogleTokenClient } } };
  }
}

const GOOGLE_SCRIPT = "https://accounts.google.com/gsi/client";
let googleScriptPromise: Promise<void> | undefined;

function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;
  googleScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_SCRIPT}"]`);
    const script = existing ?? document.createElement("script");
    script.src = GOOGLE_SCRIPT;
    script.async = true;
    script.defer = true;
    script.onload = () => window.google?.accounts?.oauth2 ? resolve() : reject(new Error("Google kimlik hizmeti yüklenemedi."));
    script.onerror = () => reject(new Error("Google kimlik hizmetine ulaşılamadı."));
    if (!existing) document.head.append(script);
  }).catch((error: unknown) => {
    googleScriptPromise = undefined;
    throw error;
  });
  return googleScriptPromise!;
}

function requestAccessToken(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) return reject(new Error("Google izin ekranı başlatılamadı."));
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: `openid email ${GOOGLE_GMAIL_SCOPE}`,
      include_granted_scopes: true,
      callback: (response) => {
        if (response.error || !response.access_token) return reject(new Error(response.error_description || "Gmail izni verilmedi."));
        resolve(response.access_token);
      },
      error_callback: (error) => reject(new Error(error.message || "Google izin penceresi kapatıldı.")),
    });
    client.requestAccessToken({ prompt: "select_account consent" });
  });
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function collectMimeText(part: GmailPart | undefined, mimeType: "text/plain" | "text/html"): string[] {
  if (!part) return [];
  const own = part.mimeType === mimeType && part.body?.data ? [decodeBase64Url(part.body.data)] : [];
  return [...own, ...(part.parts ?? []).flatMap((child) => collectMimeText(child, mimeType))];
}

function header(message: GmailMessage, name: string) {
  return message.payload?.headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function parseDate(text: string): string | undefined {
  const match = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(text);
  if (!match) return undefined;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += year < 70 ? 2000 : 1900;
  if (month < 1 || month > 12 || day < 1 || day > new Date(year, month, 0).getDate()) return undefined;
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (!match[4]) return date;
  const hour = Number(match[4]), minute = Number(match[5]), second = Number(match[6] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) return date;
  return `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

function parseAmount(text: string): number | undefined {
  const pattern = /(?:₺\s*([\d.,]+)|([\d.,]+)\s*(?:TL|TRY|₺))/gi;
  const matches = [...text.matchAll(pattern)];
  const hinted = matches.filter((match) => /(?:tutar|harcama|işlem miktarı|islem tutari|ödeme tutarı|odeme tutari|amount)\s*[:=-]?\s*$/i.test(text.slice(Math.max(0, (match.index ?? 0) - 48), match.index ?? 0)));
  const match = hinted.length === 1 ? hinted[0] : matches.length === 1 ? matches[0] : undefined;
  const raw = match?.[1] ?? match?.[2];
  if (!raw) return undefined;
  let normalized = raw.replace(/\s/g, "");
  if (normalized.includes(",")) normalized = normalized.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(?:\.\d{3})+$/.test(normalized)) normalized = normalized.replace(/\./g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
}

function parseCounterparty(text: string): string {
  const match = /(?:alıcı|gönderen|gönderici|karşı taraf|lehdar|işyeri|üye işyeri|merchant)\s*[:：-]?\s*([^\n.;,]{2,100})/i.exec(text);
  return match?.[1]?.trim().replace(/\s+/g, " ").slice(0, 120) ?? "";
}

function parseTransactionMessage(message: GmailMessage): ImportedBankMovement[] {
  const payload: GmailPart = {
    ...(message.payload?.mimeType ? { mimeType: message.payload.mimeType } : {}),
    ...(message.payload?.body ? { body: message.payload.body } : {}),
    ...(message.payload?.parts ? { parts: message.payload.parts } : {}),
  };
  const plainParts = collectMimeText(payload, "text/plain");
  const parts = plainParts.length ? plainParts : collectMimeText(payload, "text/html");
  const subject = header(message, "Subject");
  const from = header(message, "From");
  const body = `${subject}\n${parts.join("\n")}`.replace(/<[^>]*>/g, " ").replace(/&(?:nbsp|amp|lt|gt|quot);/gi, " ").replace(/\s+/g, " ").slice(0, 80_000);
  const normalized = body.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").toLocaleLowerCase("tr-TR");
  const outgoing = /\b(harcama|odeme|giden|gonderdiniz|gonderildi|eft cikis|fast cikis|havale cikis|kartinizla|cekildi|borc)\b/.test(normalized);
  const incoming = /\b(gelen|hesabiniza yatirildi|hesabiniza gecti|para aldiniz|tahsilat|giris|eft giris|fast giris|havale giris|alacak)\b/.test(normalized);
  if (outgoing === incoming) return [];
  const amount = parseAmount(body);
  if (!amount) return [];
  const transactionDate = parseDate(body);
  const date = transactionDate ?? (message.internalDate ? new Date(Number(message.internalDate)).toISOString() : undefined);
  if (!date) return [];
  const cleanedSubject = subject.replace(/\s+/g, " ").trim().slice(0, 180);
  const fromName = from.replace(/<[^>]*>/g, "").replace(/["']/g, "").trim().slice(0, 100);
  const description = [transactionDate ? "İşlem tarihi e-postadan alındı" : "E-posta tarihi kullanıldı", cleanedSubject, fromName].filter(Boolean).join(" · ").slice(0, 500);
  return [{
    direction: outgoing ? "outgoing" : "incoming",
    amount,
    date,
    counterparty: parseCounterparty(body),
    description,
    reference: `gmail:${message.id}`,
    ...(cleanedSubject ? { transaction_reason: cleanedSubject } : {}),
    raw_source_snippet: `${fromName} · ${cleanedSubject}`.slice(0, 300),
  }];
}

async function gmailGet<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", referrerPolicy: "no-referrer" });
  if (!response.ok) {
    let apiError: GmailApiError | undefined;
    try { apiError = await response.json() as GmailApiError; } catch { /* Google response may have no JSON body. */ }
    const reason = apiError?.error?.errors?.[0]?.reason ?? apiError?.error?.status ?? "";
    if (response.status === 401) throw new Error("Google erişim izni geçersiz veya süresi dolmuş. Banka ekranında Google ile yeniden onay ver.");
    if (response.status === 403) {
      if (["accessNotConfigured", "SERVICE_DISABLED"].includes(reason)) throw new Error("Gmail API bu Google Cloud projesinde kapalı. APIs & Services → Library → Gmail API → Enable ile etkinleştir.");
      if (["insufficientPermissions", "PERMISSION_DENIED"].includes(reason)) throw new Error("Google hesabı Gmail okuma iznini vermemiş. Google hesabındaki Saha iznini kaldırıp banka ekranından yeniden onayla.");
      if (["userRateLimitExceeded", "rateLimitExceeded", "quotaExceeded"].includes(reason)) throw new Error("Google Gmail API kullanım sınırına ulaşıldı. Bir süre bekleyip yeniden dene.");
      if (reason === "domainPolicy") throw new Error("Google Workspace yöneticin bu uygulamanın Gmail erişimini engelliyor. Yönetici izin vermeli.");
      throw new Error(`Google Gmail erişimini reddetti (${reason || "403"}). gmail.readonly izni kısıtlı bir Google kapsamıdır ve uygulama doğrulaması tamamlanmamışsa kullanıcı veya erişim sınırına takılabilir. Google Cloud → Google Auth Platform → Verification Center bölümündeki durumu kontrol et; Workspace hesabı kullanıyorsan yöneticinin uygulamaya izin verdiğinden emin ol.`);
    }
    if (response.status === 404) throw new Error("Google hesabında istenen Gmail iletisi bulunamadı. Tarama sorgusunu yeniden çalıştır.");
    throw new Error(`Gmail iletileri alınamadı (HTTP ${response.status}). Bağlantıyı kontrol edip yeniden dene.`);
  }
  return response.json() as Promise<T>;
}

/** Uses a short-lived Google access token only in memory; email bodies are parsed locally and never persisted. */
export async function scanBankEmails(): Promise<{ rows: ImportedBankMovement[]; scanned: number }> {
  await loadGoogleIdentity();
  const token = await requestAccessToken(GOOGLE_GMAIL_CLIENT_ID);
  const query = new URLSearchParams({ q: GMAIL_SEARCH, maxResults: "100" });
  const list = await gmailGet<{ messages?: Array<{ id: string }> }>(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${query}`, token);
  const ids = (list.messages ?? []).slice(0, 100);
  const messages: GmailMessage[] = [];
  for (let offset = 0; offset < ids.length; offset += 10) {
    const batch = ids.slice(offset, offset + 10);
    messages.push(...await Promise.all(batch.map(({ id }) => gmailGet<GmailMessage>(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`, token))));
  }
  const unique = new Map<string, ImportedBankMovement>();
  for (const message of messages) {
    for (const row of parseTransactionMessage(message)) unique.set(row.reference!, row);
  }
  return { rows: [...unique.values()], scanned: messages.length };
}

/** Read candidate service requests into an in-memory draft list; raw message text is never saved by this function. */
export async function scanJobRequestEmails(): Promise<GmailJobRequest[]> {
  await loadGoogleIdentity();
  const token = await requestAccessToken(GOOGLE_GMAIL_CLIENT_ID);
  const query = new URLSearchParams({ q: 'newer_than:90d {subject:servis subject:"iş talebi" subject:bakım subject:arıza subject:onarım subject:teklif}', maxResults: "30" });
  const list = await gmailGet<{ messages?: Array<{ id: string }> }>(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${query}`, token);
  const messages: GmailMessage[] = [];
  const ids = (list.messages ?? []).slice(0, 30);
  for (let offset = 0; offset < ids.length; offset += 10) {
    messages.push(...await Promise.all(ids.slice(offset, offset + 10).map(({ id }) => gmailGet<GmailMessage>(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`, token))));
  }
  return messages.map((message) => {
    const subject = header(message, "Subject").replace(/\s+/g, " ").trim().slice(0, 180) || "E-posta iş talebi";
    const sender = header(message, "From").replace(/<[^>]*>/g, "").replace(/[<>"']/g, "").trim().slice(0, 120);
    const payload: GmailPart = { ...(message.payload?.mimeType ? { mimeType: message.payload.mimeType } : {}), ...(message.payload?.body ? { body: message.payload.body } : {}), ...(message.payload?.parts ? { parts: message.payload.parts } : {}) };
    const textParts = collectMimeText(payload, "text/plain");
    const body = (textParts.length ? textParts : collectMimeText(payload, "text/html")).join("\n").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim().slice(0, 4000);
    const time = message.internalDate ? new Date(Number(message.internalDate)).toISOString() : "";
    return { id: message.id, subject, sender, receivedAt: time, excerpt: body };
  });
}
