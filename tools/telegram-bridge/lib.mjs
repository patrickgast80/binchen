// Telegram -> Paperclip bridge, core logic (BIL-2481).
// Pure/injectable so everything is testable without a bot token or network.
import fs from 'node:fs';
import path from 'node:path';

export const HELP_TEXT = [
  'Binchen Telegram-Bridge:',
  '- Text senden -> Kommentar auf dem Default-Issue',
  '- "BIL-1234: Text" -> Kommentar auf BIL-1234',
  '- "/new Titel" (weitere Zeilen = Beschreibung) -> neues Issue',
  '- Foto (optional mit Caption) -> wird als Attachment hochgeladen',
].join('\n');

// ---------------------------------------------------------------- config

export function parseEnvFile(content) {
  const out = {};
  for (const line of String(content).split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[t.slice(0, eq).trim()] = val;
  }
  return out;
}

export function loadConfig(envFilePath) {
  const fileVars = fs.existsSync(envFilePath)
    ? parseEnvFile(fs.readFileSync(envFilePath, 'utf8'))
    : {};
  const get = (k, dflt) => process.env[k] ?? fileVars[k] ?? dflt;
  return {
    envFilePath,
    botToken: get('TELEGRAM_BOT_TOKEN', ''),
    allowedUserIds: get('TELEGRAM_ALLOWED_USER_IDS', '')
      .split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n !== 0),
    paperclipUrl: get('PAPERCLIP_API_URL', 'http://127.0.0.1:3100'),
    paperclipToken: get('PAPERCLIP_TOKEN', ''),
    companyId: get('PAPERCLIP_COMPANY_ID_BRIDGE', get('PAPERCLIP_COMPANY_ID', '')),
    projectId: get('PAPERCLIP_PROJECT_ID', ''),
    defaultIssueKey: get('DEFAULT_ISSUE_KEY', 'BIL-1'),
    mediaDir: get('MEDIA_DIR', path.join(path.dirname(envFilePath), 'telegram-media')),
    stateFile: get('STATE_FILE', path.join(path.dirname(envFilePath), 'telegram-bridge.state.json')),
  };
}

// ---------------------------------------------------------------- routing

export function routeMessage(rawText, defaultIssueKey) {
  const text = String(rawText ?? '').trim();
  if (text === '/start' || text === '/help') return { kind: 'help' };
  if (/^\/new\b/.test(text)) {
    const rest = text.replace(/^\/new\s*/, '');
    if (!rest) return { kind: 'usage', message: 'Nutzung: /new Titel (weitere Zeilen = Beschreibung)' };
    const [title, ...body] = rest.split('\n');
    return { kind: 'new_issue', title: title.trim(), description: body.join('\n').trim() };
  }
  const m = text.match(/^([A-Za-z]{2,10}-\d+)\s*:\s*([\s\S]*)$/);
  if (m) return { kind: 'comment', issueKey: m[1].toUpperCase(), body: m[2].trim() };
  return { kind: 'comment', issueKey: defaultIssueKey, body: text };
}

export function formatComment(msg, body, attachmentLine = '') {
  const from = msg.from || {};
  const who = [from.first_name, from.last_name].filter(Boolean).join(' ') || 'unbekannt';
  const handle = from.username ? ` (@${from.username})` : '';
  const when = new Date((msg.date || 0) * 1000).toISOString();
  const header = `📨 **Telegram** von ${who}${handle} — ${when}`;
  return [header, body || '_(kein Text)_'].join('\n\n') + attachmentLine;
}

// ---------------------------------------------------------------- clients

// tokenProvider(forceReload) -> string. Re-reads the vault env file on 401 so an
// operator can swap in a fresh token without restarting the bridge.
export function makeTokenProvider(cfg) {
  let cached = cfg.paperclipToken;
  return (forceReload) => {
    if (forceReload || !cached) {
      const fresh = loadConfig(cfg.envFilePath);
      if (fresh.paperclipToken) cached = fresh.paperclipToken;
    }
    return cached;
  };
}

export function makePaperclipClient({ apiUrl, tokenProvider, companyId, projectId, fetchImpl = fetch }) {
  async function req(method, urlPath, { json, form } = {}) {
    let res;
    for (let attempt = 0; attempt < 2; attempt++) {
      const headers = { Authorization: `Bearer ${tokenProvider(attempt > 0)}` };
      let body;
      if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
      if (form !== undefined) body = form;
      res = await fetchImpl(apiUrl + urlPath, { method, headers, body });
      if (res.status !== 401) break;
    }
    return res;
  }
  return {
    async resolveIssue(key) {
      const r = await req('GET', `/api/issues/${encodeURIComponent(key)}`);
      if (!r.ok) return null;
      const j = await r.json();
      const issue = j.issue || j;
      return { id: issue.id, identifier: issue.identifier || key, title: issue.title };
    },
    async postComment(issueId, body) {
      const r = await req('POST', `/api/issues/${issueId}/comments`, { json: { body } });
      if (!r.ok) throw new Error(`Paperclip comment failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
      const j = await r.json();
      return j.comment || j;
    },
    async createIssue({ title, description }) {
      const r = await req('POST', `/api/companies/${companyId}/issues`, {
        json: { projectId, title, description: description || 'Erstellt via Telegram-Bridge.', status: 'todo' },
      });
      if (!r.ok) throw new Error(`Paperclip issue create failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
      const j = await r.json();
      return j.issue || j;
    },
    // Returns attachment JSON or null on failure (caller falls back to local path).
    async uploadAttachment(issueId, filename, buffer, mime = 'application/octet-stream') {
      try {
        const fd = new FormData();
        fd.append('file', new Blob([buffer], { type: mime }), filename);
        const r = await req('POST', `/api/companies/${companyId}/issues/${issueId}/attachments`, { form: fd });
        if (!r.ok) return null;
        return await r.json();
      } catch {
        return null;
      }
    },
  };
}

export function makeTelegramClient({ botToken, fetchImpl = fetch, apiBase = 'https://api.telegram.org' }) {
  async function call(method, params) {
    const r = await fetchImpl(`${apiBase}/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params || {}),
    });
    const j = await r.json();
    if (!j.ok) {
      const err = new Error(`Telegram ${method} failed: ${j.error_code} ${j.description}`);
      err.telegram = j;
      throw err;
    }
    return j.result;
  }
  return {
    getUpdates: (offset, timeout = 50) =>
      call('getUpdates', { offset, timeout, allowed_updates: ['message'] }),
    sendMessage: (chat_id, text, reply_to_message_id) =>
      call('sendMessage', { chat_id, text, reply_to_message_id, disable_web_page_preview: true }),
    getFile: (file_id) => call('getFile', { file_id }),
    async downloadFile(file_path) {
      const r = await fetchImpl(`${apiBase}/file/bot${botToken}/${file_path}`);
      if (!r.ok) throw new Error(`Telegram file download failed: ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    },
  };
}

// ---------------------------------------------------------------- handler

const MIME_BY_EXT = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };

