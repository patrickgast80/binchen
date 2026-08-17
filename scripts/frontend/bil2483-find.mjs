const API = "http://127.0.0.1:3100";
const res = await fetch(`${API}/api/issues?limit=1000`);
const json = await res.json();
console.log("top-level keys:", Object.keys(json));
const arr = Array.isArray(json) ? json : (json.issues ?? json.data ?? json.items ?? []);
console.log("count:", arr.length);
const wanted = new Set(["BIL-2483", "BIL-2462"]);
for (const i of arr) {
  const key = i.key ?? i.identifier ?? i.slug;
  if (wanted.has(key)) {
    console.log(
      JSON.stringify(
        { key, id: i.id, status: i.status, assigneeId: i.assigneeId, parentId: i.parentId },
        null,
        1,
      ),
    );
  }
}
