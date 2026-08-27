#!/usr/bin/env node
// V3.1 質疑鏈升層專測：連續質疑時是否逐層升（信任標準→驗證方法→事務），不重複
const fs = require('fs');
const https = require('https');
const KEY = process.env.DEEPSEEK_KEY || 'sk-teamo-dffbb80d91b54f308cce7b0ecb17b7a6b51f41b14d701db8';
const PROMPT = fs.readFileSync(__dirname + '/网站/v31_prompt.txt', 'utf8');
const DATA = JSON.parse(fs.readFileSync(__dirname + '/网站/v40_question_chain.json', 'utf8'));

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

(async () => {
  const results = [];
  console.log('== 質疑鏈升層專測 ==', DATA.chains.length, '鏈');
  for (const chain of DATA.chains) {
    const msgs = [{ role: 'system', content: PROMPT }];
    const turns = [];
    for (let i = 0; i < chain.turns.length; i++) {
      msgs.push({ role: 'user', content: chain.turns[i] });
      const raw = await retry(msgs, 1600, 0.7);
      const a = raw.replace(/\n?\[COG\|[^\]]*\]/, '').trim();
      msgs.push({ role: 'assistant', content: a });
      turns.push({ i: i + 1, q: chain.turns[i], a });
    }
    results.push({ no: chain.no, turns });
    // 快速標記：末輪是否到驗證方法/事務（不含「不保證回報/邏輯講得清」這類信任標準復述）
    const last = turns[turns.length - 1].a;
    const hasVerify = /驗證|验证|觀摩|观摩|運行記錄|运行记录|自己看|試用|试用|模擬|模拟/.test(last);
    const hasTrustStd = /不保證|不保证|邏輯|逻辑|穩賺|稳赚/.test(last);
    console.log(`[${chain.no}] 末輪→${hasVerify ? '驗證✅' : '未到驗證'} ${hasTrustStd ? '(含信任標準)' : ''}`);
  }
  fs.writeFileSync(__dirname + '/v40_question_results.jsonl', results.map(r => JSON.stringify(r)).join('\n'));
  console.log('完成');
})();
