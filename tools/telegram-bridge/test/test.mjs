// Fixture tests for the Telegram bridge (BIL-2481) — no token, no network.
// Run: node --test tools/telegram-bridge/test/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  routeMessage, formatComment, parseEnvFile, handleUpdate,
  makePaperclipClient, makeTelegramClient, HELP_TEXT,
} from '../lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(fs.readFileSync(path.join(here, 'fixtures.json'), 'utf8')).updates;

// ---------------------------------------------------------------- routing

test('routeMessage: plain text goes to default issue', () => {
  assert.deepEqual(routeMessage('hallo welt', 'BIL-1'), { kind: 'comment', issueKey: 'BIL-1', body: 'hallo welt' });
});

test('routeMessage: explicit issue key prefix', () => {
  const r = routeMessage('bil-2478: sieht gut aus', 'BIL-1');
  assert.equal(r.issueKey, 'BIL-2478');
  assert.equal(r.body, 'sieht gut aus');
});

test('routeMessage: /new with title and body', () => {
  const r = routeMessage('/new Titel hier\nZeile 2\nZeile 3', 'BIL-1');
  assert.equal(r.kind, 'new_issue');
  assert.equal(r.title, 'Titel hier');
  assert.equal(r.description, 'Zeile 2\nZeile 3');
});

test('routeMessage: bare /new is a usage error, /help is help', () => {
  assert.equal(routeMessage('/new', 'BIL-1').kind, 'usage');
  assert.equal(routeMessage('/help', 'BIL-1').kind, 'help');
});

test('formatComment carries author and body', () => {
  const msg = fixtures[0].message;
  const c = formatComment(msg, 'Testtext');
  assert.match(c, /Telegram/);
  assert.match(c, /Sabine/);
  assert.match(c, /Testtext/);
});

test('parseEnvFile: comments, quotes, whitespace', () => {
  const v = parseEnvFile('# c\nA=1\nB = "two" \n\nC=\'3\'\nBROKEN\n');
  assert.deepEqual(v, { A: '1', B: 'two', C: '3' });
});

// ---------------------------------------------------------------- fakes

function makeFakes() {
  const calls = { comments: [], issues: [], uploads: [], replies: [], logs: [] };
  const ctx = {
    cfg: { allowedUserIds: [1000001], defaultIssueKey: 'BIL-1' },
    log: (l) => calls.logs.push(l),
    saveMedia: async (filename) => `/fake/media/${filename}`,
    tg: {
      sendMessage: async (chatId, text, replyTo) => { calls.replies.push({ chatId, text, replyTo }); return { message_id: 99 }; },
      getFile: async (file_id) => ({ file_id, file_path: `photos/${file_id}.jpg` }),
      downloadFile: async () => Buffer.from('fake-jpeg-bytes'),
    },
    pc: {
      resolveIssue: async (key) => (key === 'BIL-404' ? null : { id: `uuid-${key}`, identifier: key, title: 't' }),
      postComment: async (issueId, body) => { calls.comments.push({ issueId, body }); return { id: `c-${calls.comments.length}` }; },
      createIssue: async ({ title, description }) => { calls.issues.push({ title, description }); return { id: 'uuid-new', identifier: 'BIL-9999' }; },
      uploadAttachment: async (issueId, filename) => { calls.uploads.push({ issueId, filename }); return { id: 'att-1' }; },
    },
  };
  return { ctx, calls };
}

// ---------------------------------------------------------------- handler

test('fixture 1: plain text -> comment on default issue + confirmation', async () => {
  const { ctx, calls } = makeFakes();
  const res = await handleUpdate(fixtures[0], ctx);
  assert.equal(res.ok, 'comment');
  assert.equal(calls.comments[0].issueId, 'uuid-BIL-1');
  assert.match(calls.comments[0].body, /Muetzen-Fotos/);
  assert.match(calls.replies[0].text, /✅ Kommentar auf BIL-1/);
});

test('fixture 2: BIL-2478 prefix -> comment on that issue', async () => {
  const { ctx, calls } = makeFakes();
  const res = await handleUpdate(fixtures[1], ctx);
  assert.equal(res.identifier, 'BIL-2478');
  assert.equal(calls.comments[0].issueId, 'uuid-BIL-2478');
  assert.ok(!calls.comments[0].body.includes('BIL-2478:'), 'key prefix stripped from body');
});

