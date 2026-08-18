// CEO 2026-08-18: Telegram-Ack an Patrick — Stoff-Rotation im Konfigurator ist
// als BIL-2492 ans Frontend delegiert. Nur sendMessage, kein getUpdates (409-Konflikt).
import { readFileSync } from 'node:fs';

const envText = readFileSync(new URL('../../infra/.vault/telegram-bridge.env', import.meta.url), 'utf8');
const env = Object.fromEntries(
  envText.split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const token = env.TELEGRAM_BOT_TOKEN;
const chatId = env.TELEGRAM_ALLOWED_USER_IDS.split(',')[0].trim();

const text = [
  'Gute Idee, machen wir! 👍',
  '',
  'Der Stoff im Konfigurator wird drehbar (in 90°-Schritten), die Drehung ist direkt in der Vorschau sichtbar und bleibt auch beim Speichern und Teilen einer Konfiguration erhalten.',
  '',
  'Das Frontend-Team hat das Ticket (BIL-2492) schon auf dem Tisch. Ich melde mich, sobald es live auf bilulu.de ist.',
].join('\n');

const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
});
const j = await r.json();
console.log(JSON.stringify({ ok: j.ok, message_id: j.result?.message_id, chat: j.result?.chat?.id }, null, 2));
if (!j.ok) { console.error(j); process.exit(1); }
