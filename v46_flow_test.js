#!/usr/bin/env node
// V3.1 事務鏈 + 混合跳轉壓力：連續事務全程不跳回哲學 + 話題跳轉不混亂 + 情緒切入處理
const fs = require('fs');
const https = require('https');
const KEY = process.env.DEEPSEEK_KEY || 'sk-teamo-dffbb80d91b54f308cce7b0ecb17b7a6b51f41b14d701db8';
const BASE = __dirname.endsWith('网站') ? __dirname : __dirname + '/网站';
const PROMPT = fs.readFileSync(BASE + '/v31_prompt.txt', 'utf8');
const DATA = JSON.parse(fs.readFileSync(BASE + '/v46_flow_test.json', 'utf8'));

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

(async () => {
  const results = [];
  console.log('== V3.1 事務鏈 + 混合跳轉壓力 ==', DATA.chains.length, '鏈');
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
    results.push({ no: chain.no, type: chain.type, turns });
    // 本地標記：事務輪是否給步驟、情緒輪是否接情緒、是否跳回哲學
    const flags = [];
    turns.forEach(t => {
      const isTx = /下载|安装|绑定|API|收费|付款|激活|免费|升级|续费|联系|客服/.test(t.q);
      const isEmo = /亏|怕|睡不着|烦|笨|放弃|难过|哭/.test(t.q);
      const a = t.a;
      if (isTx) {
        const hasStep = /第一步|步骤|直接|下载|安装|绑定|注册|去.*网站|官网/.test(a);
        const backPhilosophy = /其实你|真正该思考|你知道吗|从本质|哲学/.test(a) && !hasStep;
        if (!hasStep) flags.push(`${t.i}:事務未給步驟`);
        if (backPhilosophy) flags.push(`${t.i}:事務跳回哲學`);
      }
      if (isEmo) {
        const emoFirst = /姐姐懂|我懂|很正常|不是你的错|先别|缓|抱|心疼/.test(a.slice(0, 60));
        if (!emoFirst) flags.push(`${t.i}:情緒未先接`);
      }
    });
    console.log(`[${chain.no}] ${chain.type} ${turns.length}輪 ${flags.length ? '⚠️ ' + flags.join(',') : '✅'}`);
  }
  fs.writeFileSync(BASE + '/v46_flow_results.jsonl', results.map(r => JSON.stringify(r)).join('\n'));
  console.log('完成');
})();
