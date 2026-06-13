import { NextRequest, NextResponse } from "next/server";
import { clearCartId } from "@/lib/cart-cookie";
import { completeCart } from "@/lib/medusa";

export async function POST(req: NextRequest) {
  let cartId: string | undefined;
  try {
    const body = (await req.json()) as { cartId?: string };
    cartId = body.cartId;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!cartId) {
    return NextResponse.json({ error: "missing_cart_id" }, { status: 400 });
  }

  const result = await completeCart(cartId);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 422 });
  }

  clearCartId();
  return NextResponse.json({ orderId: result.order.id });
}
