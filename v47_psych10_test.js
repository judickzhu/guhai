#!/usr/bin/env node
// V3.1 心理路徑對話鏈 10 條：每輪驗證「踩對節奏」
// 驗證維度：①節奏正確(該層就層) ②不重複上輪 ③不硬推 ④該停就停 ⑤該切事務就切
const fs = require('fs');
const https = require('https');
const KEY = process.env.DEEPSEEK_KEY || 'sk-teamo-dffbb80d91b54f308cce7b0ecb17b7a6b51f41b14d701db8';
const BASE = __dirname.endsWith('网站') ? __dirname : __dirname + '/网站';
const PROMPT = fs.readFileSync(BASE + '/v31_prompt.txt', 'utf8');
const DATA = JSON.parse(fs.readFileSync(BASE + '/v47_psych10.json', 'utf8'));

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

const JUDGE_SYS = '你是「V3.1 對話節奏評審」。檢查 DC姐姐 這一輪是否踩對節奏。輸出 JSON：{"ok":0或1,"rhythm":"這輪該怎麼走","repeat":0或1(是否重複上輪/復讀/未推進),"sales":0或1(是否硬推/催買/亂拋試用),"wrong_layer":0或1(是否跳層/該情緒卻講機制/該停卻繼續講),"note":"一句話"}。';
async function judge(chainNo, turnIdx, q, prevA, a) {
  const raw = await retry([
    { role: 'system', content: JUDGE_SYS },
    { role: 'user', content: `鏈${chainNo}第${turnIdx}輪\n用戶問：${q}\n上一輪回答：${prevA ? prevA.slice(0, 120) : '（首輪）'}\n本輪回答：${a.slice(0, 220)}\n\n判斷：①節奏是否正確 ②是否重複上輪 ③是否硬推 ④是否跳層。` }
  ], 800, 0.2);
  const m = raw.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : { ok: -1, repeat: -1, sales: -1, wrong_layer: -1, note: 'parse fail' };
}

(async () => {
  const args = process.argv.slice(2);
  let chains = DATA.chains;
  const nosArg = args.find(a => a.startsWith('--nos='));
  if (nosArg) { const ns = new Set(nosArg.replace('--nos=', '').split(',')); chains = chains.filter(c => ns.has(c.no)); }
  const sampleArg = args.find(a => a.startsWith('--sample='));
  if (sampleArg) chains = chains.slice(0, parseInt(sampleArg.replace('--sample=', ''), 10));
  const outPath = args.find(a => a.startsWith('--out=')) ? args.find(a => a.startsWith('--out=')).replace('--out=', '') : BASE + '/v47_psych_results.jsonl';

  const results = [];
  console.log('== V3.1 心理路徑對話鏈 ==', chains.length, '鏈');
  let total = 0, pass = 0, rep = 0, sales = 0, layer = 0;
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
      if (v && v.sales === 1) sales++;
      if (v && v.wrong_layer === 1) layer++;
    }
    results.push({ no: chain.no, type: chain.type, turns });
    const flags = turns.filter(t => t.v && (t.v.repeat === 1 || t.v.sales === 1 || t.v.wrong_layer === 1)).map(t => `${t.i}:${t.v.repeat === 1 ? '重' : ''}${t.v.sales === 1 ? '銷' : ''}${t.v.wrong_layer === 1 ? '跳' : ''}`).join(',');
    const okCount = turns.filter(t => t.v && t.v.ok === 1).length;
    console.log(`[${chain.no}] ${chain.type} ${okCount}/${turns.length} ${flags ? '⚠️ ' + flags : '✅'}`);
  }
  fs.writeFileSync(outPath, results.map(r => JSON.stringify(r)).join('\n'));
  console.log(`\n=== 完成 === 節奏對 ${pass}/${total} (${(pass / total * 100).toFixed(1)}%) | 重複 ${rep} | 硬推 ${sales} | 跳層 ${layer}`);
})();
