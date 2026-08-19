# Konfigurator source photos — pinned

These are the exact photos the `*-foto` konfigurator assets are derived from.
They live here and **not** under `public/products/` for one reason, found in
BIL-2512:

`public/products/turban/turban-rosen-01.jpeg` and the Dreieckstuch equivalent
were re-matted onto a uniform 1200x1200 canvas by the product-photo
normalisation pass (commit `b576357`, BIL-2455 follow-up). That is right for the
catalog, but it silently broke the konfigurator builders — their background
flood-fill keys on the original cool studio grey (`sat <= 16`, `b - r >= 1`), the
new mat does not match it, so nothing is removed, the garment bbox becomes the
whole canvas and the rebuilt `base.webp` comes out as a full grey square. The
scripts still exited 0.

So: catalog photos may be reprocessed at will; the konfigurator builds read from
here. Files under `scripts/` are not part of the Next.js bundle, so pinning them
costs nothing at runtime.

| file | built by | outputs |
| --- | --- | --- |
| `turban-rosen-01.jpeg` | `scripts/bil2444-build-turban-assets.mjs` | `public/konfigurator/turban-foto/` |
| `dreieckstuch-zoo-01.jpeg` | `scripts/bil2446-build-dreieckstuch-assets.mjs` | `public/konfigurator/dreieckstuch-foto/` |
| `hose-pumphose-05.jpg` | `scripts/bil2417-build-assets.mjs` | `public/konfigurator/hose-foto/` |
| `hose-kurz-dinos-01.jpeg` | `scripts/bil2499-build-dinoshorts-assets.mjs` | `public/konfigurator/hose-kurz-foto/` |
| `muetze-boho-mint-01.jpeg` | `scripts/bil2445-build-muetze-assets.mjs` | `public/konfigurator/muetze-foto/` |

The bottom three were added in BIL-2522. The board's bar for that ticket is that
every render is judged against **the original photo of its own Konfigurator**
(2026-08-19 11:54Z), so `scripts/bil2522-evidence.mjs` needs a reference for all
five — and two of them had none in the repo at all: the Dinos shorts were built
from a path on someone's Desktop, and the Mütze from a catalog file that the
normalisation pass is free to rewrite. `hose-kurz-dinos-01.jpeg` still carries
the editor's baked-in transparency checkerboard; that is the real source, so it
is pinned as-is rather than cleaned.

If a garment is genuinely rephotographed, replace the file here and rerun the
builder — then dump `base.webp` as a PNG and **look at it** before committing.
