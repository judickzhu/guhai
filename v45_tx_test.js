#!/usr/bin/env node
// V3.1 事務題：測「該直接給步驟」——事務問題直接 SOP，不講哲學不教育
const fs = require('fs');
const https = require('https');
const KEY = process.env.DEEPSEEK_KEY || 'sk-teamo-dffbb80d91b54f308cce7b0ecb17b7a6b51f41b14d701db8';
const BASE = __dirname.endsWith('网站') ? __dirname : __dirname + '/网站';
const PROMPT = fs.readFileSync(BASE + '/v31_prompt.txt', 'utf8');
const DATA = JSON.parse(fs.readFileSync(BASE + '/v45_tx_test.json', 'utf8'));

function call(messages, max_tokens = 1600, temperature = 0.7) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: 'deepseek-v4-flash', messages, max_tokens, temperature, stream: false });
    const req = https.request({
      hostname: 'api.teamorouter.cn', path: '/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
        try { resolve(JSON.parse(d).choices[0].message.content); }
        catch (e) { reject(new Error('parse: ' + d.slice(0, 120))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(90000, () => req.destroy(new Error('timeout')));
    req.write(body); req.end();
  });
}
async function retry(messages, mt, temp, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { const raw = await call(messages, mt, temp); if (raw && raw.trim()) return raw; }
    catch (e) { if (i === tries - 1) throw e; }
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error('empty');
}

const JUDGE_SYS = '你是「V3.1 事務題評審」。判斷 DC姐姐 這道事務題是否直接給步驟。輸出 JSON：{"ok":0或1,"action":"實際動作(直接給步驟/給途徑/直接答/是否講哲學)","bad":0或1(是否犯了:講哲學/教育/往產品上拽/繞彎子),"note":"一句話"}。';
async function judge(item, a) {
  const raw = await retry([
    { role: 'system', content: JUDGE_SYS },
    { role: 'user', content: `事務類型：${item.type}\n題目：${item.q}\n預期：${item.expect}\n回答：${a.slice(0, 250)}\n\n判斷：①是否直接給步驟/直接答 ②是否犯忌（講哲學/教育/繞彎子/往產品拽）。` }
  ], 800, 0.2);
  const m = raw.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : { ok: -1, action: 'parse fail', bad: 0, note: '' };
}

(async () => {
  const results = [];
  console.log('== V3.1 事務題 ==', DATA.dimensions.length, '維度');
  let total = 0, pass = 0, bad = 0;
  for (const dim of DATA.dimensions) {
    const dimRes = [];
    for (const item of dim.items) {
      const raw = await retry([{ role: 'system', content: PROMPT }, { role: 'user', content: item.q }], 1600, 0.7);
      const a = raw.replace(/\n?\[COG\|[^\]]*\]/, '').trim();
      let v = null;
      try { v = await judge(item, a); } catch (e) { v = { ok: -1, note: 'judge fail' }; }
      dimRes.push({ no: item.no, q: item.q, type: item.type, a, v });
      total++; if (v && v.ok === 1) pass++; if (v && v.bad === 1) bad++;
      console.log(`[${item.no}] ${v && v.ok === 1 ? '✅' : '❌'} ${item.q.slice(0, 18)} → ${v ? v.action : '?'}${v && v.bad === 1 ? ' ⚠️犯忌' : ''}`);
    }
    results.push({ id: dim.id, name: dim.name, items: dimRes });
  }
  fs.writeFileSync(BASE + '/v45_tx_results.jsonl', results.map(r => JSON.stringify(r)).join('\n'));
  console.log(`\n=== 完成 === 通過 ${pass}/${total} (${(pass / total * 100).toFixed(1)}%) | 犯忌 ${bad}`);
})();
