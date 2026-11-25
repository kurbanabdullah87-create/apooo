import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const buyerSchema = z.object({
  planCode: z.enum(["premium_monthly", "premium_annual"]),
  fullName: z.string().trim().min(5).max(120),
  identityNumber: z.string().regex(/^\d{11}$/),
  phone: z.string().trim().min(10).max(24),
  address: z.string().trim().min(10).max(400),
  city: z.string().trim().min(2).max(80),
  consent: z.literal(true),
});

function validTurkishId(value: string): boolean {
  if (!/^\d{11}$/.test(value) || value[0] === "0") return false;
  const digits = [...value].map(Number);
  const odd = digits[0]! + digits[2]! + digits[4]! + digits[6]! + digits[8]!;
  const even = digits[1]! + digits[3]! + digits[5]! + digits[7]!;
  return (
    (odd * 7 - even) % 10 === digits[9] &&
    digits.slice(0, 10).reduce((sum, n) => sum + n, 0) % 10 === digits[10]
  );
}

export const getPaymentCheckoutAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getAppBaseUrl, getIyziCredentials } = await import("@/lib/iyzico.server");
    let configured = Boolean(
      getIyziCredentials() &&
      process.env["SUPABASE_URL"] &&
      process.env["SUPABASE_SERVICE_ROLE_KEY"],
    );
    try {
      getAppBaseUrl();
    } catch {
      configured = false;
    }
    return {
      configured,
      mode: getIyziCredentials()?.sandbox ? ("sandbox" as const) : ("production" as const),
    };
  });

export const startIyzicoCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => buyerSchema.parse(input))
  .handler(async ({ data, context }) => {
    const {
      checkoutUrlIsTrusted,
      getAppBaseUrl,
      getIyziCredentials,
      initializeIyziCheckout,
      resolveRequestIp,
    } = await import("@/lib/iyzico.server");
    if (!validTurkishId(data.identityNumber))
      throw new Error("T.C. kimlik numarasını kontrol edin.");
    const credentials = getIyziCredentials();
    if (!credentials)
      throw new Error("Ödeme şu anda yapılandırılmamış. Sunucu iyzico anahtarları eksik.");
    const baseUrl = getAppBaseUrl();
    const email = typeof context.claims.email === "string" ? context.claims.email : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new Error("Hesabınızda geçerli bir e-posta bulunmalı.");

    const { data: catalog, error: catalogError } = await context.supabase.rpc("get_plan_catalog");
    if (catalogError) throw new Error("Plan fiyatı doğrulanamadı. Lütfen tekrar deneyin.");
    const plan = catalog?.find((row) => row.plan_code === data.planCode);
    if (!plan || plan.currency !== "TRY" || plan.amount <= 0)
      throw new Error("Seçilen plan fiyatı kullanılamıyor.");
    const { data: campaigns } = await context.supabase.rpc("list_plan_campaigns");
    const now = Date.now();
    const discount = Math.max(
      0,
      ...(campaigns ?? [])
        .filter(
          (campaign) =>
            campaign.enabled &&
            new Date(campaign.starts_at).getTime() <= now &&
            new Date(campaign.ends_at).getTime() > now &&
            (campaign.applies_to === "all" || campaign.applies_to === data.planCode),
        )
        .map((campaign) => campaign.discount_percent),
    );
    const amount = Number(((plan.amount * (100 - discount)) / 100).toFixed(2));
    const [name, ...surnameParts] = data.fullName.trim().split(/\s+/);
    const surname = surnameParts.join(" ");
    if (!name || !surname) throw new Error("Fatura için ad ve soyadı birlikte girin.");
    const phoneDigits = data.phone.replace(/\D/g, "");
    const gsmNumber = phoneDigits.startsWith("90")
      ? `+${phoneDigits}`
      : phoneDigits.startsWith("0")
        ? `+9${phoneDigits}`
        : `+90${phoneDigits}`;
    if (!/^\+90\d{10}$/.test(gsmNumber))
      throw new Error("Türkiye cep telefonu numarasını 10 haneli girin.");

    const orderId = crypto.randomUUID();
    const conversationId = crypto.randomUUID();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: orderError } = await supabaseAdmin.from("payment_orders").insert({
      id: orderId,
      user_id: context.userId,
      plan_code: data.planCode,
      amount,
      currency: "TRY",
      status: "pending",
      provider: "iyzico",
      provider_conversation_id: conversationId,
    });
    if (orderError)
      throw new Error("Ödeme siparişi oluşturulamadı. Veritabanı güncellemesini kontrol edin.");

    try {
      const callbackUrl = new URL("/api/payments/iyzico-callback", baseUrl).toString();
      const { getRequest } = await import("@tanstack/react-start/server");
      const request = getRequest();
      if (!request) throw new Error("Ödeme isteği doğrulanamadı. Tekrar deneyin.");
      const result = await initializeIyziCheckout({
        locale: "tr",
        conversationId,
        price: amount.toFixed(2),
        paidPrice: amount.toFixed(2),
        currency: "TRY",
        basketId: orderId,
        paymentGroup: "PRODUCT",
        callbackUrl,
        buyer: {
          id: context.userId,
          name,
          surname,
          identityNumber: data.identityNumber,
          email,
          gsmNumber,
          registrationAddress: data.address,
          city: data.city,
          country: "Turkey",
          ip: resolveRequestIp(request.headers),
        },
        billingAddress: {
          address: data.address,
          contactName: data.fullName.trim(),
          city: data.city,
          country: "Turkey",
        },
        basketItems: [
          {
            id: data.planCode,
            price: amount.toFixed(2),
            name:
              data.planCode === "premium_annual" ? "Saha Premium · 12 ay" : "Saha Premium · 1 ay",
            category1: "Dijital Hizmet",
            itemType: "VIRTUAL",
          },
        ],
      });
      if (
        !result.token ||
        !result.paymentPageUrl ||
        !checkoutUrlIsTrusted(result.paymentPageUrl, credentials.sandbox)
      ) {
        throw new Error("iyzico güvenli ödeme sayfası için geçerli bir bağlantı döndürmedi.");
      }
      const { error: updateError } = await supabaseAdmin
        .from("payment_orders")
        .update({ provider_token: result.token, updated_at: new Date().toISOString() })
        .eq("id", orderId)
        .eq("user_id", context.userId);
      if (updateError) throw new Error("Ödeme oturumu kaydedilemedi. Yeni sipariş başlatın.");
      return {
        checkoutUrl: result.paymentPageUrl,
        orderId,
        mode: credentials.sandbox ? ("sandbox" as const) : ("production" as const),
      };
    } catch (error) {
      await supabaseAdmin
        .from("payment_orders")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", orderId);
      throw error instanceof Error ? error : new Error("Güvenli ödeme başlatılamadı.");
    }
  });
