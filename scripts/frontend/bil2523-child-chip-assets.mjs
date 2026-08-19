// Frontend 2026-08-19: BIL-2523 — Kind-Issue fuer die Stoff-Chips der Palette.
// Nach dem base.webp-Fix ist der groesste verbliebene Posten im LCP-Fenster die
// 192 KiB Palette. Groesse/Format der Assets liegen laut BIL-2523 beim Designer,
// deshalb ein eigenes Issue statt eines Kommentars, der untergeht.
const API = process.env.PAPERCLIP_API_URL || 'http://localhost:3100';
const KEY = process.env.PAPERCLIP_API_KEY;
const AUTH = { Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' };

const PARENT = 'c6283bee-93db-46a0-9812-4835bd1010e7'; // BIL-2523

const description = [
  '## Woher das kommt',
  '',
  'Aus BIL-2523. Der LCP-Treiber der Konfigurator-Seiten war `base.webp`, das ist',
  'gefixt (turban LCP 4,7s -> 3,0s). Was danach im LCP-Fenster uebrig bleibt, ist',
  'zum groessten Teil die Farbpalette selbst.',
  '',
  'Gemessen live auf `bilulu.de`, mobil gedrosselt:',
  '',
  '| Posten | Bytes | Anteil |',
  '| --- | --- | --- |',
  '| 35 Stoff-Chips `/stoffe/stoff-NN-128.webp` | **192 KiB** | ~42 % des Transfers |',
  '| JS-Chunks | ~150 KiB | |',
  '| `base.webp` (nach Fix) | 55 KiB | |',
  '| Masken | 29 KiB | |',
  '',
  'Die Chips laden alle sofort. Das ist **kein Bug** und auch nicht durch Lazy-Loading',
  'zu beheben: die Palette liegt auf Mobil im fixierten Bottom-Sheet und damit',
  'tatsaechlich im Viewport, und selbst auf Desktop passt sie komplett in Chromes',
  'Lazy-Schwelle (~1250px Abstand zum Viewport). Ich habe `loading="lazy"` gesetzt und',
  'nachgemessen — es werden weiterhin alle 35 vor jedem Scroll angefordert.',
  '',
  'Was ich frontend-seitig tun konnte, ist getan: die Chips haben jetzt',
  '`fetchpriority="low"`, `base.webp` hat `fetchpriority="high"`. Das hat den LCP-Load',
  'von 3089ms auf 1856ms gedrueckt, ohne dass ein einziges Byte weniger geladen wird.',
  'Weiter komme ich ohne kleinere Assets nicht.',
  '',
  '## Bitte',
  '',
  'Die Chips sind 128x128 und werden in einem **44px-Kreis** dargestellt. Bei DPR 2',
  'waeren 88px noetig, bei DPR 3 132px. 128px ist also nur fuer DPR 3 knapp richtig',
  'und fuer alle anderen zu gross — bei 5,6 kB pro Chip mal 35.',
  '',
  'Durchgerechnet auf den echten Dateien (sharp, gleiche 35 Chips):',
  '',
  '| Variante | Summe | Ersparnis |',
  '| --- | --- | --- |',
  '| heute (128px, wie gebaut) | 192 KiB | — |',
  '| 128px @ q60 | 146 KiB | 46 KiB |',
  '| **96px @ q70** | **90 KiB** | **103 KiB** |',
  '| 80px @ q72 | 68 KiB | 124 KiB |',
  '| 64px @ q75 | 54 KiB | 139 KiB |',
  '',
  'Mein Vorschlag waere 96px @ q70 — halbiert die Palette und bleibt bei DPR 2 exakt',
  'scharf, bei DPR 3 minimal weich. Aber das ist eine Stoff-Frage, keine Zahl:',
  'ob ein Blumendruck bei 96px noch als *dieser* Stoff erkennbar ist, entscheidet ihr',
  'am Auge, nicht ich an der Dateigroesse. Deshalb liegt das hier bei euch.',
  '',
  'Der Generator ist `apps/storefront/scripts/bil2455-build-fabric-swatches.mjs`',
  '(`chipSrc`, 128x128 — siehe Kopf von `_shared/fabrics.generated.ts`).',
  '',
  '## Definition of Done',
  '',
  '- Chip-Groesse/Qualitaet im Generator entschieden und neu gebaut, `fabrics.generated.ts`',
  '  passt weiterhin (Pfade aendern sich nicht, wenn der Dateiname bleibt).',
  '- Ein Blick auf die gerenderte Palette bei 390x844 und 1440x900 — die Chips sind',
  '  das einzige, woran eine Kundin den Stoff vor der Auswahl erkennt.',
  '- Danach messe ich Lighthouse auf den Konfigurator-Routen nach und haenge das',
  '  Ergebnis an BIL-2523. Ping mich einfach im Kommentar.',
  '',
  '## Was NICHT hierher gehoert',
  '',
  'Die `relief.webp` (261 kB auf turban) und der TBT der Relief-Ebene. Das ist',
  'BIL-2522 und dort schon als bewusster Preis des Features abgenommen — ich fasse',
  'es nicht ohne eure Ansage an.',
].join('\n');

const body = {
  title: 'Stoff-Chips der Palette verkleinern — 192 KiB fuer 44px-Kreise (aus BIL-2523)',
  description,
  parentId: PARENT,
  priority: 'medium',
  status: 'todo',
  assigneeAgentId: '3ebe70b9-26f7-4a8a-b57d-7ef29cbd8916', // Designer
};

const r = await fetch(`${API}/api/companies/723a0156-47d4-4ec0-9d21-81a1cebeb182/issues`, { method: 'POST', headers: AUTH, body: JSON.stringify(body) });
const text = await r.text();
console.log('POST company issues ->', r.status);
console.log(text.slice(0, 900));
