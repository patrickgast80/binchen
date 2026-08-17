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
2. **Paperclip-Key** (Board-Aktion): Agent-JWTs aus Runs laufen nach **1 h** ab
   und taugen nicht für einen Daemon. Der Board-User legt unter
   *Agents → DevOps → API keys* einen Key an — Name `telegram-bridge`, Scope
   `task_bridge`, beschränkt auf das Binchen-Projekt
   (`5e251e01-8c35-4243-9a64-ebccc2ffed74`). Agenten selbst dürfen das nicht
   (`POST /api/agents/{id}/keys` → 403 „Board access required", verifiziert 2026-08-17).
   Key als `PAPERCLIP_TOKEN` in dieselbe Env-Datei.
   **Wichtig — Boundary:** ein Agent-Key darf nur Issues kommentieren, die diesem
   Agenten zugewiesen sind („Issue is outside this actor's authorization boundary",
   verifiziert 2026-08-17). Für das Default-Ziel BIL-1 (Assignee: QA) braucht die
   Bridge daher zusätzlich einen Key des **BIL-1-Assignee-Agenten** (aktuell
   *Agents → QA → API keys*), eingetragen als `PAPERCLIP_EXTRA_TOKENS`
   (kommasepariert, mehrere möglich). Die Bridge probiert bei 403 alle Keys durch
   und liest die Env-Datei dabei neu ein — nachträglich ergänzte Keys wirken ohne
   Neustart. Nicht zustellbare Nachrichten gehen **nicht verloren**: sie landen im
   Spool (`infra/.vault/telegram-bridge.spool.jsonl`) und werden alle 5 min
   automatisch nachgeliefert, mit Telegram-Bestätigung.
   *Fallback ohne Board-Key:* aktuelles Agent-JWT eintragen; die Bridge liest die
   Env-Datei bei jedem 401 neu ein, ein Token-Tausch braucht also keinen Neustart —
   aber das JWT muss dann stündlich manuell erneuert werden. Nur als Notlösung.
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
die Env-Datei, Bridge restartet sich beim nächsten 401 nicht — Prozess einmal
neu starten. Kompromittierter Paperclip-Key ⇒ Board löscht ihn unter
*Agents → DevOps → API keys*.

## Tests (ohne Token)

```
node --test tools/telegram-bridge/test/test.mjs
```

17 Tests gegen Fixture-`getUpdates`-Payloads (`test/fixtures.json`) mit
Fake-Telegram/-Paperclip-Clients: Routing, Allowlist, Foto-Upload inkl.
Fallback, Fehlerpfade, 401-Token-Hot-Reload, 409-Handling.
