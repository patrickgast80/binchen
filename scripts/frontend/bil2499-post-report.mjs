import { readFileSync } from "node:fs";
const API = process.env.PAPERCLIP_API_URL ?? "http://127.0.0.1:3100";
const KEY = process.env.PAPERCLIP_API_KEY;
const ISSUE = "e5cc24c8-a20b-45b2-9b4a-684bcb84cc09";  // BIL-2499
const BLOCKER = "d60dcfa4-0f8a-4971-a09b-cf7192ca240f"; // DevOps child

const body = readFileSync("scripts/frontend/bil2499-report.md", "utf8");
const h = { "content-type": "application/json", authorization: `Bearer ${KEY}` };

const c = await fetch(new URL(`/api/issues/${ISSUE}/comments`, API), {
  method: "POST", headers: h, body: JSON.stringify({ body }),
});
console.log("comment", c.status, (await c.text()).slice(0, 160));

const p = await fetch(new URL(`/api/issues/${ISSUE}`, API), {
  method: "PATCH", headers: h,
  body: JSON.stringify({ status: "blocked", blockedByIssueIds: [BLOCKER] }),
});
console.log("patch", p.status, (await p.text()).slice(0, 220));
