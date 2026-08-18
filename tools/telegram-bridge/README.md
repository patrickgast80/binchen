# Telegram → Paperclip Bridge (BIL-2481)

Lokaler Long-Polling-Daemon auf der Windows-Maschine, auf der die Paperclip-API
(127.0.0.1:3100) läuft. Kein öffentlicher Webhook — die Bridge zieht Updates via
Telegram `getUpdates` und schreibt sie als Paperclip-Kommentare/Issues.

## Funktionsweise

| Telegram-Nachricht | Ergebnis |
| --- | --- |
| `Freitext` | Kommentar auf `DEFAULT_ISSUE_KEY` (Default: BIL-1) |
| `BIL-1234: Text` | Kommentar auf BIL-1234 |
| `/new Titel` (+ weitere Zeilen = Beschreibung) | Neues Issue im Projekt, Status `todo` |
| Foto (optional mit Caption, Caption darf `BIL-1234:` Prefix haben) | Größte Auflösung wird via `getFile` geladen, lokal gesichert und als Attachment ans Ziel-Issue gehängt; Kommentar referenziert die Attachment-ID. Schlägt der Upload fehl, referenziert der Kommentar den lokalen Pfad. |
| `/help`, `/start` | Syntax-Hilfe als Reply |

Jede verarbeitete Nachricht bekommt eine Telegram-Reply mit Issue-Key und
Kommentar-ID. Nachrichten von Usern **außerhalb der Allowlist werden still
ignoriert** (nur geloggt, keine Antwort — kein Oracle für Fremde).

## Setup (einmalig)

1. **Bot-Token** (Board-Aktion, BIL-2480): Bot via @BotFather anlegen,
   Token in `infra/.vault/telegram-bridge.env` eintragen
   (Vorlage: `telegram-bridge.env.example` hier im Ordner; Vault-Ordner ist gitignored).
