#!/usr/bin/env node
// V3.0 認知鏈06 內容層級驗證（不依賴 COG 標記）
// 驗證：①每輪回答是否推進到期望認知層（關鍵詞匹配）②不重複上一層 ③U10 是否切銷售
const fs = require('fs');
const https = require('https');

const KEY = process.env.DEEPSEEK_KEY || 'sk-93c3b3ecc44f4c79973dbf7ffad4d2e9';
const PROMPT = fs.readFileSync(__dirname + '/网站/v31_prompt.txt', 'utf8');

const CHAIN = [
  { u: '我这个月赚了不少！', keywords: ['恭喜', '運氣', '运气', '判斷', '判断', '規則', '规则'], forbid: [], engine: 'cognitive' },
  { u: '就是我判断得准。', keywords: ['行情配合', '自信', '憑感覺', '凭感觉', '紀律', '纪律', '運氣', '运气'], forbid: ['恭喜'], engine: 'cognitive' },
  { u: '赚了加仓有什么不对？', keywords: ['加倉', '加仓', '止損', '止损', '放寬', '放宽', '回吐', '警報', '警报'], forbid: ['紀律', '纪律'], engine: 'cognitive' },
  { u: '我真的全吐回去了。', keywords: ['動作', '动作', '風控', '风控', '學費', '学费', '自信'], forbid: ['加倉', '加仓'], engine: 'cognitive' },
  { u: '怎么防止再吐？', keywords: ['風險', '风险', '呼吸', '規則', '规则', '順風', '顺风', '結算', '结算'], forbid: ['動作', '动作'], engine: 'cognitive' },
  { u: '系统怎么做到不松懈？', keywords: ['按兵不動', '按兵不动', '鬆懈', '松懈', '激進', '激进', '規則', '规则'], forbid: ['呼吸'], engine: 'cognitive' },
  { u: '怎么证明？', keywords: ['盈利', '紀律', '纪律', '克制', '風控', '风控', '規則', '规则'], forbid: ['勝率', '胜率'], engine: 'cognitive' },
  { u: '赚了就是忍不住想加。', keywords: ['人性', '貪', '贪', '自大', '最危險', '最危险', '正常'], forbid: ['按兵不動', '按兵不动'], engine: 'cognitive' },
  { u: '它怎么执行？', keywords: ['規則', '规则', '飄', '飘', '放你一馬', '放你一马', '執行', '执行'], forbid: ['人性'], engine: 'cognitive' },
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
  fs.writeFileSync(__dirname + '/v35_chain06_content.json', JSON.stringify(out, null, 1));
  const pass = out.filter(o => o.keywords_hit && !o.forbid_hit && o.engine_ok).length;
  console.log(`\n=== 認知鏈06 內容層級驗證 ===\n通過: ${pass}/10`);
})();
