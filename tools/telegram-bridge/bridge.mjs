#!/usr/bin/env node
// Telegram -> Paperclip bridge, long-polling entry point (BIL-2481).
// Runs as a local daemon on the Paperclip host machine; see README.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadConfig, makeTokenProvider, makePaperclipClient, makeTelegramClient,
  handleUpdate, loadState, saveState,
} from './lib.mjs';

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
  log(`FATAL: PAPERCLIP_TOKEN fehlt in ${envFile} — Agent-API-Key noetig (Board: Agents -> DevOps -> API keys).`);
  process.exit(2);
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

log(`bridge up — default issue ${cfg.defaultIssueKey}, allowlist [${cfg.allowedUserIds.join(', ')}], offset ${state.offset}`);

let backoffMs = 5000;
for (;;) {
  try {
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
      log(`poll error: ${e.message || e} — retry in ${backoffMs / 1000}s`);
      await sleep(backoffMs);
      backoffMs = Math.min(backoffMs * 2, 120000);
    }
  }
}
