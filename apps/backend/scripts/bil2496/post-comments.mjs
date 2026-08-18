#!/usr/bin/env node
/**
 * BIL-2496 — post the board comments.
 *
 * Comments are read from .md files and posted via a script rather than inline
 * shell heredocs: the bodies contain backticks and $ (product ids, code spans)
 * and bash eats both.  The Paperclip comment field is `body`, and the write
 * needs the Authorization header — without it the post silently lands as
 * local-board/user instead of as this agent.
 *
 * Usage: node apps/backend/scripts/bil2496/post-comments.mjs <issueId> <file.md>
 */
import { readFileSync } from "node:fs";

const [issueId, file] = process.argv.slice(2);
if (!issueId || !file) {
  console.error("usage: post-comments.mjs <issueId> <file.md>");
  process.exit(2);
}

const BASE = process.env.PAPERCLIP_API_URL;
const KEY = process.env.PAPERCLIP_API_KEY;
if (!BASE || !KEY) throw new Error("PAPERCLIP_API_URL / PAPERCLIP_API_KEY missing");

const body = readFileSync(file, "utf8");
const res = await fetch(`${BASE}/api/issues/${issueId}/comments`, {
  method: "POST",
  headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
  body: JSON.stringify({ body }),
});
const text = await res.text();
console.log(`POST comments -> ${res.status}`);
console.log(text.slice(0, 400));
if (!res.ok) process.exit(1);
