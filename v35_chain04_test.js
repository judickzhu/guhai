#!/usr/bin/env node
// V3.0 認知鏈04 內容層級驗證（不依賴 COG 標記）
// 驗證：①每輪回答是否推進到期望認知層（關鍵詞匹配）②不重複上一層 ③U10 是否切銷售
const fs = require('fs');
const https = require('https');

const KEY = process.env.DEEPSEEK_KEY || 'sk-93c3b3ecc44f4c79973dbf7ffad4d2e9';
const PROMPT = fs.readFileSync(__dirname + '/网站/v31_prompt.txt', 'utf8');

const CHAIN = [
  { u: '我亏了20%没卖，在等它回来。', keywords: ['捨不得', '舍不得', '等', '認錯', '认错', '回來', '回来'], forbid: [], engine: 'cognitive' },
  { u: '扛着真的会更糟吗？', keywords: ['沉沒', '沉没', '翻本', '賭', '赌', '市場不保證', '市场不保证', '越大'], forbid: ['捨不得', '舍不得'], engine: 'cognitive' },
  { u: '止损不就是承认自己错了吗？', keywords: ['判斷錯', '判断错', '常態', '常态', '小錯', '小错', '失敗者', '失败者'], forbid: ['賭', '赌'], engine: 'cognitive' },
  { u: '认错不就是认输吗？', keywords: ['認輸', '认输', '停止犯錯', '停止犯错', '留給', '留给', '下一筆', '下一笔'], forbid: ['判斷錯', '判断错'], engine: 'cognitive' },
  { u: '扛单和止损不是都亏了吗？', keywords: ['後手', '后手', '本錢', '本钱', '小虧', '小亏', '大虧', '大亏', '心態', '心态'], forbid: ['認輸', '认输'], engine: 'cognitive' },
  { u: '系统怎么帮我认错？', keywords: ['捨不得', '舍不得', '規則', '规则', '替你', '感情用事'], forbid: ['本錢', '本钱'], engine: 'cognitive' },
  { u: '怎么证明它会认错？', keywords: ['虧損單', '亏损单', '到線', '到线', '訂單', '订单', '動作', '动作'], forbid: ['勝率', '胜率'], engine: 'cognitive' },
  { u: '我就是舍不得。', keywords: ['人性', '不甘心', '丟面子', '丢面子', '正常', '規則', '规则'], forbid: ['訂單', '订单'], engine: 'cognitive' },
  { u: '它怎么执行？', keywords: ['規則', '规则', '捨不得', '舍不得', '丟面子', '丢面子', '執行'], forbid: ['人性'], engine: 'cognitive' },
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
  fs.writeFileSync(__dirname + '/v35_chain04_content.json', JSON.stringify(out, null, 1));
  const pass = out.filter(o => o.keywords_hit && !o.forbid_hit && o.engine_ok).length;
  console.log(`\n=== 認知鏈04 內容層級驗證 ===\n通過: ${pass}/10`);
})();
