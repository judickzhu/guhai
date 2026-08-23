#!/usr/bin/env node
// V3.0 認知鏈08 內容層級驗證（不依賴 COG 標記）
// 驗證：①每輪回答是否推進到期望認知層（關鍵詞匹配）②不重複上一層 ③U10 是否切銷售
const fs = require('fs');
const https = require('https');

const KEY = process.env.DEEPSEEK_KEY || 'sk-93c3b3ecc44f4c79973dbf7ffad4d2e9';
const PROMPT = fs.readFileSync(__dirname + '/网站/v31_prompt.txt', 'utf8');

const CHAIN = [
  { u: '风控不就是止损吗？', keywords: ['單筆', '单笔', '帳戶', '账户', '生存', '兩回事', '两回事'], forbid: [], engine: 'cognitive' },
  { u: '风控还包括什么？', keywords: ['三層', '三层', '單筆', '单笔', '帳戶', '账户', '生存', '覆蓋'], forbid: ['兩回事'], engine: 'cognitive' },
  { u: '什么时候该收缩？', keywords: ['連虧', '连亏', '環境', '环境', '狀態', '状态', '信號', '信号'], forbid: ['三層', '三层'], engine: 'cognitive' },
  { u: '具体怎么收缩？', keywords: ['倉位', '仓位', '頻率', '频率', '暫停', '暂停', '攻擊性', '攻击性'], forbid: ['連虧', '连亏'], engine: 'cognitive' },
  { u: '收缩不就是认输吗？', keywords: ['職業', '职业', '認輸', '认输', '留給', '留给', '下一次'], forbid: ['倉位', '仓位'], engine: 'cognitive' },
  { u: '系统怎么自动收缩？', keywords: ['分水嶺', '分水岭', '多級', '多级', '一檔', '一档', '規則', '规则'], forbid: ['認輸', '认输'], engine: 'cognitive' },
  { u: '怎么证明？', keywords: ['訂單', '订单', '連虧', '连亏', '記錄', '记录', '暫停'], forbid: ['勝率', '胜率'], engine: 'cognitive' },
  { u: '我就是不服输。', keywords: ['人性', '不服輸', '不服输', '越虧越急', '越亏越急', '規則', '规则'], forbid: ['訂單', '订单'], engine: 'cognitive' },
  { u: '它怎么执行？', keywords: ['規則', '规则', '不服輸', '不服输', '該收就收', '该收就收', '執行'], forbid: ['人性'], engine: 'cognitive' },
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
  fs.writeFileSync(__dirname + '/v35_chain08_content.json', JSON.stringify(out, null, 1));
  const pass = out.filter(o => o.keywords_hit && !o.forbid_hit && o.engine_ok).length;
  console.log(`\n=== 認知鏈08 內容層級驗證 ===\n通過: ${pass}/10`);
})();
