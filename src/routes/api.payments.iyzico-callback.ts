import { createFileRoute } from "@tanstack/react-router";
import { getAppBaseUrl, getIyziCredentials, retrieveIyziCheckout } from "@/lib/iyzico.server";

function resultRedirect(orderId?: string) {
  const target = new URL("/premium", getAppBaseUrl());
  target.searchParams.set("payment", "returned");
  if (orderId) target.searchParams.set("orderId", orderId);
  return Response.redirect(target, 303);
}

export const Route = createFileRoute("/api/payments/iyzico-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          if (!getIyziCredentials()) return resultRedirect();
          const form = await request.formData();
          const token = form.get("token");
          if (typeof token !== "string" || token.length < 10 || token.length > 512)
            return resultRedirect();

          const { data: order, error: orderError } = await supabaseAdmin
            .from("payment_orders")
            .select("id,amount,currency,status,provider_conversation_id,provider_token")
            .eq("provider_token", token)
            .maybeSingle();
          if (orderError || !order || !order.provider_token) return resultRedirect();

          const payment = await retrieveIyziCheckout(token, order.provider_conversation_id);
          const returnedAmount = Number(payment.paidPrice);
          const basketAmount = Number(payment.price);
          const exactOrderMatch =
            payment.basketId === order.id &&
            payment.conversationId === order.provider_conversation_id &&
            payment.currency === order.currency &&
            Number.isFinite(returnedAmount) &&
            Number.isFinite(basketAmount) &&
            Math.abs(returnedAmount - Number(order.amount)) < 0.005 &&
            Math.abs(basketAmount - Number(order.amount)) < 0.005;
          if (!exactOrderMatch) {
            await supabaseAdmin
              .from("payment_orders")
              .update({ status: "failed", updated_at: new Date().toISOString() })
              .eq("id", order.id);
            return resultRedirect(order.id);
          }

          if (
            payment.status === "success" &&
            payment.paymentStatus === "SUCCESS" &&
            payment.fraudStatus === 1 &&
            payment.paymentId
          ) {
            const { error } = await supabaseAdmin.rpc("complete_iyzico_plan_order", {
              _order_id: order.id,
              _payment_id: payment.paymentId,
              _verified_amount: returnedAmount,
              _verified_currency: payment.currency!,
            });
            if (!error) return resultRedirect(order.id);
            console.error(
              "[payments] Verified iyzico transaction could not be applied.",
              error.message,
            );
            await supabaseAdmin
              .from("payment_orders")
              .update({ status: "review", updated_at: new Date().toISOString() })
              .eq("id", order.id);
            return resultRedirect(order.id);
          }

          const status = payment.fraudStatus === 0 ? "review" : "failed";
          await supabaseAdmin
            .from("payment_orders")
            .update({ status, updated_at: new Date().toISOString() })
            .eq("id", order.id);
          return resultRedirect(order.id);
        } catch (error) {
          console.error("[payments] iyzico callback could not be verified.", error);
          try {
            return resultRedirect();
          } catch {
            return new Response("Ödeme sonucu doğrulanamadı.", { status: 503 });
          }
        }
      },
    },
  },
});
