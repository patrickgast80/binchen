import { cookies } from "next/headers";
import { createCart, getCart, type Cart } from "@/lib/medusa";

const COOKIE_NAME = "bilulu_cart_id";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 14; // 14 days

export function readCartId(): string | null {
  return cookies().get(COOKIE_NAME)?.value ?? null;
}

export function writeCartId(cartId: string): void {
  cookies().set(COOKIE_NAME, cartId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

export function clearCartId(): void {
  cookies().delete(COOKIE_NAME);
}

export async function loadCart(): Promise<Cart | null> {
  const id = readCartId();
  if (!id) return null;
  const cart = await getCart(id);
  if (!cart) {
    clearCartId();
    return null;
  }
  return cart;
}

export async function ensureCart(): Promise<Cart | null> {
  const existing = await loadCart();
  if (existing) return existing;
  const created = await createCart();
  if (!created) return null;
  writeCartId(created.id);
  return created;
}
