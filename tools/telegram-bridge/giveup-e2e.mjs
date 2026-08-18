// BIL-2518: one-shot e2e selftest — run from tools/telegram-bridge/
// BIL-2519: teilt den persistenten Dedupe-Store (giveup-seen.json) und die
// Bridge-State-Datei mit dem Daemon. Ein Selbsttest-Lauf alarmiert also nie
// eine Zeile erneut, die Daemon oder ein früherer Lauf schon zugestellt haben.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, loadState, makeTokenProvider, makeTelegramClient, makePaperclipClient } from './lib.mjs';
import { makeSshRunner, checkGiveUp } from './giveup-watch.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.resolve(here, '..', '..', 'infra', '.vault', 'telegram-bridge.env');
const cfg = loadConfig(envFile);
const tg = makeTelegramClient(cfg);
const pc = makePaperclipClient({ apiUrl: cfg.paperclipUrl, tokenProvider: makeTokenProvider(cfg), companyId: cfg.companyId, projectId: cfg.projectId });
const state = loadState(cfg.stateFile);
const runRemote = makeSshRunner({ target: cfg.giveupWatch.sshTarget, keyFile: cfg.giveupWatch.sshKey });

console.log('giveupWatch config:', JSON.stringify({ ...cfg.giveupWatch, sshKey: '(redacted)' }));
const r = await checkGiveUp({ cfg, tg, pc, log: console.log, state, runRemote });
console.log('result:', JSON.stringify(r));
process.exit(r.alerts >= 0 ? 0 : 1);