test('fixture 3: /new -> issue created + confirmation with identifier', async () => {
  const { ctx, calls } = makeFakes();
  const res = await handleUpdate(fixtures[2], ctx);
  assert.equal(res.ok, 'new_issue');
  assert.equal(calls.issues[0].title, 'Neue Stoffmuster fotografieren');
  assert.match(calls.issues[0].description, /Herbststoffe/);
  assert.match(calls.replies[0].text, /BIL-9999/);
});

test('fixture 4: non-allowlisted user is ignored silently', async () => {
  const { ctx, calls } = makeFakes();
  const res = await handleUpdate(fixtures[3], ctx);
  assert.equal(res.skipped, 'not-allowlisted');
  assert.equal(calls.comments.length, 0);
  assert.equal(calls.replies.length, 0, 'no reply to strangers');
  assert.equal(calls.logs.length, 1);
});

test('fixture 5: photo with caption -> largest size uploaded, comment references attachment', async () => {
  const { ctx, calls } = makeFakes();
  const res = await handleUpdate(fixtures[4], ctx);
  assert.equal(res.identifier, 'BIL-2462');
  assert.equal(calls.uploads[0].issueId, 'uuid-BIL-2462');
  assert.match(calls.uploads[0].filename, /telegram-1000001-15\.jpg/);
  assert.match(calls.comments[0].body, /att-1/);
});

test('fixture 5 variant: failed upload falls back to local path in comment', async () => {
  const { ctx, calls } = makeFakes();
  ctx.pc.uploadAttachment = async () => null;
  await handleUpdate(fixtures[4], ctx);
  assert.match(calls.comments[0].body, /\/fake\/media\/telegram-1000001-15\.jpg/);
});

test('fixture 6: /help replies with help text, posts nothing', async () => {
  const { ctx, calls } = makeFakes();
  await handleUpdate(fixtures[5], ctx);
  assert.equal(calls.replies[0].text, HELP_TEXT);
  assert.equal(calls.comments.length, 0);
});

test('unknown issue key -> friendly not-found reply, no crash', async () => {
  const { ctx, calls } = makeFakes();
  const upd = JSON.parse(JSON.stringify(fixtures[1]));
  upd.message.text = 'BIL-404: hallo';
  const res = await handleUpdate(upd, ctx);
  assert.equal(res.ok, 'not-found');
  assert.match(calls.replies[0].text, /nicht gefunden/);
});

test('paperclip error -> error reply to telegram, handler survives', async () => {
  const { ctx, calls } = makeFakes();
  ctx.pc.postComment = async () => { throw new Error('boom 500'); };
  const res = await handleUpdate(fixtures[0], ctx);
  assert.ok(res.error);
  assert.match(calls.replies[0].text, /Bridge-Fehler/);
});

// ---------------------------------------------------------------- clients

test('paperclip client: 401 triggers one token reload + retry', async () => {
  let tokens = [];
  let attempt = 0;
  const fetchImpl = async (url, opts) => {
    tokens.push(opts.headers.Authorization);
    attempt++;
    if (attempt === 1) return { status: 401, ok: false, text: async () => 'expired' };
    return { status: 200, ok: true, json: async () => ({ id: 'i1', identifier: 'BIL-1' }) };
  };
  const provider = (force) => (force ? 'fresh-token' : 'stale-token');
  const pc = makePaperclipClient({ apiUrl: 'http://x', tokenProvider: provider, companyId: 'c', projectId: 'p', fetchImpl });
  const issue = await pc.resolveIssue('BIL-1');
  assert.equal(issue.id, 'i1');
  assert.deepEqual(tokens, ['Bearer stale-token', 'Bearer fresh-token']);
});

test('telegram client: getUpdates calls correct URL, non-ok raises with code', async () => {
  const seen = [];
  const fetchImpl = async (url, opts) => {
    seen.push({ url, body: JSON.parse(opts.body) });
    return { json: async () => ({ ok: false, error_code: 409, description: 'Conflict' }) };
  };
  const tg = makeTelegramClient({ botToken: 'TESTTOKEN', fetchImpl });
  await assert.rejects(() => tg.getUpdates(5, 50), (e) => e.telegram.error_code === 409);
  assert.match(seen[0].url, /botTESTTOKEN\/getUpdates$/);
  assert.equal(seen[0].body.offset, 5);
});
