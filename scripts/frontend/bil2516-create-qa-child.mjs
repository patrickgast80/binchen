import { readFileSync } from "node:fs";

const API = process.env.PAPERCLIP_API_URL;
const KEY = process.env.PAPERCLIP_API_KEY;
const RUN = process.env.PAPERCLIP_RUN_ID;
const PARENT = process.env.PAPERCLIP_TASK_ID; // BIL-2516
const COMPANY = process.env.PAPERCLIP_COMPANY_ID;
const PROJECT = "5e251e01-8c35-4243-9a64-ebccc2ffed74";
const QA = "3faeae55-de86-4195-801d-e71aff443e60";

const description = readFileSync("scripts/frontend/bil2516-qa-handoff.md", "utf8");

const res = await fetch(`${API}/api/companies/${COMPANY}/issues`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${KEY}`,
    "X-Paperclip-Run-Id": RUN,
  },
  body: JSON.stringify({
    projectId: PROJECT,
    parentId: PARENT,
    title: "QA: E2E-Abnahme BIL-2516 — sichtbarer Fehlschlag bei 'In den Warenkorb' (Produktseite + Warenkorb)",
    description,
    status: "todo",
    priority: "medium",
    assigneeId: QA,
  }),
});
const txt = await res.text();
console.log("create:", res.status, txt.slice(0, 300));
if (!res.ok) process.exit(3);
const issue = JSON.parse(txt);
console.log("NEW_ISSUE_ID=" + issue.id);
console.log("NEW_ISSUE_KEY=" + (issue.identifier || issue.key || ""));
