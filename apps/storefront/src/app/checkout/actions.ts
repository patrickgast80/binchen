"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setShippingMethod, updateCart, type CartAddress } from "@/lib/medusa";
import { loadCart } from "@/lib/cart-cookie";

export interface AddressFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

function readAddressForm(formData: FormData): {
  address: CartAddress;
  email: string;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  const required = ["email", "first_name", "last_name", "address_1", "postal_code", "city"];
  for (const field of required) {
    const v = String(formData.get(field) ?? "").trim();
    if (!v) errors[field] = "Pflichtfeld";
  }

  const email = String(formData.get("email") ?? "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Ungültige E-Mail-Adresse";
  }
  const postal = String(formData.get("postal_code") ?? "").trim();
  if (postal && !/^\d{5}$/.test(postal)) {
    errors.postal_code = "PLZ muss 5 Ziffern haben";
  }

  const address: CartAddress = {
    first_name: String(formData.get("first_name") ?? "").trim(),
    last_name: String(formData.get("last_name") ?? "").trim(),
    address_1: String(formData.get("address_1") ?? "").trim(),
    address_2: String(formData.get("address_2") ?? "").trim() || null,
    postal_code: postal,
    city: String(formData.get("city") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    country_code: "de",
  };

  return { address, email, errors };
}

export async function submitAddressAction(
  _prev: AddressFormState,
  formData: FormData,
): Promise<AddressFormState> {
  const cart = await loadCart();
  if (!cart) return { error: "Dein Warenkorb ist leer." };

  const { address, email, errors } = readAddressForm(formData);
  if (Object.keys(errors).length > 0) {
    return { fieldErrors: errors };
  }

  const updated = await updateCart(cart.id, {
    email,
    shipping_address: address,
    billing_address: address,
  });
  if (!updated) return { error: "Adresse konnte nicht gespeichert werden. Bitte erneut versuchen." };

  revalidatePath("/checkout");
  return {};
}

export async function selectShippingAction(formData: FormData): Promise<void> {
  const cart = await loadCart();
  if (!cart) {
    redirect("/cart");
  }
  const optionId = String(formData.get("option_id") ?? "").trim();
  if (!optionId) return;
  await setShippingMethod(cart!.id, optionId);
  revalidatePath("/checkout");
  redirect("/checkout/payment");
}
