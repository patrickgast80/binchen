// BIL-2527 — Status setzen. `node bil2527-status.mjs <status>`
const API = process.env.PAPERCLIP_API_URL || "http://localhost:3100";
const KEY = process.env.PAPERCLIP_API_KEY;
const AUTH = { Authorization: `Bearer ${KEY}`, "content-type": "application/json" };

const status = process.argv[2];
if (!status) throw new Error("status fehlt");

const issue = await (await fetch(`${API}/api/issues/BIL-2527`, { headers: AUTH })).json();
const res = await fetch(`${API}/api/issues/${issue.id}`, {
  method: "PATCH",
  headers: AUTH,
  body: JSON.stringify({ status }),
});
console.log(`PATCH status=${status} -> ${res.status}`);
if (!res.ok) console.log((await res.text()).slice(0, 400));
