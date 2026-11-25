type IyziCredentials = { apiKey: string; secretKey: string; baseUrl: string; sandbox: boolean };

export type IyziPayload = Record<string, unknown>;

const API_PATH = "/payment/iyzipos/checkoutform";

export function getIyziCredentials(): IyziCredentials | null {
  const apiKey = process.env["IYZICO_API_KEY"]?.trim();
  const secretKey = process.env["IYZICO_SECRET_KEY"]?.trim();
  const mode = process.env["IYZICO_ENV"]?.trim().toLowerCase();
  if (!apiKey || !secretKey || (mode !== "sandbox" && mode !== "production")) return null;
  return {
    apiKey,
    secretKey,
    sandbox: mode === "sandbox",
    baseUrl: mode === "sandbox" ? "https://sandbox-api.iyzipay.com" : "https://api.iyzipay.com",
  };
}

export function getAppBaseUrl(): URL {
  const configured = process.env["APP_BASE_URL"]?.trim();
  if (!configured) throw new Error("APP_BASE_URL sunucu ayarında eksik.");
  const url = new URL(configured);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("APP_BASE_URL HTTPS kullanmalıdır.");
  }
  if (url.pathname !== "/" || url.search || url.hash)
    throw new Error("APP_BASE_URL yalnızca uygulamanın kök adresi olmalıdır.");
  return url;
}

function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sign(secretKey: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
  );
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function iyziRequest<T>(path: string, body: IyziPayload): Promise<T> {
  const credentials = getIyziCredentials();
  if (!credentials) throw new Error("iyzico sunucu anahtarları ayarlı değil.");
  const bodyText = JSON.stringify(body);
  const nonce = randomKey();
  const signature = await sign(credentials.secretKey, `${nonce}${path}${bodyText}`);
  const encoded = btoa(`apiKey:${credentials.apiKey}&randomKey:${nonce}&signature:${signature}`);
  const response = await fetch(`${credentials.baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `IYZWSv2 ${encoded}`,
      "x-iyzi-rnd": nonce,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: bodyText,
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const result = (await response.json().catch(() => null)) as
    (T & { status?: string; errorMessage?: string }) | null;
  if (!response.ok || !result || result.status !== "success") {
    const detail = result?.errorMessage;
    throw new Error(
      typeof detail === "string"
        ? `iyzico: ${detail}`
        : `iyzico isteği başarısız (${response.status}).`,
    );
  }
  return result;
}

export type IyziInitResponse = {
  status: "success";
  token: string;
  paymentPageUrl?: string;
  checkoutFormContent?: string;
  conversationId?: string;
};

export type IyziRetrieveResponse = {
  status: "success";
  paymentStatus?: string;
  paymentId?: string;
  conversationId?: string;
  basketId?: string;
  price?: number | string;
  paidPrice?: number | string;
  currency?: string;
  fraudStatus?: number;
};

export function initializeIyziCheckout(body: IyziPayload) {
  return iyziRequest<IyziInitResponse>(`${API_PATH}/initialize/auth/ecom`, body);
}

export function retrieveIyziCheckout(token: string, conversationId: string) {
  return iyziRequest<IyziRetrieveResponse>(`${API_PATH}/auth/ecom/detail`, {
    locale: "tr",
    conversationId,
    token,
  });
}

export function resolveRequestIp(headers: Headers): string {
  const forwarded = headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const candidate =
    headers.get("cf-connecting-ip") ?? headers.get("x-real-ip") ?? forwarded?.at(-1);
  if (!candidate) return "127.0.0.1";
  return candidate.length <= 45 && /^[0-9a-fA-F:.]+$/.test(candidate) ? candidate : "127.0.0.1";
}

export function checkoutUrlIsTrusted(value: string, sandbox: boolean): boolean {
  try {
    const url = new URL(value);
    const allowed = sandbox
      ? [
          "sandbox-api.iyzipay.com",
          "sandbox-merchantgw.iyzipay.com",
          "sandbox-merchant.iyzipay.com",
        ]
      : ["api.iyzipay.com", "merchant.iyzipay.com", "merchantgw.iyzipay.com"];
    return url.protocol === "https:" && allowed.includes(url.hostname);
  } catch {
    return false;
  }
}
