#!/usr/bin/env node
// V3.0 認知鏈10 內容層級驗證（不依賴 COG 標記）
// 驗證：①每輪回答是否推進到期望認知層（關鍵詞匹配）②不重複上一層 ③U10 是否切銷售
const fs = require('fs');
const https = require('https');

const KEY = process.env.DEEPSEEK_KEY || 'sk-93c3b3ecc44f4c79973dbf7ffad4d2e9';
const PROMPT = fs.readFileSync(__dirname + '/网站/v31_prompt.txt', 'utf8');

const CHAIN = [
  { u: '29800值不值？', keywords: ['跟什麼比', '跟什么比', '虧掉', '亏掉', '解決', '解决'], forbid: [], engine: 'cognitive' },
  { u: '那跟什么比？', keywords: ['虧損', '亏损', '代價', '代价', '承受', '省錢', '省钱'], forbid: ['解決', '解决'], engine: 'cognitive' },
  { u: '怎么证明有用？', keywords: ['運行記錄', '运行记录', '虧損', '亏损', '觀察', '观察', '承諾', '承诺'], forbid: ['省錢', '省钱'], engine: 'cognitive' },
  { u: '怎么试？', keywords: ['免費試用', '免费试用', '觀察', '观察', '驗證', '验证', '不是保證', '不是保证'], forbid: ['運行記錄', '运行记录'], engine: 'cognitive' },
  { u: '怎么决定买不买？', keywords: ['解決', '解决', '問題', '问题', '管不住', '標準', '标准'], forbid: ['免費試用', '免费试用'], engine: 'cognitive' },
  { u: '新手适合吗？', keywords: ['門檻', '门槛', '勸退', '劝退', '如實', '如实', '不適合', '不适合'], forbid: ['標準', '标准'], engine: 'cognitive' },
  { u: '多少钱？', keywords: ['29800', '價格', '价格', '授權', '授权', '不抬價', '不抬价'], forbid: ['門檻', '门槛'], engine: 'cognitive' },
  { u: '我要买。', keywords: ['決定權', '决定权', '不催', '帶你', '流程', '再想想'], forbid: ['29800'], engine: 'cognitive' },
  { u: '第一步做什么？', keywords: ['註冊', '注册', 'OKX', 'API', '參數', '参数', '三步'], forbid: ['決定權', '决定权'], engine: 'cognitive' },
  { u: '谢谢，我懂了。', keywords: ['自己想通', '你決定', '你决定', '剩下的'], forbid: ['第一步'], engine: 'cognitive' },
];

function call(messages, max_tokens = 2400, temperature = 0.7) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: 'deepseek-v4-flash', messages, max_tokens, temperature, stream: false });
    const req = https.request({
      hostname: 'api.deepseek.com', path: '/v1/chat/completions', method: 'POST',
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
  const history = [];
  for (let i = 0; i < CHAIN.length; i++) {
    const step = CHAIN[i];
    const msgs = [{ role: 'system', content: PROMPT }].concat(history.slice(-4)).concat([{ role: 'user', content: step.u }]);
    const raw = await retry(msgs, 2400, 0.7);
    const display = raw.replace(/\n?\[COG\|[^\]]*\]/, '').trim();
    const kwHit = step.keywords.some(k => display.includes(k));
    const forbidHit = step.forbid.some(k => display.includes(k));
    const salesWords = ['註冊', '注册', '試用', '试用', 'OKX', '下載', '下载', '第一步'];
    const hasSales = salesWords.some(k => display.includes(k));
    const engineOk = step.engine === 'sales' ? hasSales : !hasSales;
    out.push({ turn: i + 1, user: step.u, keywords_hit: kwHit, forbid_hit: forbidHit, engine_ok: engineOk, answer: display });
    const status = kwHit && !forbidHit && engineOk ? '✅' : '❌';
    console.log(`[${i + 1}/10] ${step.u.slice(0, 20)} → 關鍵詞${kwHit ? '✅' : '❌'} 無舊層${forbidHit ? '❌' : '✅'} 引擎${engineOk ? '✅' : '❌'} ${status}`);
    history.push({ role: 'user', content: step.u }, { role: 'assistant', content: display });
  }
  fs.writeFileSync(__dirname + '/v35_chain10_content.json', JSON.stringify(out, null, 1));
  const pass = out.filter(o => o.keywords_hit && !o.forbid_hit && o.engine_ok).length;
  console.log(`\n=== 認知鏈10 內容層級驗證 ===\n通過: ${pass}/10`);
})();
