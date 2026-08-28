#!/usr/bin/env node
// V3.0 認知鏈09 內容層級驗證（不依賴 COG 標記）
// 驗證：①每輪回答是否推進到期望認知層（關鍵詞匹配）②不重複上一層 ③U10 是否切銷售
const fs = require('fs');
const https = require('https');

const KEY = process.env.DEEPSEEK_KEY || 'sk-teamo-dffbb80d91b54f308cce7b0ecb17b7a6b51f41b14d701db8';
const PROMPT = fs.readFileSync(__dirname + '/网站/v31_prompt.txt', 'utf8');

const CHAIN = [
  { u: '凭什么信你？', keywords: ['懷疑', '怀疑', '騙子', '骗子', '解決', '解决'], forbid: [], engine: 'cognitive' },
  { u: '系统到底能做什么？', keywords: ['不預測', '不预测', '不保證', '不保证', '執行', '执行', '工具'], forbid: ['騙子', '骗子'], engine: 'cognitive' },
  { u: '规则跟我自己定差在哪？', keywords: ['不疲勞', '不疲劳', '不要面子', '不情緒化', '不情绪化', '規則', '规则'], forbid: ['執行', '执行'], engine: 'cognitive' },
  { u: '人真的做不到吗？', keywords: ['人性', '貪', '贪', '怕', '翻本', '清醒', '意志力'], forbid: ['不疲勞', '不疲劳'], engine: 'cognitive' },
  { u: '系统补的是哪部分？', keywords: ['執行', '执行', '判斷', '判断', '決策', '决策', '負責'], forbid: ['意志力'], engine: 'cognitive' },
  { u: '系统自己会错吗？', keywords: ['會錯', '会错', '常態', '常态', '能活', '處理', '处理'], forbid: ['執行', '执行'], engine: 'cognitive' },
  { u: '怎么证明错了能活？', keywords: ['錯誤', '错误', '止損', '止损', '收縮', '收缩', '記錄', '记录'], forbid: ['勝率', '胜率'], engine: 'cognitive' },
  { u: '我和它怎么分工？', keywords: ['人負責', '人负责', '系統負責', '系统负责', '判斷', '判断', '執行', '执行', '互補', '互补'], forbid: ['記錄', '记录'], engine: 'cognitive' },
  { u: '怎么信它？', keywords: ['驗證', '验证', '觀察', '观察', '運行', '运行', '承諾', '承诺'], forbid: ['互補', '互补'], engine: 'cognitive' },
  { u: '怎么开始？', keywords: ['第一步', '註冊', '注册', '試用', '试用', 'OKX', '下載', '下载'], forbid: [], engine: 'sales' },
];

function call(messages, max_tokens = 2400, temperature = 0.7) {
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
  fs.writeFileSync(__dirname + '/v35_chain09_content.json', JSON.stringify(out, null, 1));
  const pass = out.filter(o => o.keywords_hit && !o.forbid_hit && o.engine_ok).length;
  console.log(`\n=== 認知鏈09 內容層級驗證 ===\n通過: ${pass}/10`);
})();
