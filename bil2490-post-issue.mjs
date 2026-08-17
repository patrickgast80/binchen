import fs from 'node:fs';
const API=process.env.PAPERCLIP_API_URL, KEY=process.env.PAPERCLIP_API_KEY;
const H={authorization:`Bearer ${KEY}`,'content-type':'application/json'};
const ID='3bf49614-930d-4fb0-8300-6cae34320351';
const body=fs.readFileSync('bil2490-issue-comment.md','utf8');
let r=await fetch(`${API}/api/issues/${ID}/comments`,{method:'POST',headers:H,body:JSON.stringify({body})});
console.log('comment', r.status, (await r.text()).slice(0,120));
r=await fetch(`${API}/api/issues/${ID}`,{method:'PATCH',headers:H,body:JSON.stringify({status:'blocked'})});
console.log('patch', r.status, (await r.text()).slice(0,200));