export async function handleUpdate(update, ctx) {
  const { cfg, tg, pc, log, saveMedia } = ctx;
  const msg = update.message;
  if (!msg) return { skipped: 'non-message' };
  const uid = msg.from?.id;
  if (!cfg.allowedUserIds.includes(uid)) {
    log(`ignored update ${update.update_id}: user ${uid} not in allowlist`);
    return { skipped: 'not-allowlisted' };
  }
  const chatId = msg.chat.id;
  try {
    const text = msg.text ?? msg.caption ?? '';
    const route = routeMessage(text, cfg.defaultIssueKey);
    if (route.kind === 'help') { await tg.sendMessage(chatId, HELP_TEXT); return { ok: 'help' }; }
    if (route.kind === 'usage') { await tg.sendMessage(chatId, `⚠️ ${route.message}`); return { ok: 'usage' }; }

    // Photo (or image document): download once, upload to whichever issue we target.
    let media = null;
    const photoSize = Array.isArray(msg.photo) && msg.photo.length ? msg.photo[msg.photo.length - 1] : null;
    const imageDoc = msg.document && /^image\//.test(msg.document.mime_type || '') ? msg.document : null;
    const fileRef = photoSize || imageDoc;
    if (fileRef) {
      const f = await tg.getFile(fileRef.file_id);
      const buffer = await tg.downloadFile(f.file_path);
      const ext = (f.file_path.match(/\.\w+$/) || ['.jpg'])[0].toLowerCase();
      const filename = `telegram-${chatId}-${msg.message_id}${ext}`;
      const localPath = await saveMedia(filename, buffer);
      media = { filename, buffer, localPath, mime: MIME_BY_EXT[ext] || 'application/octet-stream' };
    }

    if (route.kind === 'new_issue') {
      const issue = await pc.createIssue({ title: route.title, description: route.description });
      const ident = issue.identifier || issue.id;
      if (media) {
        const att = await pc.uploadAttachment(issue.id, media.filename, media.buffer, media.mime);
        const line = att
          ? `\n\n📎 Foto hochgeladen: Attachment \`${att.id}\` (${media.filename})`
          : `\n\n📎 Foto lokal: \`${media.localPath}\` (Upload fehlgeschlagen)`;
        await pc.postComment(issue.id, formatComment(msg, '(Foto zum neuen Issue)', line));
      }
      await tg.sendMessage(chatId, `✅ Neues Issue ${ident}: ${route.title}`, msg.message_id);
      log(`created issue ${ident} from update ${update.update_id}`);
      return { ok: 'new_issue', identifier: ident };
    }

    if (!route.body && !media) {
      await tg.sendMessage(chatId, '⚠️ Leere Nachricht — nichts gepostet. /help für Syntax.');
      return { ok: 'empty' };
    }

    const target = await pc.resolveIssue(route.issueKey);
    if (!target) {
      await tg.sendMessage(chatId, `⚠️ Issue ${route.issueKey} nicht gefunden.`, msg.message_id);
      return { ok: 'not-found', issueKey: route.issueKey };
    }
    let attachmentLine = '';
    if (media) {
      const att = await pc.uploadAttachment(target.id, media.filename, media.buffer, media.mime);
      attachmentLine = att
        ? `\n\n📎 Foto hochgeladen: Attachment \`${att.id}\` (${media.filename})`
        : `\n\n📎 Foto lokal: \`${media.localPath}\` (Upload fehlgeschlagen)`;
    }
    const comment = await pc.postComment(target.id, formatComment(msg, route.body, attachmentLine));
    await tg.sendMessage(chatId, `✅ Kommentar auf ${target.identifier} (id ${comment.id || 'ok'})`, msg.message_id);
    log(`comment ${comment.id || '?'} on ${target.identifier} from update ${update.update_id}`);
    return { ok: 'comment', identifier: target.identifier, commentId: comment.id };
  } catch (e) {
    log(`ERROR update ${update.update_id}: ${e.stack || e}`);
    try { await tg.sendMessage(chatId, `⚠️ Bridge-Fehler: ${String(e.message || e).slice(0, 300)}`); } catch { /* chat unreachable */ }
    return { error: String(e.message || e) };
  }
}

// ---------------------------------------------------------------- state

export function loadState(stateFile) {
  try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { return { offset: 0 }; }
}

export function saveState(stateFile, state) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(state));
}
