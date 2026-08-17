import fs from 'node:fs';
const API=process.env.PAPERCLIP_API_URL, KEY=process.env.PAPERCLIP_API_KEY;
const H={authorization:`Bearer ${KEY}`,'content-type':'application/json'};
const BIL1='6ed67fea-3d4f-444a-b770-bfda823387b6';
const body=fs.readFileSync('bil2490-board-comment.md','utf8');
const r=await fetch(`${API}/api/issues/${BIL1}/comments`,{method:'POST',headers:H,body:JSON.stringify({body})});
console.log('BIL-1 comment', r.status, (await r.text()).slice(0,200));
