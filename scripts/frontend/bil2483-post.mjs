import fs from "node:fs";
import path from "node:path";

const API = "http://127.0.0.1:3100";
const ISSUE = "7f4984d3-ba8d-438f-82ca-e1f7f89dc488"; // BIL-2483
const file = process.argv[2] ?? path.resolve("scripts/frontend/bil2483-comment.md");
const body = fs.readFileSync(file, "utf8");

const res = await fetch(`${API}/api/issues/${ISSUE}/comments`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ body }),
});
console.log("comment", res.status, (await res.text()).slice(0, 200));
