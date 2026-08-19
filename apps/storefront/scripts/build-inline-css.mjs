// BIL-2526 — erzeugt `src/generated/inline-css.ts` aus `src/app/globals.css`.
//
// Warum ueberhaupt:
// Das Stylesheet ist der einzige render-blockierende Request der Seite und faellt
// in ein Fenster, in dem ~135 KiB async-JS um dieselbe gedrosselte Leitung
// kaempfen. Gemessen (Lighthouse 12.8.2, `devtools`-Throttling, 1474 Kbps):
// 7 KiB CSS brauchten **911 ms**, und der erste Frame kam erst 1000 ms danach,
// weil bis dahin die Skript-Auswertung laeuft. Inline heisst: das CSS ist mit
// dem Dokument da, der Browser malt, BEVOR der JS-Sturm anfaengt.
//
// Warum nicht `experimental.optimizeCss`:
// Nachgebaut und verworfen. `critters` haengt in Next 14.2 nur im Pages-Router
// (`server/render.js` -> `server/post-process.js`). Im App Router laeuft der
// Renderer ueber `server/app-render/*` und ruft den Post-Prozessor nie auf. Ein
// Build mit `optimizeCss: true` liefert HTML mit unveraendertem
// `<link rel="stylesheet">` und null `<style>`-Tags — die Option ist hier
// wirkungslos, nicht bloss schwach.
//
// Deterministisch: gleiche Quelle -> gleiche Ausgabe. Der Build bricht ab, wenn
// die CSS-Kompilierung leer laeuft, damit ein stiller Fehlschlag nicht als
// "Seite ohne Styles" live geht.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SRC = resolve(ROOT, 'src/app/globals.css');
const OUT = resolve(ROOT, 'src/generated/inline-css.ts');

const require = createRequire(import.meta.url);
const postcss = require('postcss');
const tailwindcss = require('tailwindcss');
const autoprefixer = require('autoprefixer');

// Next bringt seinen eigenen CSS-Minifier mit. Den zu benutzen heisst: dieselbe
// Minifizierung wie beim regulaeren `next build`, ohne eine neue Dependency.
// Der Umweg ueber `next/package.json` ist noetig, weil die `exports`-Map von
// Next `dist/compiled/*` nicht veroeffentlicht — direkt requiren gibt
// ERR_PACKAGE_PATH_NOT_EXPORTED.
let cssnanoSimple;
try {
  cssnanoSimple = require(resolve(dirname(require.resolve('next/package.json')), 'dist/compiled/cssnano-simple'));
} catch (cause) {
  throw new Error(
    'inline-css: next/dist/compiled/cssnano-simple nicht gefunden. Nach einem Next-Upgrade ' +
      'liegt der Minifier evtl. woanders. Nicht ungeprueft auf unminifiziert zurueckfallen — ' +
      'das waere still ein groesseres Dokument auf jeder Seite.',
    { cause }
  );
}

const source = readFileSync(SRC, 'utf8');

const result = await postcss([
  tailwindcss({ config: resolve(ROOT, 'tailwind.config.ts') }),
  autoprefixer(),
  cssnanoSimple({}, postcss),
]).process(source, { from: SRC, to: undefined });

const css = result.css.trim();

// Ein leeres oder absurd kleines Ergebnis waere ein stiller Totalausfall des
// Stylings — lieber den Build sprengen als eine unstyled Seite deployen.
if (css.length < 10_000) {
  throw new Error(`inline-css: nur ${css.length} Bytes erzeugt — das kann nicht stimmen, Build abgebrochen`);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  `// AUTOGENERIERT von scripts/build-inline-css.mjs — nicht von Hand editieren.\n` +
    `// Quelle: src/app/globals.css. Regenerieren: \`pnpm --filter=storefront css:inline\`.\n` +
    `// Wird nur im Production-Build eingebunden (siehe next.config.mjs, resolve.alias\n` +
    `// auf src/components/layout/global-styles.*.tsx). Im Dev laeuft weiter der\n` +
    `// normale \`import "./globals.css"\`, damit HMR fuer Styles erhalten bleibt.\n` +
    `export const INLINE_CSS = ${JSON.stringify(css)};\n`,
  'utf8'
);

process.stdout.write(`inline-css: ${css.length} Bytes -> src/generated/inline-css.ts\n`);
