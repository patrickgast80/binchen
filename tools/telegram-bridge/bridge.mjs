#!/usr/bin/env node
// Telegram -> Paperclip bridge, long-polling entry point (BIL-2481).
// Runs as a local daemon on the Paperclip host machine; see README.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadConfig, makeTokenProvider, makePaperclipClient, makeTelegramClient,
  handleUpdate, loadState, saveState, loadSpool, flushSpool,
} from './lib.mjs';
import { makeSshRunner, checkGiveUp } from './giveup-watch.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ENV_FILE = path.resolve(here, '..', '..', 'infra', '.vault', 'telegram-bridge.env');
const envFile = process.env.BRIDGE_ENV_FILE || DEFAULT_ENV_FILE;

const cfg = loadConfig(envFile);
const logFile = path.join(here, 'bridge.log');
const log = (line) => {
  const entry = `${new Date().toISOString()} ${line}`;
  console.log(entry);
  try { fs.appendFileSync(logFile, entry + '\n'); } catch { /* log dir gone */ }
};

if (!cfg.botToken) {
  log(`FATAL: TELEGRAM_BOT_TOKEN fehlt in ${envFile} — siehe README.md (Token kommt vom Board, BIL-2480).`);
  process.exit(2);
}
if (!cfg.paperclipToken) {
  // Kein Fatal mehr: der loopback-lokale local_trusted-Server akzeptiert Writes
  // ohne Auth als local-board. Ein Agent-Key ist optional (nur nötig, wenn Writes
  // bewusst unter einem Agent-Actor laufen sollen). Board-Wunsch: "ohne QA-Key".
  log('WARN: PAPERCLIP_TOKEN nicht gesetzt — Bridge schreibt als local-board (kein Agent-Key nötig).');
}
if (!cfg.allowedUserIds.length) {
  log(`FATAL: TELEGRAM_ALLOWED_USER_IDS fehlt/leer in ${envFile} — ohne Allowlist startet die Bridge nicht.`);
  process.exit(2);
}

const tg = makeTelegramClient({ botToken: cfg.botToken });
const pc = makePaperclipClient({
  apiUrl: cfg.paperclipUrl,
  tokenProvider: makeTokenProvider(cfg),
  companyId: cfg.companyId,
  projectId: cfg.projectId,
});
const saveMedia = async (filename, buffer) => {
  fs.mkdirSync(cfg.mediaDir, { recursive: true });
  const p = path.join(cfg.mediaDir, filename);
  fs.writeFileSync(p, buffer);
  return p;
};

const state = loadState(cfg.stateFile);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const gw = cfg.giveupWatch;
const runRemote = gw.enabled ? makeSshRunner({ target: gw.sshTarget, keyFile: gw.sshKey }) : null;

log(`bridge up — default issue ${cfg.defaultIssueKey}, allowlist [${cfg.allowedUserIds.join(', ')}], offset ${state.offset}, spool ${loadSpool(cfg.spoolFile).length}, giveup-watch ${gw.enabled ? `an (${gw.sshTarget}, alle ${Math.round(gw.intervalMs / 60000)} min)` : 'aus'}`);

const FLUSH_INTERVAL_MS = 5 * 60 * 1000;
let nextFlushAt = 0;
let nextGiveupAt = 0;
let backoffMs = 5000;
for (;;) {
  try {
    if (Date.now() >= nextFlushAt) {
      nextFlushAt = Date.now() + FLUSH_INTERVAL_MS;
      const delivered = await flushSpool({ spoolFile: cfg.spoolFile, pc, tg, log });
      if (delivered) log(`spool flush: ${delivered} Nachricht(en) nachgeliefert`);
    }
    if (runRemote && Date.now() >= nextGiveupAt) {
      nextGiveupAt = Date.now() + gw.intervalMs;
      const r = await checkGiveUp({ cfg, tg, pc, log, state, runRemote });
      if (r.alerts) saveState(cfg.stateFile, state);
    }
    const updates = await tg.getUpdates(state.offset || undefined, 50);
    backoffMs = 5000;
    for (const update of updates) {
      await handleUpdate(update, { cfg, tg, pc, log, saveMedia });
      state.offset = update.update_id + 1;
      saveState(cfg.stateFile, state);
    }
  } catch (e) {
    if (e.telegram?.error_code === 409) {
      // another getUpdates consumer (second bridge instance) — do not fight it
      log('WARN: Telegram 409 Conflict (zweite Bridge-Instanz?) — warte 30s');
      await sleep(30000);
    } else {
      const cause = e.cause ? ` (${e.cause.code || e.cause.message || e.cause})` : '';
      log(`poll error: ${e.message || e}${cause} — retry in ${backoffMs / 1000}s`);
      await sleep(backoffMs);
      backoffMs = Math.min(backoffMs * 2, 120000);
    }
  }
}
