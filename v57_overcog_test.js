#!/usr/bin/env node
// V4.0 反过度认知测试：纯事务/信息题直接答，不出现心理推测句式
const fs = require('fs');
const https = require('https');
const KEY = process.env.DEEPSEEK_KEY || 'sk-teamo-dffbb80d91b54f308cce7b0ecb17b7a6b51f41b14d701db8';
const BASE = __dirname.endsWith('网站') ? __dirname : __dirname + '/网站';
const PROMPT = fs.readFileSync(BASE + '/v31_prompt.txt', 'utf8');
const DATA = JSON.parse(fs.readFileSync(BASE + '/v57_overcog_test.json', 'utf8'));

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

const JUDGE_SYS = '你是「V4.0 反過度認知評審」。檢查 DC姐姐 對純事務/信息題是否直接答（不分析心理）。輸出 JSON：{"ok":0或1,"over":0或1(是否過度解讀:心理推測句式「你其實是想…/你是不是在擔心…/你問這個是因為…」/挖潛台詞),"direct":0或1(是否直接給步驟或直接答),"note":"一句話"}。';
async function judge(item, a) {
  const raw = await retry([
    { role: 'system', content: JUDGE_SYS },
    { role: 'user', content: `問題類型：${item.type}\n用戶問：${item.q}\n預期：${item.expect}\nDC姐姐回答：${a.slice(0, 220)}\n\n判斷：是否直接答無過度解讀。` }
  ], 800, 0.2);
  const m = raw.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : { ok: -1, note: 'parse fail' };
}

(async () => {
  const results = [];
  console.log('== V4.0 反過度認知測試 ==', DATA.items.length, '題');
  let total = 0, pass = 0, over = 0, direct = 0;
  for (const item of DATA.items) {
    const raw = await retry([{ role: 'system', content: PROMPT }, { role: 'user', content: item.q }], 1600, 0.7);
    const a = raw.replace(/\n?\[COG\|[^\]]*\]/, '').trim();
    let v = null;
    try { v = await judge(item, a); } catch (e) { v = { note: 'judge fail' }; }
    results.push({ no: item.no, q: item.q, type: item.type, a, v });
    total++; if (v && v.ok === 1) pass++;
    if (v && v.over === 1) over++;
    if (v && v.direct === 1) direct++;
    console.log(`[${item.no}] ${v && v.ok === 1 ? '✅' : '❌'} ${item.q.slice(0, 18)}${v && v.over === 1 ? ' ⚠️過度解讀' : ''}`);
  }
  fs.writeFileSync(BASE + '/v57_overcog_results.jsonl', results.map(r => JSON.stringify(r)).join('\n'));
  console.log(`\n=== 完成 === 通過 ${pass}/${total} (${(pass / total * 100).toFixed(1)}%) | 過度解讀 ${over} | 直接答 ${direct}`);
})();
