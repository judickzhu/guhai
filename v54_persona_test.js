#!/usr/bin/env node
// V4.0 人格壓力測試：五組（人格一致性/謊言/認知抵觸/情緒反覆/成交前對話）
// 每輪驗證：①記住用戶前面講嘅（連續性）②自然點出矛盾（唔審問）③溫柔不同意（有骨頭）④識別情緒反覆 ⑤唔硬推
const fs = require('fs');
const https = require('https');
const KEY = process.env.DEEPSEEK_KEY || 'sk-teamo-dffbb80d91b54f308cce7b0ecb17b7a6b51f41b14d701db8';
const BASE = __dirname.endsWith('网站') ? __dirname : __dirname + '/网站';
const PROMPT = fs.readFileSync(BASE + '/v31_prompt.txt', 'utf8');
const DATA = JSON.parse(fs.readFileSync(BASE + '/v54_persona_test.json', 'utf8'));

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

const JUDGE_SYS = '你是「V4.0 人格壓力評審」。檢查 DC姐姐 這輪是否維持連續人格。輸出 JSON：{"ok":0或1,"cont":0或1(是否記住用戶前面講的/連續性),"natural":0或1(自然點出矛盾,唔審問),"bone":0或1(認知抵觸時溫柔不同意有骨頭),"emo":0或1(識別情緒反覆), "push":0或1(是否硬推),"note":"一句話"}。';
async function judge(chainNo, turnIdx, q, historySnippet, a) {
  const raw = await retry([
    { role: 'system', content: JUDGE_SYS },
    { role: 'user', content: `人格鏈${chainNo}第${turnIdx}輪\n用戶：${q}\n對話歷史（前幾輪用戶+姐姐）：${historySnippet.slice(0, 400)}\n本輪回答：${a.slice(0, 220)}\n\n判斷：①是否記住用戶前面講的 ②矛盾是否自然點出 ③是否溫柔不同意有骨頭 ④是否識別情緒反覆 ⑤是否硬推。` }
  ], 800, 0.2);
  const m = raw.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : { ok: -1, note: 'parse fail' };
}

(async () => {
  const results = [];
  console.log('== V4.0 人格壓力測試 ==', DATA.groups.length, '組');
  let total = 0, pass = 0, cont = 0, natural = 0, bone = 0, emo = 0, push = 0;
  for (const group of DATA.groups) {
    console.log(`\n--- ${group.id} ${group.name} ---`);
    for (const chain of group.chains) {
      const msgs = [{ role: 'system', content: PROMPT }];
      const turns = [];
      let chainOk = 0;
      for (let i = 0; i < chain.turns.length; i++) {
        msgs.push({ role: 'user', content: chain.turns[i] });
        const raw = await retry(msgs, 1600, 0.7);
        const a = raw.replace(/\n?\[COG\|[^\]]*\]/, '').trim();
        msgs.push({ role: 'assistant', content: a });
        // 歷史片段：用戶問題+姐姐回答交錯
        const hist = msgs.slice(-6).map(m => (m.role === 'user' ? 'U:' : 'A:') + String(m.content).slice(0, 80)).join(' ');
        let v = null;
        try { v = await judge(chain.no, i + 1, chain.turns[i], hist, a); } catch (e) { v = { note: 'judge fail' }; }
        turns.push({ i: i + 1, q: chain.turns[i], a, v });
        total++; if (v && v.ok === 1) { pass++; chainOk++; }
        if (v && v.cont === 1) cont++;
        if (v && v.natural === 1) natural++;
        if (v && v.bone === 1) bone++;
        if (v && v.emo === 1) emo++;
        if (v && v.push === 1) push++;
      }
      results.push({ no: chain.no, group: group.id, turns });
      console.log(`[${chain.no}] ${chainOk}/${turns.length} ${chain.expect.slice(0, 24)}`);
    }
  }
  fs.writeFileSync(BASE + '/v54_persona_results.jsonl', results.map(r => JSON.stringify(r)).join('\n'));
  console.log(`\n=== 完成 === 人格保持 ${pass}/${total} (${(pass / total * 100).toFixed(1)}%)`);
  console.log(`連續性 ${cont} | 自然點出矛盾 ${natural} | 有骨頭 ${bone} | 識別情緒 ${emo} | 硬推 ${push}`);
})();
