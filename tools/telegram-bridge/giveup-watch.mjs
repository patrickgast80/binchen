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
import { execFile } from 'node:child_process';

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

// Ein Watcher-Tick. Dedupe über state.giveupSeen (persistiert vom Aufrufer);
// eine Zeile gilt erst als gesehen, wenn mindestens EIN Telegram-Send
// durchging — sonst wird beim nächsten Tick erneut versucht. SSH-Fehler sind
// nur ein Log-WARN: kein Alarm-Spam, der Poller-Host ist ohnehin gerade das
// Sorgenkind, wenn er nicht erreichbar ist.
export async function checkGiveUp({ cfg, tg, pc, log, state, runRemote }) {
  let out;
  try {
    out = await runRemote('grep GIVING_UP /home/deploy/binchen-autodeploy.log 2>/dev/null || true');
  } catch (e) {
    log(`giveup-watch WARN: ssh fehlgeschlagen: ${e.message}`);
    return { checked: false, alerts: 0 };
  }
  const seen = new Set(state.giveupSeen || []);
  const fresh = parseGiveUpLines(out).filter((l) => !seen.has(l));
  let alerts = 0;
  for (const line of fresh) {
    const text = formatGiveUpAlert(line);
    let delivered = false;
    for (const uid of cfg.allowedUserIds) {
      try {
        await tg.sendMessage(uid, text);
        delivered = true;
      } catch (e) {
        log(`giveup-watch WARN: Telegram an ${uid} fehlgeschlagen: ${e.message}`);
      }
    }
    try {
      const target = await pc.resolveIssue(cfg.defaultIssueKey);
      if (target) await pc.postComment(target.id, `🚨 **Auto-Deploy GIVING_UP** (Alarm aus BIL-2518)\n\n\`\`\`\n${text}\n\`\`\``);
    } catch (e) {
      log(`giveup-watch WARN: Paperclip-Kommentar fehlgeschlagen: ${e.message}`);
    }
    if (delivered) {
      seen.add(line);
      alerts++;
      log(`giveup-watch: Alarm gesendet für: ${line}`);
    }
  }
  state.giveupSeen = [...seen].slice(-50);
  return { checked: true, alerts };
}
