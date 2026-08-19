import { readFileSync } from "node:fs";

const API = process.env.PAPERCLIP_API_URL;
const KEY = process.env.PAPERCLIP_API_KEY;
const ISSUE_ID = "7f4984d3-ba8d-438f-82ca-e1f7f89dc488";
const QA_AGENT_ID = "3faeae55-de86-4195-801d-e71aff443e60";

const body = readFileSync(new URL("./bil2483-approve.md", import.meta.url), "utf8");

const commentRes = await fetch(`${API}/api/issues/${ISSUE_ID}/comments`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${KEY}`,
  },
  body: JSON.stringify({ body }),
});
console.log("comment status", commentRes.status);
console.log(await commentRes.text());

const patchRes = await fetch(`${API}/api/issues/${ISSUE_ID}`, {
  method: "PATCH",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${KEY}`,
  },
  body: JSON.stringify({ assigneeAgentId: QA_AGENT_ID, status: "in_review" }),
});
console.log("patch status", patchRes.status);
console.log(await patchRes.text());
