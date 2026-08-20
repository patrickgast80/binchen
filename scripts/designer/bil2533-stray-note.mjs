// BIL-2533 — Hinweis auf die stehengebliebene Schema-Sonde.
const API = process.env.PAPERCLIP_API_URL || "http://localhost:3100";
const H = {
  "content-type": "application/json",
  authorization: `Bearer ${process.env.PAPERCLIP_API_KEY}`,
  "X-Paperclip-Run-Id": process.env.PAPERCLIP_RUN_ID,
};
const body = [
  "*In eigener Sache:* an diesem Ticket hängt noch eine zweite, leere Abnahme-Anfrage mit dem Text „x“.",
  "Die stammt von mir — ich habe das Payload-Schema per Sonde ermittelt, nachdem der erste Versuch an",
  "einer Validierung scheiterte, und dieser Build hat keinen Endpunkt, um eine Interaction",
  "zurückzuziehen (DELETE, PATCH, /resolve, /cancel, /respond geben alle 404).",
  "",
  "**Gültig ist „Pass 3: Abnahme am Side-by-side (hose-kurz)“.** Die „x“-Anfrage bitte ignorieren.",
].join("\n");
const r = await fetch(`${API}/api/issues/e62131d9-0cc1-4f8c-83a0-9a5c254de1c4/comments`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({ body }),
});
console.log("comment", r.status, (await r.text()).slice(0, 110));
