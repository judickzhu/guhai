#!/usr/bin/env node
// V3.0 認知鏈03 內容層級驗證（不依賴 COG 標記）
// 驗證：①每輪回答是否推進到期望認知層（關鍵詞匹配）②不重複上一層 ③U10 是否切銷售
const fs = require('fs');
const https = require('https');

const KEY = process.env.DEEPSEEK_KEY || 'sk-93c3b3ecc44f4c79973dbf7ffad4d2e9';
const PROMPT = fs.readFileSync(__dirname + '/网站/v31_prompt.txt', 'utf8');

const CHAIN = [
  { u: '你们为什么一直不动？', keywords: ['省錢', '省钱', '勤快', '該動', '该动', '價值', '价值'], forbid: [], engine: 'cognitive' },
  { u: '那一直不交易怎么赚钱？', keywords: ['現金', '现金', '持倉', '持仓', '等待', '不行動', '不行动'], forbid: ['省錢', '省钱'], engine: 'cognitive' },
  { u: '错过机会怎么办？', keywords: ['錯過', '错过', '追', '虧損', '亏损', '活'], forbid: ['現金', '现金'], engine: 'cognitive' },
  { u: '等待不就是没做事吗？', keywords: ['主動', '主动', '對抗', '对抗', '手癢', '手痒', '選擇', '选择'], forbid: ['錯過', '错过'], engine: 'cognitive' },
  { u: '多做不是多赚吗？', keywords: ['成本', '手續費', '手续费', '磨損', '磨损', '送錢', '送钱', '多錯', '多错'], forbid: ['對抗'], engine: 'cognitive' },
  { u: '你们怎么判断该不该动？', keywords: ['休眠', '判斷', '判断', '不值得', '開倉', '开仓', '省'], forbid: ['手續費', '手续费'], engine: 'cognitive' },
  { u: '怎么证明判断得对？', keywords: ['不交易', '不動', '不动', '安靜', '安静', '規則', '规则'], forbid: ['勝率', '胜率'], engine: 'cognitive' },
  { u: '我就是手痒。', keywords: ['人性', '怕錯過', '怕错过', '焦慮', '焦虑', '正常', '不是你的錯', '不是你的错'], forbid: ['判斷', '判断'], engine: 'cognitive' },
  { u: '它怎么执行？', keywords: ['規則', '规则', '不疲勞', '不疲劳', '手癢', '手痒', '判斷'], forbid: ['人性'], engine: 'cognitive' },
  { u: '怎么开始？', keywords: ['第一步', '註冊', '注册', '試用', '试用', 'OKX', '下載', '下载'], forbid: [], engine: 'sales' },
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
  fs.writeFileSync(__dirname + '/v35_chain03_content.json', JSON.stringify(out, null, 1));
  const pass = out.filter(o => o.keywords_hit && !o.forbid_hit && o.engine_ok).length;
  console.log(`\n=== 認知鏈03 內容層級驗證 ===\n通過: ${pass}/10`);
})();
