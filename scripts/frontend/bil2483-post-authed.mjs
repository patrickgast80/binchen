import fs from "node:fs";

const API = process.env.PAPERCLIP_API_URL ?? "http://127.0.0.1:3100";
const KEY = process.env.PAPERCLIP_API_KEY;
const ISSUE = "7f4984d3-ba8d-438f-82ca-e1f7f89dc488"; // BIL-2483
if (!KEY) throw new Error("PAPERCLIP_API_KEY missing");

const body = fs.readFileSync(process.argv[2], "utf8");
const res = await fetch(`${API.replace(/\/$/, "")}/api/issues/${ISSUE}/comments`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
  body: JSON.stringify({ body }),
});
const text = await res.text();
const parsed = res.ok ? JSON.parse(text) : null;
console.log(
  res.status,
  parsed ? { id: parsed.id, authorAgentId: parsed.authorAgentId, authorUserId: parsed.authorUserId } : text.slice(0, 300),
);
