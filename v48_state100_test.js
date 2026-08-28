#!/usr/bin/env node
// V3.1 認知狀態機壓力測試：20鏈×5輪=100狀態轉換
// 驗證：①狀態推進(每輪該升層就升層) ②不重複認知 ③認知完成→事務切換 ④不轉人工(除非用戶明確) ⑤不廣告(不硬推)
const fs = require('fs');
const https = require('https');
const KEY = process.env.DEEPSEEK_KEY || 'sk-teamo-dffbb80d91b54f308cce7b0ecb17b7a6b51f41b14d701db8';
const BASE = __dirname.endsWith('网站') ? __dirname : __dirname + '/网站';
const PROMPT = fs.readFileSync(BASE + '/v31_prompt.txt', 'utf8');
const DATA = JSON.parse(fs.readFileSync(BASE + '/v48_state100.json', 'utf8'));

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

const JUDGE_SYS = '你是「V3.1 認知狀態機評審」。檢查 DC姐姐 這一輪的狀態轉換是否正確。輸出 JSON：{"ok":0或1,"state":"當前應處狀態(S0-S6)","repeat":0或1(是否重複上輪認知/答案復讀),"jump":0或1(是否跳層:該情緒卻講機制/該停卻繼續/該事務卻教育),"human":0或1(是否不必要轉人工),"ad":0或1(是否硬推廣告/催買),"note":"一句話"}。';
async function judge(chainNo, turnIdx, q, prevA, a) {
  const raw = await retry([
    { role: 'system', content: JUDGE_SYS },
    { role: 'user', content: `鏈${chainNo}第${turnIdx}輪\n用戶問：${q}\n上一輪回答：${prevA ? prevA.slice(0, 120) : '（首輪）'}\n本輪回答：${a.slice(0, 220)}\n\n判斷：①狀態是否正確推進 ②是否重複上輪認知 ③是否跳層 ④是否不必要轉人工 ⑤是否硬推。` }
  ], 800, 0.2);
  const m = raw.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : { ok: -1, repeat: -1, jump: -1, human: -1, ad: -1, note: 'parse fail' };
}

(async () => {
  const args = process.argv.slice(2);
  let chains = DATA.chains;
  const nosArg = args.find(a => a.startsWith('--nos='));
  if (nosArg) { const ns = new Set(nosArg.replace('--nos=', '').split(',')); chains = chains.filter(c => ns.has(c.no)); }
  const sampleArg = args.find(a => a.startsWith('--sample='));
  if (sampleArg) chains = chains.slice(0, parseInt(sampleArg.replace('--sample=', ''), 10));
  const outPath = args.find(a => a.startsWith('--out=')) ? args.find(a => a.startsWith('--out=')).replace('--out=', '') : BASE + '/v48_state_results.jsonl';

  const results = [];
  console.log('== V3.1 認知狀態機壓力測試 ==', chains.length, '鏈');
  let total = 0, pass = 0, rep = 0, jump = 0, human = 0, ad = 0;
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
      if (v && v.jump === 1) jump++;
      if (v && v.human === 1) human++;
      if (v && v.ad === 1) ad++;
    }
    results.push({ no: chain.no, type: chain.type, turns });
    const flags = turns.filter(t => t.v && (t.v.repeat === 1 || t.v.jump === 1 || t.v.human === 1 || t.v.ad === 1)).map(t => `${t.i}:${t.v.repeat === 1 ? '重' : ''}${t.v.jump === 1 ? '跳' : ''}${t.v.human === 1 ? '人工' : ''}${t.v.ad === 1 ? '廣' : ''}`).join(',');
    const okCount = turns.filter(t => t.v && t.v.ok === 1).length;
    console.log(`[${chain.no}] ${chain.type} ${okCount}/${turns.length} ${flags ? '⚠️ ' + flags : '✅'}`);
  }
  fs.writeFileSync(outPath, results.map(r => JSON.stringify(r)).join('\n'));
  console.log(`\n=== 完成 === 狀態對 ${pass}/${total} (${(pass / total * 100).toFixed(1)}%) | 重複 ${rep} | 跳層 ${jump} | 轉人工 ${human} | 廣告 ${ad}`);
})();
