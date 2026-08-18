// Tests für den GIVING_UP-Watcher (BIL-2518, Dedupe BIL-2519) — kein Token,
// kein SSH, kein Netz. Run: node --test tools/telegram-bridge/test/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseGiveUpLines, formatGiveUpAlert, checkGiveUp, lineKey, loadSeen, saveSeen } from '../giveup-watch.mjs';

const LINE =
  '2026-08-18T12:00:00Z a94e165532c6b2919774a4331849ad3858b06f1a f12ixtdbpa4bl8ks7qe1ln19 GIVING_UP both attempts failed — two-strike reached, investigate in Coolify';

function makeCtx({ sshOut = '', sshFail = false, tgFail = false, pcFail = false, seenFile } = {}) {
  const calls = { tg: [], comments: [], logs: [] };
  const state = { giveupSeen: [] };
  const file = seenFile || path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'giveup-test-')), 'giveup-seen.json');
  const flags = { tgFail, pcFail };
  const ctx = {
    cfg: { allowedUserIds: [1000001, 1000002], defaultIssueKey: 'BIL-1', giveupWatch: { seenFile: file } },
    log: (l) => calls.logs.push(l),
    state,
    runRemote: async () => {
      if (sshFail) throw new Error('Permission denied (publickey)');
      return sshOut;
    },
    tg: {
      sendMessage: async (chatId, text) => {
        if (flags.tgFail) throw new Error('403 bot blocked');
        calls.tg.push({ chatId, text });
        return { message_id: 1 };
      },
    },
    pc: {
      resolveIssue: async (key) => ({ id: `uuid-${key}`, identifier: key }),
      postComment: async (issueId, body) => {
        if (flags.pcFail) throw new Error('503 api down');
        calls.comments.push({ issueId, body });
        return { id: 'c-1' };
      },
    },
  };
  return { ctx, calls, state, seenFile: file, flags };
}

test('parseGiveUpLines picks only GIVING_UP lines', () => {
  const out = `x deploy ok\n${LINE}\n\n y retry ok\n`;
  assert.deepEqual(parseGiveUpLines(out), [LINE]);
  assert.deepEqual(parseGiveUpLines(''), []);
  assert.deepEqual(parseGiveUpLines(null), []);
});

test('formatGiveUpAlert names the app and commit', () => {
  const t = formatGiveUpAlert(LINE);
  assert.match(t, /bilulu-storefront/);
  assert.match(t, /a94e16553/);
  assert.match(t, /2026-08-18T12:00:00Z/);
  assert.match(t, /GIVING_UP/);
});

test('new GIVING_UP line alerts all allowlist users + posts Paperclip comment + persists', async () => {
  const { ctx, calls, seenFile } = makeCtx({ sshOut: `deploy ok\n${LINE}\n` });
  const r = await checkGiveUp(ctx);
  assert.deepEqual({ checked: r.checked, alerts: r.alerts }, { checked: true, alerts: 1 });
  assert.equal(calls.tg.length, 2);
  assert.deepEqual(calls.tg.map((c) => c.chatId), [1000001, 1000002]);
  assert.equal(calls.comments.length, 1);
  assert.equal(calls.comments[0].issueId, 'uuid-BIL-1');
  const seen = JSON.parse(fs.readFileSync(seenFile, 'utf8'));
  assert.deepEqual(Object.keys(seen), [lineKey(LINE)]);
  assert.equal(seen[lineKey(LINE)].tg, true);
  assert.equal(seen[lineKey(LINE)].pc, true);
});

test('seen line survives a process restart: fresh ctx on same seenFile does not re-alert', async () => {
  const first = makeCtx({ sshOut: LINE });
  await checkGiveUp(first.ctx);
  // "Restart": komplett neuer Kontext, neuer In-Memory-State, gleiche Datei.
  const second = makeCtx({ sshOut: LINE, seenFile: first.seenFile });
  const r = await checkGiveUp(second.ctx);
  assert.equal(r.alerts, 0);
  assert.equal(second.calls.tg.length, 0);
  assert.equal(second.calls.comments.length, 0);
});

test('legacy state.giveupSeen lines are migrated as fully delivered', async () => {
  const { ctx, calls, state } = makeCtx({ sshOut: LINE });
  state.giveupSeen = [LINE];
  const r = await checkGiveUp(ctx);
  assert.equal(r.alerts, 0);
  assert.equal(calls.tg.length, 0);
  assert.equal(calls.comments.length, 0);
});

test('ssh failure only logs a warning, no alert, no seen entry', async () => {
  const { ctx, calls, seenFile } = makeCtx({ sshFail: true });
  const r = await checkGiveUp(ctx);
  assert.deepEqual({ checked: r.checked, alerts: r.alerts }, { checked: false, alerts: 0 });
  assert.equal(calls.tg.length, 0);
  assert.equal(fs.existsSync(seenFile), false);
  assert.match(calls.logs.join('\n'), /giveup-watch WARN: ssh/);
});

test('telegram failure still posts exactly one comment; retry tick sends telegram without a second comment', async () => {
  const { ctx, calls, seenFile, flags } = makeCtx({ sshOut: LINE, tgFail: true });
  const r1 = await checkGiveUp(ctx);
  assert.equal(r1.alerts, 1);
  assert.equal(calls.tg.length, 0);
  assert.equal(calls.comments.length, 1);
  let seen = JSON.parse(fs.readFileSync(seenFile, 'utf8'));
  assert.equal(seen[lineKey(LINE)].tg, false);
  assert.equal(seen[lineKey(LINE)].pc, true);
  // Nächster Tick, Telegram wieder erreichbar: nur der fehlende Kanal feuert.
  flags.tgFail = false;
  const r2 = await checkGiveUp(ctx);
  assert.equal(r2.alerts, 0);
  assert.equal(calls.tg.length, 2);
  assert.equal(calls.comments.length, 1);
  seen = JSON.parse(fs.readFileSync(seenFile, 'utf8'));
  assert.equal(seen[lineKey(LINE)].tg, true);
});

test('paperclip failure still sends telegram once; retry tick posts comment without re-sending telegram', async () => {
  const { ctx, calls, flags } = makeCtx({ sshOut: LINE, pcFail: true });
  const r1 = await checkGiveUp(ctx);
  assert.equal(r1.alerts, 1);
  assert.equal(calls.tg.length, 2);
  assert.equal(calls.comments.length, 0);
  flags.pcFail = false;
  const r2 = await checkGiveUp(ctx);
  assert.equal(r2.alerts, 0);
  assert.equal(calls.tg.length, 2);
  assert.equal(calls.comments.length, 1);
});

test('both channels down: nothing persisted, full retry next tick', async () => {
  const { ctx, calls, seenFile, flags } = makeCtx({ sshOut: LINE, tgFail: true, pcFail: true });
  const r1 = await checkGiveUp(ctx);
  assert.equal(r1.alerts, 0);
  assert.equal(fs.existsSync(seenFile), false);
  flags.tgFail = false;
  flags.pcFail = false;
  const r2 = await checkGiveUp(ctx);
  assert.equal(r2.alerts, 1);
  assert.equal(calls.tg.length, 2);
  assert.equal(calls.comments.length, 1);
});

test('loadSeen tolerates a corrupt file and saveSeen writes atomically', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'giveup-test-'));
  const file = path.join(dir, 'giveup-seen.json');
  fs.writeFileSync(file, '{not json');
  assert.deepEqual(loadSeen(file), {});
  saveSeen(file, { a: { tg: true, pc: true, ts: 'x', line: 'l' } });
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).a.tg, true);
  assert.equal(fs.existsSync(`${file}.tmp`), false);
});
