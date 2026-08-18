// BIL-2518: GIVING_UP-Watcher für den Auto-Deploy-Poller (BIL-2459/2517).
//
// Der Poller auf dem Coolify-Host schreibt nach zwei roten Builds pro SHA+App
// einmalig eine GIVING_UP-Zeile nach /home/deploy/binchen-autodeploy.log und
// stoppt (Two-Strike-Regel). Dieser Watcher läuft im Bridge-Daemon auf der
// Paperclip-Maschine, liest die Zeilen periodisch per SSH und alarmiert aktiv:
// Telegram an die Allowlist-User + Paperclip-Kommentar auf dem Default-Issue.
//
// Bewusste Architektur-Entscheidung: der Bot-Token bleibt auf DIESER Maschine.
// Der shared Hetzner-Host bekommt keinerlei Telegram-Secret (Ticket-Option
// "Marker/lokaler Watcher" statt Token-Propagation).
//
// Dedupe (BIL-2519): "schon alarmiert" lebt NICHT mehr im Prozessspeicher des
// Aufrufers, sondern in einer eigenen Datei (cfg.giveupWatch.seenFile), die
// JEDER Einstiegspunkt teilt — Bridge-Daemon UND giveup-e2e.mjs. Pro Rohzeile
// werden Telegram- und Paperclip-Zustellung getrennt geführt: ein Kanal, der
// schon durch ist, feuert bei einem Retry des anderen Kanals nicht erneut.
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Anzeige-Zucker: bekannte Coolify-App-UUIDs -> sprechende Namen.
const APP_NAMES = {
  f12ixtdbpa4bl8ks7qe1ln19: 'bilulu-storefront',
  k3apwpfen4qlb1hc1jdnli6f: 'bilulu-backend',
};

export function parseGiveUpLines(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.includes('GIVING_UP'));
}

// Zeilenformat des Pollers: "<ts> <sha> <uuid> GIVING_UP <freitext>"
export function formatGiveUpAlert(line) {
  const [ts, sha, uuid] = line.split(/\s+/);
  const app = APP_NAMES[uuid] || uuid || 'unbekannte App';
  return [
    '🚨 Auto-Deploy GIVING_UP — beide Builds rot (Two-Strike erreicht)',
    `App: ${app}`,
    `Commit: ${(sha || '').slice(0, 12)}`,
    `Zeit: ${ts || '?'}`,
    'Prod läuft auf dem letzten grünen Build weiter; neue Commits kommen NICHT live, bis jemand eingreift.',
    'Nächste Schritte: Coolify-Deployment-Logs prüfen (https://coolify.bilulu.de), dann RUNBOOK §Auto-Deploy.',
    `Rohzeile: ${line}`,
  ].join('\n');
}

export function makeSshRunner({ target, keyFile, timeoutMs = 30000 }) {
  return (cmd) =>
    new Promise((resolve, reject) => {
      execFile(
        'ssh',
        ['-i', keyFile, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', target, cmd],
        { timeout: timeoutMs, windowsHide: true },
        (err, stdout, stderr) => {
          if (err) reject(new Error(`ssh ${target}: ${err.message} ${String(stderr).slice(0, 200)}`.trim()));
          else resolve(stdout);
        },
      );
    });
}

export function lineKey(line) {
  return crypto.createHash('sha256').update(String(line)).digest('hex');
}

// Persistenter Dedupe-Store. legacyLines (das alte state.giveupSeen-Array aus
// der Bridge-State-Datei) werden als voll zugestellt importiert — diese Zeilen
// haben unter BIL-2518 nachweislich alarmiert.
export function loadSeen(seenFile, legacyLines = []) {
  let seen = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(seenFile, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) seen = parsed;
  } catch { /* noch keine Datei */ }
  for (const l of legacyLines) {
    const k = lineKey(l);
    if (!seen[k]) seen[k] = { tg: true, pc: true, ts: null, line: String(l).slice(0, 200) };
  }
  return seen;
}

export function saveSeen(seenFile, seen) {
  fs.mkdirSync(path.dirname(seenFile), { recursive: true });
  const tmp = `${seenFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(seen, null, 1));
  fs.renameSync(tmp, seenFile);
}

// Ein Watcher-Tick. Dedupe über die geteilte seen-Datei (cfg.giveupWatch.seenFile),
// pro Zeile und pro Kanal: ein Kanal gilt als erledigt, sobald er einmal
// durchging; nur noch fehlende Kanäle werden beim nächsten Tick nachgeholt.
// Die Datei wird sofort nach jeder Zustellung geschrieben, nicht erst am
// Tick-Ende — ein Crash dazwischen kostet also keinen Dedupe-Eintrag mehr.
// SSH-Fehler sind nur ein Log-WARN: kein Alarm-Spam, der Poller-Host ist
// ohnehin gerade das Sorgenkind, wenn er nicht erreichbar ist.
export async function checkGiveUp({ cfg, tg, pc, log, state, runRemote }) {
  let out;
  try {
    out = await runRemote('grep GIVING_UP /home/deploy/binchen-autodeploy.log 2>/dev/null || true');
  } catch (e) {
    log(`giveup-watch WARN: ssh fehlgeschlagen: ${e.message}`);
    return { checked: false, alerts: 0 };
  }
  const seenFile = cfg.giveupWatch.seenFile;
  const seen = loadSeen(seenFile, state?.giveupSeen || []);
  let alerts = 0;
  for (const line of parseGiveUpLines(out)) {
    const k = lineKey(line);
    const rec = seen[k] || (seen[k] = { tg: false, pc: false, ts: null, line: line.slice(0, 200) });
    if (rec.tg && rec.pc) continue;
    const text = formatGiveUpAlert(line);
    if (!rec.tg) {
      for (const uid of cfg.allowedUserIds) {
        try {
          await tg.sendMessage(uid, text);
          rec.tg = true;
        } catch (e) {
          log(`giveup-watch WARN: Telegram an ${uid} fehlgeschlagen: ${e.message}`);
        }
      }
    }
    if (!rec.pc) {
      try {
        const target = await pc.resolveIssue(cfg.defaultIssueKey);
        if (target) {
          await pc.postComment(target.id, `🚨 **Auto-Deploy GIVING_UP** (Alarm aus BIL-2518)\n\n\`\`\`\n${text}\n\`\`\``);
          rec.pc = true;
        }
      } catch (e) {
        log(`giveup-watch WARN: Paperclip-Kommentar fehlgeschlagen: ${e.message}`);
      }
    }
    if (rec.tg || rec.pc) {
      if (!rec.ts) {
        rec.ts = new Date().toISOString();
        alerts++;
        log(`giveup-watch: Alarm gesendet für: ${line}`);
      }
      try {
        saveSeen(seenFile, seen);
      } catch (e) {
        log(`giveup-watch WARN: seen-Datei ${seenFile} nicht schreibbar: ${e.message}`);
      }
    }
  }
  return { checked: true, alerts };
}
