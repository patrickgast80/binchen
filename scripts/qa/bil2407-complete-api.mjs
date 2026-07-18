// Direct API repro of BIL-2407: create cart, add item, set address, select
// shipping, create pp_system_default session, POST /complete → expect 200.
const PK = "pk_5f4df48ccb4a5a3843410089661e694c74f1db2458ed07e1d94bfd449b14c50f";
const API = "https://api.bilulu.de";
const H = { "content-type": "application/json", "x-publishable-api-key": PK };

async function j(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { _raw: text }; }
}

async function main() {
  // 1. Region
  const rr = await fetch(`${API}/store/regions`, { headers: H });
  const rj = await j(rr);
  const de = (rj.regions || []).find((r) => r.name === "DE") || rj.regions[0];
  console.log("region:", de.id, de.name, de.currency_code);

  // 2. Product → variant
  const pr = await fetch(`${API}/store/products?fields=id,variants.id,variants.sku`, { headers: H });
  const pj = await j(pr);
  const p = pj.products[0];
  const variantId = p.variants[0].id;
  console.log("product:", p.id, "variant:", variantId);

  // 3. Create cart
  const cr = await fetch(`${API}/store/carts`, {
    method: "POST", headers: H,
    body: JSON.stringify({ region_id: de.id, currency_code: "eur" }),
  });
  const cj = await j(cr);
  const cartId = cj.cart.id;
  console.log("cart created:", cartId, "status:", cr.status);

  // 4. Add line item
  const li = await fetch(`${API}/store/carts/${cartId}/line-items`, {
    method: "POST", headers: H,
    body: JSON.stringify({ variant_id: variantId, quantity: 1 }),
  });
  console.log("add item:", li.status);

  // 5. Address + email
  const ad = await fetch(`${API}/store/carts/${cartId}`, {
    method: "POST", headers: H,
    body: JSON.stringify({
      email: "qa+bil2407@bilulu.de",
      shipping_address: { first_name: "QA", last_name: "Bil2407", address_1: "Teststr 1", postal_code: "67454", city: "Haßloch", country_code: "de", phone: "+49 6324 111111" },
      billing_address:  { first_name: "QA", last_name: "Bil2407", address_1: "Teststr 1", postal_code: "67454", city: "Haßloch", country_code: "de", phone: "+49 6324 111111" },
    }),
  });
  console.log("address:", ad.status);

  // 6. Shipping options
  const so = await fetch(`${API}/store/shipping-options?cart_id=${cartId}`, { headers: H });
  const soj = await j(so);
  const opt = soj.shipping_options[0];
  console.log("shipping option:", opt.id, opt.name, "profile:", opt.shipping_profile_id);

  const sm = await fetch(`${API}/store/carts/${cartId}/shipping-methods`, {
    method: "POST", headers: H,
    body: JSON.stringify({ option_id: opt.id }),
  });
  console.log("set shipping:", sm.status);

  // 7. Payment collection + session
  const pc = await fetch(`${API}/store/payment-collections`, {
    method: "POST", headers: H,
    body: JSON.stringify({ cart_id: cartId }),
  });
  const pcj = await j(pc);
  const collectionId = pcj.payment_collection.id;
  console.log("payment collection:", collectionId, "status:", pc.status);

  const ps = await fetch(`${API}/store/payment-collections/${collectionId}/payment-sessions`, {
    method: "POST", headers: H,
    body: JSON.stringify({ provider_id: "pp_system_default" }),
  });
  console.log("payment session:", ps.status);

  // 8. Complete
  const cmp = await fetch(`${API}/store/carts/${cartId}/complete`, {
    method: "POST", headers: H,
  });
  const cmpBody = await cmp.text();
  console.log("--- COMPLETE ---");
  console.log("status:", cmp.status);
  console.log("body:", cmpBody.slice(0, 800));

  if (cmp.status === 200) {
    try {
      const o = JSON.parse(cmpBody);
      console.log("order.id:", o.order?.id);
      console.log("order.total:", o.order?.total, o.order?.currency_code);
      console.log("order.status:", o.order?.status);
    } catch {}
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
