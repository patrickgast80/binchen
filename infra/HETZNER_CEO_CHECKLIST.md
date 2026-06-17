# Hetzner — was du (CEO) dafür erledigen musst

Hi Sabine, das sind die Schritte, die nur **du** machen kannst, weil dein Hetzner-Konto
und deine Domain dranhängen. Alles andere (Server provisionieren, härten, Coolify
installieren, SSL einrichten) übernimmt DevOps, sobald du die Punkte unten erledigt hast.

Geschätzte Zeit insgesamt: **20–30 Minuten**, davon ~10 Minuten Wartezeit auf E-Mails von Hetzner.

Laufende Kosten: **~5 €/Monat** (CX22 + tägliche Backups). Erste wiederkehrende Cloud-Kosten
für Bilulu → braucht Board-Approval, ist als separate Approval im Issue verlinkt.

---

## 1. Hetzner Cloud Account anlegen (falls noch nicht vorhanden)

- Gehe auf **https://accounts.hetzner.com/signUp**
- Account anlegen mit Mail `pgkorallenzucht@gmail.com` (oder dem Mail-Account, den du
  fürs Geschäft nutzen willst — ich empfehle eine neue Adresse wie `it@binchen.de` für
  spätere Übergaben, ist aber kein Blocker).
- Persönliche Daten + Adresse eintragen, Zahlungsmittel hinterlegen
  (SEPA-Lastschrift ist die billigste Option).
- E-Mail-Bestätigung anklicken.

> Wenn du **Hetzner Cloud** schon nutzt: nicht den klassischen Robot (Bare-Metal), sondern
> **Hetzner Cloud Console** unter `console.hetzner.cloud`. Falls du beides hast, nimm Cloud.

---

## 2. AVV (Auftragsverarbeitungsvertrag) signieren — DSGVO-Pflicht

Hetzner stellt den AVV im Kunden-Portal bereit. Du musst ihn **digital signieren**, sonst
dürfen wir keine personenbezogenen Daten (Kundenbestellungen!) auf dem Server speichern.

- Login: **https://accounts.hetzner.com**
- Linke Spalte → **Sicherheit & Rechtliches** → **Auftragsverarbeitungsvertrag (AVV)**.
- Daten kontrollieren (Firmenname **Sabine Vollmer / Binchen**, Adresse Haßloch), AGB-Häkchen,
  **Vertrag abschließen** klicken. Hetzner schickt sofort eine Bestätigungsmail.
- Bestätigungsmail in den Bilulu-Ordner ablegen oder mir kurz im Issue antworten:
  *"AVV signiert ✅"*.

---

## 3. Cloud-Projekt "bilulu" anlegen

- **https://console.hetzner.cloud** → oben rechts **Neues Projekt** → Name `bilulu` → Erstellen.
- Im Projekt landest du jetzt automatisch.

---

## 4. SSH-Public-Key hochladen

Damit nur du und DevOps auf den Server kommen.

**Wenn du noch keinen SSH-Key hast** (Windows, 5 Minuten):

1. PowerShell öffnen.
2. `ssh-keygen -t ed25519 -C "board@bilulu"` eingeben.
3. Speicherpfad mit Enter bestätigen, Passwort vergeben (optional aber empfohlen).
4. Den **public key** anzeigen: `Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub` — das ist
   eine einzige Zeile, die mit `ssh-ed25519 …` anfängt und mit `board@bilulu` aufhört.

**Hochladen in Hetzner:**

- Console → linke Spalte **Sicherheit** → **SSH-Keys** → **Add SSH key**.
- Name: `board@bilulu`
- Public Key: die Zeile von oben einfügen.
- Speichern.

> Niemals den **private key** (`id_ed25519` ohne `.pub`) irgendwo hochladen oder schicken.

---

## 5. API-Token erstellen — Read & Write

Damit DevOps den Server skriptbasiert anlegen kann.

- Console → linke Spalte **Sicherheit** → **API-Tokens** → **Generate API token**.
- Name: `devops-bilulu-prod`.
- Berechtigung: **Read & Write**.
- **Generate** → das Token wird **genau einmal angezeigt**. Sofort kopieren.

**Übergabe an DevOps:**

- **Nicht** in einen normalen Chat oder Mail kleben.
- Optionen, in Reihenfolge:
  1. Im **Paperclip-Issue [BIL-1544](/BIL/issues/BIL-1544)** als Kommentar mit Vorwort
     *"Token folgt unten — bitte sofort in Coolify importieren und Kommentar löschen"*.
     DevOps speichert es in `infra/.vault/hetzner-api.env` (gitignored) und löscht den
     Kommentar danach.
  2. Wenn du einen Passwortmanager (Bitwarden / 1Password) für Bilulu eingerichtet hast,
     dort ablegen und Sharing aktivieren.
- Falls das Token versehentlich woanders landet: Console → API-Tokens → roten Mülleimer
  klicken (rotiert sofort) und neues erstellen.

---

## 6. DNS-Record für Coolify-Dashboard (Cloudflare)

Das mach erst, **nachdem DevOps dir die Server-IP geschickt hat** (Schritt 1 dauert dann
~3 Minuten).

- Cloudflare Dashboard → Domain **bilulu.de** → **DNS** → **Add record**.
- Type: **A**
- Name: `coolify`
- IPv4 address: die CX22-IP, die DevOps postet.
- Proxy status: **DNS only** (graue Wolke, **nicht** orange).
  Coolify übernimmt Caddy + Let's Encrypt selbst — Cloudflare-Proxy würde die ACME-
  Challenge brechen.
- TTL: Auto.
- Save.

Optional gleich noch:

- Type **AAAA**, Name `coolify`, der IPv6 vom Server, DNS only.

Antwort im Issue: *"DNS-Record gesetzt ✅"*.

---

## 7. Board-Approval freigeben

Im Paperclip Inbox erscheint ein **Approval-Request** ("CX22 ~5 €/Monat + Hetzner-Spend").
Bitte **akzeptieren** — sonst startet DevOps nichts.

---

## Was passiert dann?

- DevOps führt Schritt 1–4 aus `infra/HETZNER_SETUP.md` aus (Server bauen, härten, Coolify
  starten, HTTPS einrichten).
- DevOps postet in [BIL-1](/BIL/issues/BIL-1) einen Kommentar mit der Server-IP und
  `https://coolify.bilulu.de`.
- Backend deployt Medusa nach Coolify (siehe [BIL-1545](/BIL/issues/BIL-1545)).
- Du machst den DNS-Cutover für `bilulu.de` (eigenes Issue, separater Termin).

---

## Sicherheits-Notiz

- API-Token nie in Git, nie in PRs, nie in Screenshots.
- Wenn dir der Server-Login-Mail von Hetzner verloren geht: über `https://accounts.hetzner.com`
  Passwort-Reset, dauert 1 Minute.
- Bei Verdacht auf Kompromittierung (komische Mails, unbekannte Server in der Konsole):
  sofort API-Token rotieren + DevOps anpingen — **nicht** Coolify oder den VPS löschen,
  wir wollen die Logs.
