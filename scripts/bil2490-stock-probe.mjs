// Probe: does the boot seed (seed-inventory.js, "50 units per variant") overwrite
// the stock=1 of the handmade one-offs? Reads the live store surface, which is what
// actually gates add-to-cart.
const BACKEND = 'https://api.bilulu.de';
const KEY = process.env.MEDUSA_PUBLISHABLE_KEY;
const r = await fetch(`${BACKEND}/store/products?limit=100&fields=id,title,handle,*variants,*variants.inventory_quantity,*variants.manage_inventory`, {
  headers: { 'x-publishable-api-key': KEY },
});
const b = await r.json();
console.log('status', r.status, 'count', b.count);
for (const p of b.products ?? []) {
  for (const v of p.variants ?? []) {
    console.log(
      String(v.inventory_quantity).padStart(5),
      `manage=${String(v.manage_inventory).padEnd(5)}`,
      `allow_backorder=${String(v.allow_backorder).padEnd(5)}`,
      `${p.title.slice(0, 44)} / ${(v.title ?? '').slice(0, 28)}`
    );
  }
}
