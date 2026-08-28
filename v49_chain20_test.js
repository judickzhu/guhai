#!/usr/bin/env node
// V3.1 第一批連續狀態鏈：20 鏈 + 死亡測試
// 統一評分 7 項：①意圖②情緒③認知層④連續性⑤克制⑥轉場⑦自然度
// 特別規則：同一認知上輪講過，下一輪禁止重新包裝再講
const fs = require('fs');
const https = require('https');
const KEY = process.env.DEEPSEEK_KEY || 'sk-teamo-dffbb80d91b54f308cce7b0ecb17b7a6b51f41b14d701db8';
const BASE = __dirname.endsWith('网站') ? __dirname : __dirname + '/网站';
const PROMPT = fs.readFileSync(BASE + '/v31_prompt.txt', 'utf8');
const DATA = JSON.parse(fs.readFileSync(BASE + '/v49_chain20.json', 'utf8'));

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

// 用戶 7 項評分標準評審
const JUDGE_SYS = '你是「V3.1 連續狀態鏈評審」。按 7 項標準評 DC姐姐 這一輪：①意圖(聽明用戶問乜)②情緒(接住當下狀態)③認知層(推進一層非原地打轉)④連續性(記住上輪講過乜)⑤克制(忍住唔急住賣)⑥轉場(認知完成自然進事務)⑦自然度(似人講話非模板)。另檢查「重複認知」：同一個認知上輪講過，呢輪禁止重新包裝再講。輸出 JSON：{"i1":0或1,"i2":0或1,"i3":0或1,"i4":0或1,"i5":0或1,"i6":0或1,"i7":0或1,"repeat":0或1,"ok":0或1,"note":"一句話"}。';
async function judge(chainNo, turnIdx, q, prevA, a) {
  const raw = await retry([
    { role: 'system', content: JUDGE_SYS },
    { role: 'user', content: `鏈${chainNo}第${turnIdx}輪\n用戶問：${q}\n上一輪回答：${prevA ? prevA.slice(0, 140) : '（首輪）'}\n本輪回答：${a.slice(0, 240)}\n\n評 7 項 + 是否重複上輪認知。` }
  ], 800, 0.2);
  const m = raw.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : { ok: -1, note: 'parse fail' };
}

(async () => {
  const args = process.argv.slice(2);
  let chains = DATA.chains;
  const nosArg = args.find(a => a.startsWith('--nos='));
  if (nosArg) { const ns = new Set(nosArg.replace('--nos=', '').split(',')); chains = chains.filter(c => ns.has(c.no)); }
  const sampleArg = args.find(a => a.startsWith('--sample='));
  if (sampleArg) chains = chains.slice(0, parseInt(sampleArg.replace('--sample=', ''), 10));
  const outPath = args.find(a => a.startsWith('--out=')) ? args.find(a => a.startsWith('--out=')).replace('--out=', '') : BASE + '/v49_chain20_results.jsonl';

  const results = [];
  console.log('== V3.1 第一批連續狀態鏈 ==', chains.length, '鏈');
  let total = 0, pass = 0, rep = 0;
  const dimCount = { i1: 0, i2: 0, i3: 0, i4: 0, i5: 0, i6: 0, i7: 0 };
  const dimTotal = { i1: 0, i2: 0, i3: 0, i4: 0, i5: 0, i6: 0, i7: 0 };
  for (const chain of chains) {
    const msgs = [{ role: 'system', content: PROMPT }];
    const turns = [];
    for (let i = 0; i < chain.turns.length; i++) {
      msgs.push({ role: 'user', content: chain.turns[i] });
      const raw = await retry(msgs, 1600, 0.7);
      const a = raw.replace(/\n?\[COG\|[^\]]*\]/, '').trim();
      msgs.push({ role: 'assistant', content: a });
      const prev = turns[turns.length - 1];
      let v = null;
      try { v = await judge(chain.no, i + 1, chain.turns[i], prev ? prev.a : '', a); } catch (e) { v = { note: 'judge fail' }; }
      turns.push({ i: i + 1, q: chain.turns[i], a, v });
      total++; if (v && v.ok === 1) pass++;
      if (v && v.repeat === 1) rep++;
      ['i1','i2','i3','i4','i5','i6','i7'].forEach(k => { dimTotal[k]++; if (v && v[k] === 1) dimCount[k]++; });
    }
    results.push({ no: chain.no, type: chain.type, turns });
    const okCount = turns.filter(t => t.v && t.v.ok === 1).length;
    const flags = turns.filter(t => t.v && (t.v.repeat === 1)).map(t => `${t.i}:重`).join(',');
    console.log(`[${chain.no}] ${chain.type} ${okCount}/${turns.length} ${flags ? '⚠️ ' + flags : '✅'}`);
  }
  fs.writeFileSync(outPath, results.map(r => JSON.stringify(r)).join('\n'));
  console.log(`\n=== 完成 === 整體 ${pass}/${total} (${(pass / total * 100).toFixed(1)}%) | 重複認知 ${rep}`);
  console.log('7 項評分: ' + ['i1','i2','i3','i4','i5','i6','i7'].map(k => `${k}=${dimCount[k]}/${dimTotal[k]}`).join(' '));
})();