2. **Paperclip-Auth: kein Key nötig (Default).** Die Bridge läuft als lokaler
   Prozess auf derselben Maschine wie die Paperclip-API, die im Modus
   `deploymentMode: local_trusted`, `bind: loopback`, `exposure: private` an
   127.0.0.1 gebunden ist. In diesem Modus akzeptiert der Server Writes **ohne
   Authorization-Header** und verbucht sie als User `local-board` — genau richtig,
   denn die relayten Nachrichten SIND Board-Nachrichten, nicht Agent-Nachrichten.
   Damit landet ein Kommentar auf **jedem** Issue (inkl. des QA-eigenen BIL-1),
   ohne dass irgendein Agent-Key angelegt oder rotiert werden muss.
   Verifiziert 2026-08-17 (End-to-End-Post auf BIL-1 → 201, `authorType: user`,
   `authorUserId: local-board`).

   **Warum nicht einfach ein Agent-Key?** Ein Agent-Key darf nur Issues
   kommentieren, die diesem Agenten zugewiesen sind (403 „Issue is outside this
   actor's authorization boundary"). Für BIL-1 (Assignee: QA) bräuchte man daher
   einen QA-Key — den das Board bewusst **nicht** anlegen wollte (BIL-2481,
   Confirmation abgelehnt 2026-08-17). Der local-board-Pfad löst das ohne Key.

   *Optional* — `PAPERCLIP_TOKEN` / `PAPERCLIP_EXTRA_TOKENS` (kommasepariert)
   werden weiterhin unterstützt, falls Writes bewusst unter einem bestimmten
   Agent-Actor laufen sollen. Der Client versucht dann erst die Tokens und fällt
   bei 401/403 auf local-board zurück (abschaltbar via `allowLocalBoard: false`).
   Nicht zustellbare Nachrichten gehen ohnehin **nicht verloren**: sie landen im
   Spool (`infra/.vault/telegram-bridge.spool.jsonl`) und werden alle 5 min
   automatisch nachgeliefert, mit Telegram-Bestätigung.
3. **Allowlist**: numerische Telegram-User-IDs (z. B. via @userinfobot ermitteln)
   kommasepariert als `TELEGRAM_ALLOWED_USER_IDS`. Ohne Allowlist startet die
   Bridge nicht.

## Start / Betrieb

```
# Vordergrund (Debug)
node tools/telegram-bridge/bridge.mjs

# Dauerbetrieb: Watchdog-Wrapper (restartet bei Crash, stoppt bei fehlender Config)
tools\telegram-bridge\start-bridge.cmd

# Autostart bei Login (einmalig registrieren, Pfad anpassen):
schtasks /Create /TN "BinchenTelegramBridge" /SC ONLOGON /RL LIMITED /F ^
  /TR "\"C:\Users\Besitzer\.paperclip\instances\default\projects\723a0156-47d4-4ec0-9d21-81a1cebeb182\5e251e01-8c35-4243-9a64-ebccc2ffed74\_default\tools\telegram-bridge\start-bridge.cmd\""
```

- Log: `tools/telegram-bridge/bridge.log` (append-only; bei Bedarf manuell leeren).
- Offset-State: `infra/.vault/telegram-bridge.state.json` — Löschen ⇒ Telegram
  liefert die letzten 24 h Updates erneut (Duplikat-Kommentare möglich).
- Fotos: `infra/.vault/telegram-media/` (lokale Kopie zusätzlich zum Upload).
- Genau **eine** Instanz betreiben: zwei `getUpdates`-Consumer erzeugen Telegram
  409-Conflicts; die Bridge loggt das und wartet, statt zu kämpfen.

## Stoppen / Rollback

```
schtasks /End /TN "BinchenTelegramBridge" & schtasks /Delete /TN "BinchenTelegramBridge" /F
taskkill /FI "WINDOWTITLE eq start-bridge*"   # bzw. das node bridge.mjs-Fenster schließen
```

Die Bridge ist rein additiv (Kommentare/Issues/Attachments); Rollback = Prozess
stoppen. Kompromittierter Bot-Token ⇒ bei @BotFather `/revoke`, neuen Token in
die Env-Datei, Prozess einmal neu starten. Ein Paperclip-Key ist im
Default-Betrieb nicht gesetzt (local-board-Pfad); falls doch einer hinterlegt
wurde ⇒ Board löscht ihn unter *Agents → … → API keys*.

**Sicherheitshinweis:** Der local-board-Schreibpfad funktioniert nur, weil die
Paperclip-API loopback-only im `local_trusted`-Modus läuft. Der einzige
Zugangsschutz ist damit die Telegram-**Allowlist** (`TELEGRAM_ALLOWED_USER_IDS`)
plus der geheime Bot-Token. Wer die Paperclip-API je öffentlich exponiert, muss
diesen Pfad neu bewerten (`allowLocalBoard: false` + Agent-Key erzwingen).

## GIVING_UP-Watcher (BIL-2518)

Die Bridge prüft zusätzlich alle 10 min per SSH das Auto-Deploy-Log auf dem
Coolify-Host (`grep GIVING_UP /home/deploy/binchen-autodeploy.log`). Neue
Zeilen (= zwei rote Builds auf demselben SHA, Poller hat aufgegeben) lösen
aktiv aus: Telegram an alle `TELEGRAM_ALLOWED_USER_IDS` + Kommentar auf
`DEFAULT_ISSUE_KEY`. Der Bot-Token bleibt dabei auf dieser Maschine — der
shared Host bekommt kein Telegram-Secret (bewusste Entscheidung, BIL-2518).

- Dedupe: `giveupSeen` im State-File; erst nach erfolgreichem Telegram-Send
  gilt eine Zeile als gesehen (sonst Retry beim nächsten Tick).
- SSH-Fehler ⇒ nur WARN im `bridge.log`, kein Alarm.
- Env-Knöpfe (alle optional): `GIVEUP_WATCH=0` (aus), `GIVEUP_SSH_TARGET`
  (Default `deploy@188.245.40.74`), `GIVEUP_SSH_KEY` (Default
  `<vault>/coolify-host-ssh.key`), `GIVEUP_INTERVAL_MS` (Default 600000).

## Tests (ohne Token)

```
node --test tools/telegram-bridge/test/test.mjs tools/telegram-bridge/test/giveup.test.mjs
```

30 Tests gegen Fixture-`getUpdates`-Payloads (`test/fixtures.json`) mit
Fake-Telegram/-Paperclip-Clients: Routing, Allowlist, Foto-Upload inkl.
Fallback, Fehlerpfade, 401-Token-Hot-Reload, 403→local-board-Fallback,
tokenloser Betrieb, 409-Handling, GIVING_UP-Watcher (Parse, Dedupe,
SSH-/Telegram-Fehlerpfade).
