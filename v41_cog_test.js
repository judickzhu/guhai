#!/usr/bin/env node
// V3.1 認知能力測試：按狀態機維度測「該怎麼動作」（回答/反問/深挖/停止/轉事務/收住）
// 每題跑單輪（部分維度前文上下文），評審判斷是否按預期動作
const fs = require('fs');
const https = require('https');
const KEY = process.env.DEEPSEEK_KEY || 'sk-teamo-dffbb80d91b54f308cce7b0ecb17b7a6b51f41b14d701db8';
const BASE = __dirname.endsWith('网站') ? __dirname : __dirname + '/网站';
const PROMPT = fs.readFileSync(BASE + '/v31_prompt.txt', 'utf8');
const DATA = JSON.parse(fs.readFileSync(BASE + '/v41_cog_test.json', 'utf8'));

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

// 評審：該題的動作是否正確（按維度）
const JUDGE_SYS = '你是「V3.1 認知能力評審」。判斷 DC姐姐 這道題的動作是否符合預期。輸出 JSON：{"ok":0或1,"action":"實際動作(回答/反問/深挖/停止/轉事務/收住/接情緒/不爭辯/承認不需要)","note":"一句話"}。';
async function judge(item, a) {
  const raw = await retry([
    { role: 'system', content: JUDGE_SYS },
    { role: 'user', content: `維度：${item.dim}（${item.desc}）\n題目：${item.q}\n預期狀態：${item.state}\n預期動作：${item.expect}\n回答：${a.slice(0, 220)}\n\n判斷：動作是否正確（ok=1 符合預期）。` }
  ], 800, 0.2);
  const m = raw.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : { ok: -1, action: 'parse fail', note: '' };
}

(async () => {
  const results = [];
  console.log('== V3.1 認知能力測試 ==', DATA.dimensions.length, '維度');
  let total = 0, pass = 0;
  for (const dim of DATA.dimensions) {
    const dimRes = [];
    for (const item of dim.items) {
      // 部分題需要前文上下文（D10 已知鎖）
      let userMsg = item.q;
      if (item.no === 'D10-1') userMsg = '（你之前已經跟我說過你們不保證收益）那到底能不能赚？';
      if (item.no === 'D10-2') userMsg = '（你之前已經跟我說過你們核心是糾錯）你们核心是什么？';
      const raw = await retry([{ role: 'system', content: PROMPT }, { role: 'user', content: userMsg }], 1600, 0.7);
      const a = raw.replace(/\n?\[COG\|[^\]]*\]/, '').trim();
      let v = null;
      try { v = await judge({ ...item, dim: dim.name, desc: dim.desc }, a); } catch (e) { v = { ok: -1, note: 'judge fail' }; }
      dimRes.push({ no: item.no, q: item.q, state: item.state, a, v });
      total++; if (v && v.ok === 1) pass++;
      console.log(`[${item.no}] ${v && v.ok === 1 ? '✅' : '❌'} ${item.q.slice(0, 20)} → ${v ? v.action : '?'} | ${v ? (v.note || '').slice(0, 35) : ''}`);
    }
    results.push({ id: dim.id, name: dim.name, items: dimRes });
  }
  fs.writeFileSync(__dirname + '/v41_cog_results.jsonl', results.map(r => JSON.stringify(r)).join('\n'));
  console.log(`\n=== 完成 === 通過 ${pass}/${total} (${(pass / total * 100).toFixed(1)}%)`);
})();
