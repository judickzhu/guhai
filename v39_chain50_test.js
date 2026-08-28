#!/usr/bin/env node
// V3.1 連續對話壓力測試 50 鏈
// 每鏈 5-10 輪連續追問，驗證 DC姐姐 能否在長對話中始終知道「現在該做什麼」
// 驗證維度：①認知升層（不重複上一層）②停止機制（用戶懂了就停）③事務切換（該切事務就切）④銷售防禦（不硬推）⑤情緒處理
// 用法：node v39_chain50_test.js [--nos C01,C02...] [--sample N] [--out xxx.jsonl]
const fs = require('fs');
const https = require('https');

const KEY = process.env.DEEPSEEK_KEY || 'sk-teamo-dffbb80d91b54f308cce7b0ecb17b7a6b51f41b14d701db8';
const PROMPT = fs.readFileSync(__dirname + '/网站/v31_prompt.txt', 'utf8');
const DATA = JSON.parse(fs.readFileSync(__dirname + '/网站/v39_chain50.json', 'utf8'));

function call(messages, max_tokens = 1600, temperature = 0.7) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: 'deepseek-v4-flash-free', messages, max_tokens, temperature, stream: false });
    const req = https.request({
      hostname: 'api.teamorouter.cn', path: '/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode + ' ' + d.slice(0, 100)));
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

// 驗證每輪：回答是否合適（無重複/該停/該切事務）
async function verifyTurn(chainNo, turnIdx, q, prevA, a) {
  const raw = await retry([
    { role: 'system', content: '你是「V3.1 對話狀態機評審」。檢查 DC姐姐 這一輪的回答是否符合狀態機要求。輸出 JSON：{"layer":"該推進的認知層","repeat":0或1(是否重複上一層/復讀),"stop_ok":0或1(用戶已懂時是否該停),"tx_ok":0或1(該轉事務時是否轉),"sales_push":0或1(是否硬推銷售),"score":0-5,"note":"一句話"}。' },
    { role: 'user', content: `鏈${chainNo}第${turnIdx}輪\n用戶問：${q}\n上一輪回答：${prevA ? prevA.slice(0, 150) : '（首輪）'}\n本輪回答：${a.slice(0, 250)}\n\n檢查本輪是否：①認知升層不重複 ②該停就停 ③該轉事務就轉 ④無銷售硬推。` }
  ], 800, 0.2);
  const m = raw.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : { repeat: -1, stop_ok: 0, tx_ok: 0, sales_push: 0, score: 3, note: 'parse fail' };
}

(async () => {
  const args = process.argv.slice(2);
  let chains = DATA.chains;
  const nosArg = args.find(a => a.startsWith('--nos='));
  if (nosArg) { const ns = new Set(nosArg.replace('--nos=', '').split(',')); chains = chains.filter(c => ns.has(c.no)); }
  const sampleArg = args.find(a => a.startsWith('--sample='));
  if (sampleArg) chains = chains.slice(0, parseInt(sampleArg.replace('--sample=', ''), 10));
  const outPath = args.find(a => a.startsWith('--out=')) ? args.find(a => a.startsWith('--out=')).replace('--out=', '') : __dirname + '/v39_chain50_results.jsonl';

  const results = [];
  console.log('== V3.1 連續對話壓力測試 ==', chains.length, '鏈');
  let totalTurns = 0, totalRepeat = 0, totalSales = 0;
  for (const chain of chains) {
    const msgs = [{ role: 'system', content: PROMPT }];
    const turns = [];
    for (let i = 0; i < chain.turns.length; i++) {
      msgs.push({ role: 'user', content: chain.turns[i] });
      const raw = await retry(msgs, 1600, 0.7);
      const a = raw.replace(/\n?\[COG\|[^\]]*\]/, '').trim();
      msgs.push({ role: 'assistant', content: a });
      const prev = turns[turns.length - 1];
      let verify = null;
      try { verify = await verifyTurn(chain.no, i + 1, chain.turns[i], prev ? prev.a : '', a); }
      catch (e) { verify = { note: 'verify fail' }; }
      turns.push({ i: i + 1, q: chain.turns[i], a, v: verify });
      totalTurns++;
      if (verify && verify.repeat === 1) totalRepeat++;
      if (verify && verify.sales_push === 1) totalSales++;
    }
    results.push({ no: chain.no, type: chain.type, turns });
    const flags = turns.filter(t => t.v && (t.v.repeat === 1 || t.v.sales_push === 1 || t.v.stop_ok === 1)).map(t => `${t.i}:${t.v.repeat === 1 ? '重' : ''}${t.v.sales_push === 1 ? '銷' : ''}${t.v.stop_ok === 1 ? '停' : ''}`).join(',');
    console.log(`[${chain.no}] ${chain.type} ${turns.length}輪 ${flags ? '⚠️ ' + flags : '✅'}`);
  }
  fs.writeFileSync(outPath, results.map(r => JSON.stringify(r)).join('\n'));
  console.log(`\n=== 完成 ===\n總輪次 ${totalTurns} | 重複 ${totalRepeat} | 銷售硬推 ${totalSales}`);
})();
