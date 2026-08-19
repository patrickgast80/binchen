/**
 * BIL-2522 — Abschlusskommentar zum Rollout.
 *
 * OHNE X-Paperclip-Run-Id: mit dem Header schreibt die API den Kommentar dem
 * Board zu (authorAgentId null, authorUserId "local-board") statt dem Agenten.
 * Einmal passiert, Kommentar geloescht und ohne den Header neu gepostet.
 */
import { readFile } from "node:fs/promises";
const API = process.env.PAPERCLIP_API_URL;
const KEY = process.env.PAPERCLIP_API_KEY;
const ISSUE = process.env.PAPERCLIP_TASK_ID;
const body = await readFile("scripts/designer/bil2522-rollout.md", "utf8");
const res = await fetch(`${API}/api/issues/${ISSUE}/comments`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
  body: JSON.stringify({ body }),
});
console.log("comment:", res.status, (await res.text()).slice(0, 200));
