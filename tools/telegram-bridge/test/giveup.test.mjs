// Tests für den GIVING_UP-Watcher (BIL-2518) — kein Token, kein SSH, kein Netz.
// Run: node --test tools/telegram-bridge/test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGiveUpLines, formatGiveUpAlert, checkGiveUp } from '../giveup-watch.mjs';

const LINE =
  '2026-08-18T12:00:00Z a94e165532c6b2919774a4331849ad3858b06f1a f12ixtdbpa4bl8ks7qe1ln19 GIVING_UP both attempts failed — two-strike reached, investigate in Coolify';

function makeCtx({ sshOut = '', sshFail = false, tgFail = false } = {}) {
  const calls = { tg: [], comments: [], logs: [] };
  const state = { giveupSeen: [] };
  const ctx = {
    cfg: { allowedUserIds: [1000001, 1000002], defaultIssueKey: 'BIL-1' },
    log: (l) => calls.logs.push(l),
    state,
    runRemote: async () => {
      if (sshFail) throw new Error('Permission denied (publickey)');
      return sshOut;
    },
    tg: {
      sendMessage: async (chatId, text) => {
        if (tgFail) throw new Error('403 bot blocked');
        calls.tg.push({ chatId, text });
        return { message_id: 1 };
      },
    },
    pc: {
      resolveIssue: async (key) => ({ id: `uuid-${key}`, identifier: key }),
      postComment: async (issueId, body) => { calls.comments.push({ issueId, body }); return { id: 'c-1' }; },
    },
  };
  return { ctx, calls, state };
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

test('new GIVING_UP line alerts all allowlist users + posts Paperclip comment', async () => {
  const { ctx, calls, state } = makeCtx({ sshOut: `deploy ok\n${LINE}\n` });
  const r = await checkGiveUp(ctx);
  assert.deepEqual({ checked: r.checked, alerts: r.alerts }, { checked: true, alerts: 1 });
  assert.equal(calls.tg.length, 2);
  assert.deepEqual(calls.tg.map((c) => c.chatId), [1000001, 1000002]);
  assert.equal(calls.comments.length, 1);
  assert.equal(calls.comments[0].issueId, 'uuid-BIL-1');
  assert.deepEqual(state.giveupSeen, [LINE]);
});

test('already-seen line does not re-alert', async () => {
  const { ctx, calls, state } = makeCtx({ sshOut: LINE });
  state.giveupSeen = [LINE];
  const r = await checkGiveUp(ctx);
  assert.equal(r.alerts, 0);
  assert.equal(calls.tg.length, 0);
  assert.equal(calls.comments.length, 0);
});

test('ssh failure only logs a warning, no alert, no state change', async () => {
  const { ctx, calls, state } = makeCtx({ sshFail: true });
  const r = await checkGiveUp(ctx);
  assert.deepEqual({ checked: r.checked, alerts: r.alerts }, { checked: false, alerts: 0 });
  assert.equal(calls.tg.length, 0);
  assert.deepEqual(state.giveupSeen, []);
  assert.match(calls.logs.join('\n'), /giveup-watch WARN: ssh/);
});

test('telegram failure keeps line unseen so next tick retries', async () => {
  const { ctx, calls, state } = makeCtx({ sshOut: LINE, tgFail: true });
  const r = await checkGiveUp(ctx);
  assert.equal(r.alerts, 0);
  assert.deepEqual(state.giveupSeen, []);
  assert.match(calls.logs.join('\n'), /Telegram an 1000001 fehlgeschlagen/);
});
