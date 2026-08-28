#!/usr/bin/env node
// V3.0 認知路徑·真實場景測試（跳層/繞回/卡住/停止教育/情緒介入）
// 驗證認知路徑引擎在非理想路徑下的表現
// 產出：v35_real_scenarios.json
const fs = require('fs');
const https = require('https');

const KEY = process.env.DEEPSEEK_KEY || 'sk-teamo-dffbb80d91b54f308cce7b0ecb17b7a6b51f41b14d701db8';
const PROMPT = fs.readFileSync(__dirname + '/网站/v31_prompt.txt', 'utf8');

const SCENARIOS = [
  // 跳層：直接問 L6 問題（用戶跳過前面認知）
  {
    name: '跳層-直接問機制',
    turns: [
      { u: '你们和普通量化到底有什么不同？', expect: '機制層（L6）但不倒產品架構', forbid: ['分層糾錯+動態倉位+休眠一次倒完'] },
      { u: '那跟手動止損比呢？', expect: '對比層，一次一層' },
    ]
  },
  // 繞回：換說法重提舊話題（繞圈升層信號）
  {
    name: '繞回-換說法重提',
    turns: [
      { u: '你们是不是就是换一种说法的止损？', expect: '承認+升層（L4→L5）', forbid: ['重新回答原答案', '順著降回舊層'] },
      { u: '说来说去，不就是让我少亏吗？', expect: '升層到生存/系統層', forbid: ['重複少虧定義'] },
    ]
  },
  // 卡住：用戶沒聽懂（自動下沉）
  {
    name: '卡住-自動下沉',
    turns: [
      { u: '为什么等待也是交易？', expect: 'L1/L2 認知' },
      { u: '我还是不明白。', expect: '換入口（行為/場景），禁止重複原句', forbid: ['重複第一遍原話'] },
    ]
  },
  // 停止教育
  {
    name: '停止教育',
    turns: [
      { u: '为什么止损很重要？', expect: 'L4 認錯認知' },
      { u: '明白了，就是错了要认。', expect: '確認+停，不再講解', forbid: ['繼續講止損細節'] },
    ]
  },
  // 情緒介入：連虧+翻本衝動（情緒優先於認知）
  {
    name: '情緒介入-翻本衝動',
    turns: [
      { u: '我已经连续亏了六次，我现在就想一把把它拿回来！', expect: '先帶離翻本衝動（情緒），不講機制', forbid: ['直接講產品/機制'] },
      { u: '可是我真的不甘心。', expect: '繼續接情緒（不甘心=有血性但翻本是行動），定心丸收尾' },
    ]
  },
  // 切銷售：認知完成後問怎麼開始
  {
    name: '切銷售-行動請求',
    turns: [
      { u: '那你们到底怎么帮我？', expect: '機制層（L6）' },
      { u: '我想试试，怎么开始？', expect: '切銷售引擎，直接給步驟', forbid: ['繼續講認知/哲學'] },
    ]
  },
];

function call(messages, max_tokens = 2000, temperature = 0.7) {
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
  const out = [];
  for (const sc of SCENARIOS) {
    const hist = [];
    const turns = [];
    for (let i = 0; i < sc.turns.length; i++) {
      const t = sc.turns[i];
      const msgs = [{ role: 'system', content: PROMPT }].concat(hist.slice(-4)).concat([{ role: 'user', content: t.u }]);
      const raw = await retry(msgs, 2000, 0.7);
      const display = raw.replace(/\n?\[COG\|[^\]]*\]/, '').trim();
      turns.push({ user: t.u, expect: t.expect, forbid: t.forbid, answer: display });
      hist.push({ role: 'user', content: t.u }, { role: 'assistant', content: display });
      console.log(`[${sc.name}] 輪${i + 1}: ${t.u.slice(0, 24)}`);
    }
    out.push({ name: sc.name, turns });
  }
  fs.writeFileSync(__dirname + '/v35_real_scenarios.json', JSON.stringify(out, null, 1));
  console.log('\n=== 真實場景測試完成:', SCENARIOS.length, '場景 ===');
})();
