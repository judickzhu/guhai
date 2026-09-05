#!/usr/bin/env node
// V4.0 第一階段實戰 10 鏈：情緒突變×立場反轉×話題跳躍
const fs = require('fs');
const https = require('https');
const KEY = process.env.DEEPSEEK_KEY || 'sk-teamo-dffbb80d91b54f308cce7b0ecb17b7a6b51f41b14d701db8';
const BASE = __dirname.endsWith('网站') ? __dirname : __dirname + '/网站';
const PROMPT = fs.readFileSync(BASE + '/v31_prompt.txt', 'utf8');
const DATA = JSON.parse(fs.readFileSync(BASE + '/v63_live10_test.json', 'utf8'));

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

const JUDGE_SYS = '你是「V4.0 實戰鏈評審」。檢查 DC姐姐 是否跟住用戶變化+記住前文。輸出 JSON：{"ok":0或1,"repeat":0或1(重複教育/復讀),"sell":0或1(銷售衝動/用戶未問就推),"miss":0或1(冇識別情緒/立場/話題變化),"track":0或1(記住前文/結合前文),"note":"一句話"}。';
async function judge(chainNo, round, q, hist, a, expect) {
  const raw = await retry([
    { role: 'system', content: JUDGE_SYS },
    { role: 'user', content: `實戰鏈${chainNo}第${round}輪\n用戶：${q}\n對話歷史：${hist.slice(0, 400)}\nDC姐姐：${a.slice(0, 240)}\n預期：${expect}\n\n判斷：①是否重複教育 ②是否銷售衝動 ③有冇識別變化 ④有冇記住前文。` }
  ], 800, 0.2);
  const m = raw.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : { ok: -1, note: 'parse fail' };
}

(async () => {
  const results = [];
  console.log('== V4.0 第一階段實戰 ==', DATA.chains.length, '鏈');
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
      const expect = chain.expects[String(i + 1)];
      if (expect) {
        const hist = msgs.slice(-8).map(m => (m.role === 'user' ? 'U:' : 'A:') + String(m.content).slice(0, 60)).join(' ');
        let v = null;
        try { v = await judge(chain.no, i + 1, chain.turns[i], hist, a, expect); } catch (e) { v = { note: 'judge fail' }; }
        turns[turns.length - 1].cp = v;
        total++; if (v && v.ok === 1) pass++;
      }
    }
    results.push({ no: chain.no, turns });
    const flags = turns.filter(t => t.cp && (t.cp.repeat === 1 || t.cp.sell === 1 || t.cp.miss === 1)).map(t => `${t.i}:${t.cp.repeat === 1 ? '重' : ''}${t.cp.sell === 1 ? '銷' : ''}${t.cp.miss === 1 ? '漏' : ''}`).join(',');
    const okCount = turns.filter(t => t.cp && t.cp.ok === 1).length;
    console.log(`[${chain.no}] ${okCount}/${Object.keys(chain.expects).length} ${flags ? '⚠️ ' + flags : '✅'}`);
  }
  fs.writeFileSync(BASE + '/v63_live10_results.jsonl', results.map(r => JSON.stringify(r)).join('\n'));
  console.log(`\n=== 完成 === 通過 ${pass}/${total} (${(pass / total * 100).toFixed(1)}%)`);
})();
