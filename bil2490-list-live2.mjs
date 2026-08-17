import fs from 'node:fs';
const env = Object.fromEntries(fs.readFileSync('infra/.vault/storefront.env','utf8').split('\n')
  .filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')).trim(), l.slice(l.indexOf('=')+1).trim()]));
const BASE='https://api.bilulu.de';
const H={'x-publishable-api-key':env.MEDUSA_PUBLISHABLE_KEY};
const rr=await fetch(`${BASE}/store/regions`,{headers:H});
const regions=(await rr.json()).regions||[];
console.log('regions', regions.map(r=>`${r.id}:${r.name}:${r.currency_code}`).join(', '));
const reg=regions[0]?.id;
const r=await fetch(`${BASE}/store/products?limit=100&region_id=${reg}&fields=*variants.calculated_price`,{headers:H});
const j=await r.json();
console.log('status',r.status,'count',j.products?.length);
for (const p of j.products||[]) {
  const prices=p.variants?.map(v=>v.calculated_price?.calculated_amount);
  console.log(`${String(p.handle||p.id).padEnd(34)} | ${(p.title||'').slice(0,38).padEnd(40)} | ${prices?.join('/')} | imgs=${p.images?.length} | stock=${p.variants?.map(v=>v.inventory_quantity??'-').join(',')}`);
}
