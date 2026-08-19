// BIL-2529 — der Fehler auf Knopfdruck.
//
// Der Shift faellt in ungefaehr jedem zwoelften Lighthouse-Lauf: der Browser
// malt einen Frame, waehrend das Markup des Cookie-Banners noch unterwegs ist,
// und der `fixed bottom-0`-Banner waechst danach nach oben. Wer nur wartet, bis
// der Zufall zuschlaegt, kann einen Fix nicht belegen — sechs gruene Laeufe sind
// bei 8 % Trefferquote auch ohne Fix zu 60 % gruen.
//
// Dieser Proxy macht aus dem Zufall ein Experiment: er reicht alles unveraendert
// durch, teilt aber das HTML-Dokument an einer Stelle MITTEN im Banner und legt
// dort eine Pause ein. Damit sieht der Browser garantiert den halben Banner,
// malt ihn, und bekommt den Rest erst danach. Vorher/nachher wird so
// vergleichbar.
//
// Ehrlich dazugesagt: das ist eine Uebertreibung des natuerlichen Timings, kein
// Lighthouse-Ersatz. Die Abnahme laeuft weiter ueber echte Lighthouse-Laeufe.
//
// Aufruf: node bil2529-stream-split-proxy.mjs <upstream> <port> [pauseMs]
import http from "node:http";

const UPSTREAM = process.argv[2];
const PORT = Number(process.argv[3]);
const PAUSE_MS = Number(process.argv[4] ?? 400);
if (!UPSTREAM || !PORT) throw new Error("Aufruf: node … <upstream> <port> [pauseMs]");

// Der Schnitt sitzt vor dem Button-Block des Banners — genau die Stelle, an der
// Lighthouse den Sprung gemessen hat (0,051 = ~102 px Wachstum, gut eine
// Button-Reihe).
// `BIL2529_SPLIT` setzt eine andere Marke — damit laesst sich dieselbe Stresse
// auf das Konfigurator-Sheet legen (Marke: `role="tabpanel"`) und pruefen, ob
// dessen reservierte Endhoehe aus BIL-2526 auch mitten im Stream haelt.
const SPLIT_AT = process.env.BIL2529_SPLIT || '<div class="flex flex-col gap-2 sm:flex-row';

const server = http.createServer(async (req, res) => {
  const upstreamUrl = UPSTREAM + req.url;
  let upstream;
  try {
    upstream = await fetch(upstreamUrl, {
      headers: { ...req.headers, host: new URL(UPSTREAM).host, "accept-encoding": "identity" },
      redirect: "manual",
    });
  } catch (err) {
    res.writeHead(502).end(String(err));
    return;
  }

  const headers = {};
  upstream.headers.forEach((v, k) => {
    // Laenge und Encoding stimmen nach dem Aufteilen nicht mehr.
    if (k === "content-length" || k === "content-encoding") return;
    headers[k] = v;
  });

  const isDoc = (upstream.headers.get("content-type") || "").includes("text/html");
  if (!isDoc) {
    res.writeHead(upstream.status, headers);
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
    return;
  }

  const html = await upstream.text();
  const idx = html.indexOf(SPLIT_AT);
  res.writeHead(upstream.status, headers);
  if (idx === -1) {
    process.stderr.write("WARNUNG: Schnittmarke nicht gefunden — Dokument geht ungeteilt raus\n");
    res.end(html);
    return;
  }
  res.write(html.slice(0, idx));
  // `flushHeaders` reicht nicht; der Rest muss wirklich spaeter auf die Leitung.
  setTimeout(() => res.end(html.slice(idx)), PAUSE_MS);
});

server.listen(PORT, "127.0.0.1", () => {
  process.stderr.write(`split-proxy ${PORT} -> ${UPSTREAM}, Pause ${PAUSE_MS} ms\n`);
});
