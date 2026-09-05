#!/usr/bin/env node
// V4.0 動態對話狀態突變測試：五類不丟線
const fs = require('fs');
const https = require('https');
const KEY = process.env.DEEPSEEK_KEY || 'sk-teamo-dffbb80d91b54f308cce7b0ecb17b7a6b51f41b14d701db8';
const BASE = __dirname.endsWith('网站') ? __dirname : __dirname + '/网站';
const PROMPT = fs.readFileSync(BASE + '/v31_prompt.txt', 'utf8');
const DATA = JSON.parse(fs.readFileSync(BASE + '/v60_dyn_state_test.json', 'utf8'));

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

const JUDGE_SYS = '你是「V4.0 動態狀態評審」。檢查 DC姐姐 面對狀態突變是否不丟線。輸出 JSON：{"ok":0或1,"emo":0或1(情緒突變時是否先接住新情緒而非沿用舊模板),"resume":0或1(話題跳躍後是否恢復之前話題),"reopen":0或1(立場反轉時是否允許重新懷疑而非默認信任),"correct":0或1(假裝理解時是否溫和糾正而非直接認同),"catch":0或1(連續矛盾時是否抓矛盾攻擊),"note":"一句話"}。';
async function judge(chainNo, turnIdx, q, hist, a) {
  const raw = await retry([
    { role: 'system', content: JUDGE_SYS },
    { role: 'user', content: `狀態突變鏈${chainNo}第${turnIdx}輪\n用戶：${q}\n對話歷史：${hist.slice(0, 380)}\nDC姐姐：${a.slice(0, 240)}\n\n判斷：①情緒突變有冇接住新情緒 ②話題跳躍有冇恢復 ③立場反轉有冇允許重新懷疑 ④假裝理解有冇溫和糾正 ⑤連續矛盾有冇抓矛盾。` }
  ], 800, 0.2);
  const m = raw.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : { ok: -1, note: 'parse fail' };
}

(async () => {
  const results = [];
  console.log('== V4.0 動態狀態突變測試 ==', DATA.chains.length, '鏈');
  let total = 0, pass = 0;
  for (const chain of DATA.chains) {
    const msgs = [{ role: 'system', content: PROMPT }];
    const turns = [];
    for (let i = 0; i < chain.turns.length; i++) {
      msgs.push({ role: 'user', content: chain.turns[i] });
      const raw = await retry(msgs, 1600, 0.7);
      const a = raw.replace(/\n?\[COG\|[^\]]*\]/, '').trim();
      msgs.push({ role: 'assistant', content: a });
      turns.push({ i: i + 1, q: chain.turns[i], a });
      const hist = msgs.slice(-6).map(m => (m.role === 'user' ? 'U:' : 'A:') + String(m.content).slice(0, 55)).join(' ');
      let v = null;
      try { v = await judge(chain.no, i + 1, chain.turns[i], hist, a); } catch (e) { v = { note: 'judge fail' }; }
      turns[turns.length - 1].v = v;
      total++; if (v && v.ok === 1) pass++;
    }
    results.push({ no: chain.no, type: chain.type, turns });
    const flags = [];
    turns.forEach(t => { const v = t.v || {}; if (v.emo === 1) flags.push(`R${t.i}接情緒✅`); if (v.resume === 1) flags.push(`R${t.i}恢復✅`); if (v.catch === 1) flags.push(`R${t.i}⚠️抓矛盾`); });
    const okCount = turns.filter(t => t.v && t.v.ok === 1).length;
    console.log(`[${chain.no}] ${chain.type} ${okCount}/${turns.length} ${flags.join(' ') || ''}`);
  }
  fs.writeFileSync(BASE + '/v60_dyn_state_results.jsonl', results.map(r => JSON.stringify(r)).join('\n'));
  console.log(`\n=== 完成 === 通過 ${pass}/${total} (${(pass / total * 100).toFixed(1)}%)`);
})();
