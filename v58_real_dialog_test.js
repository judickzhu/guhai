#!/usr/bin/env node
// V4.0 真实对话压力测试：假问题识别×真实需求挖掘
// 验证关键决策点：回溯式理解/不早卖产品/创伤接住/适时进事务
const fs = require('fs');
const https = require('https');
const KEY = process.env.DEEPSEEK_KEY || 'sk-teamo-dffbb80d91b54f308cce7b0ecb17b7a6b51f41b14d701db8';
const BASE = __dirname.endsWith('网站') ? __dirname : __dirname + '/网站';
const PROMPT = fs.readFileSync(BASE + '/v31_prompt.txt', 'utf8');
const DATA = JSON.parse(fs.readFileSync(BASE + '/v58_real_dialog.json', 'utf8'));

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

const JUDGE_SYS = '你是「V4.0 真實對話決策點評審」。檢查 DC姐姐 在這一輪的關鍵決策。輸出 JSON：{"ok":0或1,"early_sell":0或1(是否過早銷售/推試用/證明自己),"retro":0或1(是否回溯式理解:回頭解釋前面對話),"trauma":0或1(創傷暴露時是否接住而非推產品),"self_praise":0或1(是否自賣自誇), "note":"一句話"}。';
async function judge(chainNo, round, q, hist, a, expect) {
  const raw = await retry([
    { role: 'system', content: JUDGE_SYS },
    { role: 'user', content: `鏈${chainNo}第${round}輪\n用戶說：${q}\n對話歷史（前幾輪摘要）：${hist.slice(0, 400)}\nDC姐姐回答：${a.slice(0, 240)}\n預期：${expect}\n\n判斷：①是否過早銷售 ②創傷/真需求出現時是否接住 ③是否回溯式理解 ④是否自賣自誇。` }
  ], 800, 0.2);
  const m = raw.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : { ok: -1, note: 'parse fail' };
}

(async () => {
  const results = [];
  console.log('== V4.0 真實對話壓力測試 ==', DATA.chains.length, '鏈');
  let totalCp = 0, passCp = 0;
  for (const chain of DATA.chains) {
    const msgs = [{ role: 'system', content: PROMPT }];
    const turns = [];
    console.log(`\n--- ${chain.no} ${chain.type} ---`);
    for (let i = 0; i < chain.turns.length; i++) {
      msgs.push({ role: 'user', content: chain.turns[i] });
      const raw = await retry(msgs, 1600, 0.7);
      const a = raw.replace(/\n?\[COG\|[^\]]*\]/, '').trim();
      msgs.push({ role: 'assistant', content: a });
      turns.push({ i: i + 1, q: chain.turns[i], a });
      // 檢查是否為關鍵決策點
      const cp = (chain.checkpoints || []).find(c => c.round === i + 1);
      if (cp) {
        const hist = msgs.slice(-6).map(m => (m.role === 'user' ? 'U:' : 'A:') + String(m.content).slice(0, 60)).join(' ');
        let v = null;
        try { v = await judge(chain.no, i + 1, chain.turns[i], hist, a, cp.expect); } catch (e) { v = { note: 'judge fail' }; }
        turns[turns.length - 1].cp = v;
        totalCp++; if (v && v.ok === 1) passCp++;
        const flags = [v && v.early_sell === 1 ? '早賣' : '', v && v.self_praise === 1 ? '自誇' : '', v && v.retro === 1 ? '回溯✅' : '', v && v.trauma === 1 ? '接創傷✅' : ''].filter(Boolean).join(',');
        console.log(`  ⚑ R${cp.round} ${v && v.ok === 1 ? '✅' : '❌'} ${flags || v.note.slice(0, 30)}`);
      }
    }
    results.push({ no: chain.no, type: chain.type, turns });
  }
  fs.writeFileSync(BASE + '/v58_real_dialog_results.jsonl', results.map(r => JSON.stringify(r)).join('\n'));
  console.log(`\n=== 完成 === 關鍵決策點 ${passCp}/${totalCp} (${(passCp / totalCp * 100).toFixed(1)}%)`);
})();
