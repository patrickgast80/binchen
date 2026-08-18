## Ursache gefunden — und zwar live im Moment des Auftretens gemessen, nicht vermutet

**Es ist nicht Medusa.** Der Store-Endpoint ist im Normalbetrieb gesund:

- `GET /store/products` direkt: **124/124 × 200**, p50 176 ms, p99 431 ms
- die Live-Server-Action „In den Warenkorb": **100/100 ok** vor dem Fix, **60/60 ok** danach

Der Auslöser ist der **Coolify-Deploy-Cutover**. Ich habe während meines eigenen Deploys (`c294dce`) alle 1,5 s gleichzeitig gegen Storefront und Medusa gemessen:

| Zeit (UTC) | Beobachtung |
|---|---|
| 10:48:28 – 10:48:40 | Storefront-ETag springt **7×** zwischen altem und neuem Container hin und her |
| 10:49:05 – 10:49:49 | `api.bilulu.de` liefert **44 Sekunden am Stück 502** |
| in diesem Fenster | **28 von 28** Warenkorb-Klicks scheitern |

Heute gab es **6 solcher Deploys** (08:50–09:30 UTC). Deine BIL-2506-Session lag genau dazwischen — damit sind die 2 von 29 vollständig erklärt, ohne dass irgendwo ein Timeout, ein Rate-Limit oder ein Cold-Start-Bug im Backend steckt.

### Warum du `variant_unavailable` gesehen hast und ich `cart_unavailable`

Dasselbe Ereignis, zwei Ausgänge. In der Action läuft der Produkt-Read (Next Data Cache, `revalidate: 60`) **vor** dem Cart-Create (`cache: "no-store"`, immer Netz):

- Produkt-Read gerade **gecacht** → überlebt den Ausfall, erst der Cart-Create fällt → `cart_unavailable`
- Cache-Eintrag gerade **abgelaufen** → schon der Produkt-Read kippt → `variant_unavailable`

Genau dieses Zusammentreffen macht den Fund so selten und so schlecht reproduzierbar — und erklärt, warum ein sofortiger Retry immer durchging.

## Was ich geändert habe (`main@c294dce`, live)

`apps/storefront/src/lib/medusa.ts`:

1. **`fetchStoreJson()`** — 3 Versuche, exponentieller Backoff mit vollem Jitter, 5 s Timeout pro Versuch. Wiederholt Transportfehler / 408 / 425 / 429 / 5xx; wiederholt **nie** andere 4xx, denn ein 401/404 ist eine echte Antwort und Draufhauen verzögert nur den Fehler. Worst case ~1,5 s, weil das in einem Klick läuft, auf den die Kundin wartet.
2. **Sechs identische Produkt-Reads zu einem geteilten `fetchConfiguratorProducts()` zusammengezogen** (hose, hose-kurz, turban, muetze, dreieckstuch, body). Vorher war der Fix-Ort sechsfach kopiert — genau die Konstellation, in der man fünf repariert und den sechsten kaputt ausliefert.
3. **`getDefaultRegionId()`** läuft jetzt auch darüber: ein verlorener Region-Read wirft den Warenkorb nicht raus, er lässt still `region_id` weg und rendert **0,00 €** (BIL-2438). Leiserer Fehler, schlimmere Wirkung.
4. **Strukturierte Logs** (`code` / `message` / `requestId` / `attempts`) pro Versuch, alle mit derselben `requestId` — eine gemeldete Fehlmeldung ist damit als ganze Retry-Kette aus dem Container-Log greifbar.

**Bewusst nicht gebaut:** ein exportiertes „letzte Fehlerursache"-Signal für die UI. Die naheliegende Umsetzung ist modul-globaler State, und Modul-Scope ist im Server über nebenläufige Requests geteilt — zwei gleichzeitig klickende Kundinnen würden sich gegenseitig die Fehlermeldung überschreiben. Begründung steht als Kommentar im Code.

## Beweis

Der Live-Flake ließ sich **nicht** auf Kommando reproduzieren (er hängt am Deploy-Zeitpunkt). Deshalb ist die Retry-Logik per **Fault Injection** bewiesen statt per Warten:

```
node --test apps/backend/scripts/bil2507/retry.test.mjs
✔ happy path: resolves on first try
✔ one dropped connection still resolves (the BIL-2507 bounce)
✔ one 502 from the proxy still resolves
✔ a timeout still resolves
✔ two failures still resolve — budget is 3 attempts
✔ sustained outage gives up after exactly 3 attempts
✔ 401 is NOT retried — a real answer, not a blip
✔ 404 is NOT retried
✔ 429 IS retried — rate limit is transient
✔ every failed attempt emits a structured line with a shared requestId
✔ giving up logs an error line, not just warnings
ℹ tests 11  ℹ pass 11  ℹ fail 0
```

Die Tests treiben das **echte** `medusa.ts` (Node-24-Type-Stripping, keine neue Dependency, kein herauskopierter Helfer, der abdriften kann). **Gegenprobe:** mit `STORE_RETRY_ATTEMPTS = 1` fällt die Suite um — sie kann die Regression also wirklich fangen. Storefront `tsc --noEmit` sauber. Im Container zusätzlich geprüft, dass `AbortSignal.timeout` und `crypto.randomUUID` dort existieren (Node v20.20.2) — fehlten sie, hätte **jeder** Warenkorb-Klick gebounct.

**Rollback:** `git revert c294dce` — reine Storefront-Datenschicht, keine Migration, kein Schema, kein Zustand.

## Ehrliche Einschränkung

Mein Fix deckt **kurze** Zucken ab. Ein **44-Sekunden**-Ausfall ist damit bewusst **nicht** abgedeckt: ein Retry-Budget, das 45 s überbrückt, ließe die Kundin minutenlang auf einen hängenden Button starren. Die eigentliche Lösung liegt im Deploy, nicht im Client — deshalb:

## Übergaben

- **BIL-2511 → DevOps** (high): Deploy-Cutover nimmt den Shop ~45 s vom Netz. Medusa-Container hat keinen Healthcheck (`docker ps`: Storefront `(healthy)`, Medusa nur `Up`), Traefik schaltet um, während Medusa noch bootet. Braucht gesundheitsgeprüftes Rolling-Update. **Das ist der größere Fund** — er kostet bei jedem Deploy echte Bestellungen, nicht nur alle 15 Klicks einen.
- **BIL-2510 → Frontend** (medium): dein zweiter Befund, `?error=` in allen 6 Konfiguratoren sichtbar machen. Fehlercode-Kontrakt (`variant_unavailable` / `cart_unavailable` / `add_failed`) ist dort dokumentiert und ändert sich nicht. Empfehlung: für alle drei dieselbe freundliche Retry-Copy — nach 3 serverseitigen Retries ist jeder Rest aus Kundensicht dasselbe Ereignis.

Damit ist die **Backend-Hälfte dieses Tickets erledigt**. Die verbleibende Arbeit liegt vollständig in BIL-2510 und BIL-2511.

Belege im Repo: `apps/backend/scripts/bil2507/` (`probe-store-products.mjs`, `repro-cart-bounce.mjs`, `watch-cutover.mjs`, `retry.test.mjs`, `cutover-watch.txt`, `repro-before.txt`, `repro-after.txt`).

Nächster Reviewer: **@QA** — falls du gegenprüfen willst, ist die aussagekräftigste Probe `node apps/backend/scripts/bil2507/watch-cutover.mjs --minutes 10` **während** eines Deploys; im Normalbetrieb siehst du erwartungsgemäß nur Grün.
