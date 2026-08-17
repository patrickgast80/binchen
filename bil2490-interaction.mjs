const API=process.env.PAPERCLIP_API_URL, KEY=process.env.PAPERCLIP_API_KEY;
const H={authorization:`Bearer ${KEY}`,'content-type':'application/json'};
const ID='3bf49614-930d-4fb0-8300-6cae34320351';
const o=(id,label)=>({id,label});
const payload={
  kind:'ask_user_questions',
  continuationPolicy:'wake_assignee',
  idempotencyKey:`ask:${ID}:grouping-and-deletion:v2`,
  payload:{version:1,
    prompt:'Freigabe der Set-Gruppierung + Löschumfang (Details im Kommentar auf BIL-1 und in docs/BIL2490-SET-GRUPPIERUNG.md)',
    questions:[
      {id:'deletion_scope', selectionMode:'single',
       prompt:'Löschumfang: 14 der 15 neuen Gruppen existieren im Shop schon (dort werden nur die Bilder ersetzt). Was soll mit den 19 übrigen Produkten passieren?',
       options:[
         o('A','A — alle 19 löschen (6 Demo-Artikel + 13 echte Artikel ohne neues Foto). Shop hat danach 15 Produkte.'),
         o('B','B — nur die 6 Demo-Artikel löschen; die 13 echten Artikel bleiben mit alten Fotos online, bis Fotos nachkommen.')
       ]},
      {id:'same_fabric_2_13', selectionMode:'single',
       prompt:'Sind 8dc754d4 (flach) und 1b63320f (am Kopf) — beide creme mit Bordeaux-Schleife — derselbe Artikel?',
       options:[o('same','Ja, ein Produkt (Kopf-Foto als Zweitbild)'),o('different','Nein, zwei verschiedene Produkte')]},
      {id:'set_prices', selectionMode:'single',
       prompt:'Set-Preise: Pusteblumen-Set (Dreieckstuch + Halstuch) 24,90 € und Zoo/Dino-Set 22,90 € — vorher waren die Einzelteile 15,90 € bzw. 14,90 €. Passt das?',
       options:[o('ok','Passt so'),o('other','Ich nenne andere Preise im Kommentar')]}
    ]}};
const r=await fetch(`${API}/api/issues/${ID}/interactions`,{method:'POST',headers:H,body:JSON.stringify(payload)});
const t=await r.text();
console.log('interaction', r.status, t.slice(0,300));
