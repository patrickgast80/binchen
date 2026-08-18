// BIL-2490: homepage assertion after deleting the 13 legacy articles.
// Product cards are rendered from the Next flight payload, so plain href scraping
// misses them — match the product ids directly instead.
const DELETED = {
  'Pastell-Aquarell': 'turban-pastell-aquarell', 'Rosen" rosa': 'pumphose-rosen-rosa',
  'Wildblumen" creme': 'pumphose-wildblumen-weiss', 'Wale': 'pumphose-wale-*',
  'Vintage-Rosen': 'pumphose-vintage-rosen', 'Anker': 'pumphose-anker-sterne',
  'Pferde': 'pumphose-pferde-blumen', 'Regenbogen & Wolken': 'pumphose-regenbogen-wolken',
  'Füchse': 'pumphose-fuechse-waldgeist', 'Erdbeeren': 'pumphose-erdbeeren',
};

for (const [path, label] of [['/', 'homepage'], ['/fruehchen', 'fruehchen']]) {
  const r = await fetch('https://bilulu.de' + path);
  const t = await r.text();
  const ids = new Set([...t.matchAll(/prod_[A-Z0-9]{20,}/g)].map((m) => m[0]));
  const hits = Object.keys(DELETED).filter((k) => t.includes(k));
  console.log(`${label.padEnd(10)} HTTP ${r.status}  distinct product ids: ${ids.size}  deleted-article mentions: ${hits.length ? hits.join(', ') : 'NONE'}`);
}
