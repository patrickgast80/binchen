"use client";

import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { useRouter } from "next/navigation";

interface PayPalButtonProps {
  clientId: string;
  orderId: string;
  cartId: string;
}

export default function PayPalButton({ clientId, orderId, cartId }: PayPalButtonProps) {
  const router = useRouter();

  return (
    <PayPalScriptProvider
      options={{
        clientId,
        currency: "EUR",
        locale: "de_DE",
        components: "buttons",
        disableFunding: "card,credit,paylater,sepa,sofort,bancontact,giropay,eps,ideal,mybank,p24,venmo",
      }}
    >
      <PayPalButtons
        style={{ layout: "vertical", shape: "rect", label: "pay" }}
        createOrder={() => Promise.resolve(orderId)}
        onApprove={async () => {
          const res = await fetch(`/api/checkout/complete`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ cartId }),
          });
          if (!res.ok) {
            const { error } = (await res.json().catch(() => ({}))) as { error?: string };
            // BIL-2502 — `via=paypal` tells the page the buyer already approved,
            // so it must not claim that nothing was charged.
            router.push(
              `/checkout/payment?error=${encodeURIComponent(error ?? "payment_failed")}&via=paypal`,
            );
            return;
          }
          const { orderId: completedOrderId } = (await res.json()) as { orderId: string };
          router.push(`/checkout/confirmation/${completedOrderId}`);
        }}
        onError={() => {
          router.push(`/checkout/payment?error=${encodeURIComponent("paypal_error")}`);
        }}
      />
    </PayPalScriptProvider>
  );
}
