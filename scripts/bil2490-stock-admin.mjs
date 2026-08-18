// Authoritative check: what is stocked_quantity for the handmade one-offs after
// the boot seed ran seed-inventory.js ("50 units per variant, 17 updated")?
import { BACKEND, jsonFetch, login } from '../apps/backend/scripts/bil2490/lib.mjs';

const token = await login();
const h = { authorization: `Bearer ${token}` };

const prods = await jsonFetch(
  `${BACKEND}/admin/products?limit=100&fields=id,title,status,*variants,*variants.inventory_items`,
  { headers: h }
);

const levels = await jsonFetch(`${BACKEND}/admin/inventory-items?limit=200&fields=id,sku,title,*location_levels`, { headers: h });
const byId = new Map(levels.inventory_items.map((i) => [i.id, i]));

console.log('variant'.padEnd(52), 'manage', 'stocked', 'reserved', 'available');
let over = 0;
for (const p of prods.products) {
  for (const v of p.variants) {
    const invIds = (v.inventory_items ?? []).map((x) => x.inventory_item_id ?? x.inventory?.id).filter(Boolean);
    for (const id of invIds) {
      const item = byId.get(id);
      const lv = item?.location_levels?.[0];
      const stocked = lv?.stocked_quantity;
      const reserved = lv?.reserved_quantity;
      const avail = lv?.available_quantity;
      if (typeof stocked === 'number' && stocked > 1) over++;
      console.log(
        `${p.title.slice(0, 46)}`.padEnd(52),
        String(v.manage_inventory).padEnd(6),
        String(stocked).padStart(7),
        String(reserved).padStart(8),
        String(avail).padStart(9)
      );
    }
  }
}
console.log(`\nvariants with stocked_quantity > 1: ${over}`);
