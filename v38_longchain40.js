#!/usr/bin/env node
// V3.3 長鏈穩定性測試：40 輪多鏈混合對話
// 鏈01(預測→糾錯) 1-20 → 鏈05(連虧→翻本) 21-30 → 收尾(情緒→停止→切銷售) 31-40
// 驗證：①40輪後人設/認知路徑是否保持 ②有無重複觀點 ③話題切換是否自然 ④收尾是否正確
const fs = require('fs');
const https = require('https');

const KEY = process.env.DEEPSEEK_KEY || 'sk-teamo-dffbb80d91b54f308cce7b0ecb17b7a6b51f41b14d701db8';
const PROMPT = fs.readFileSync(__dirname + '/网站/v31_prompt.txt', 'utf8');

const CHAIN = [
  // 鏈01：預測→錯誤→糾錯
  '你们到底预测涨还是跌？', '那你们靠什么开仓？', '可谁都会错啊？', '不就是止损吗？',
  '那止损完就完了？', '你们到底有什么不同？', '系统错了谁负责？', '那我是不是躺着赚？',
  '它怎么帮我管住手？', '你们和手动操作最大的区别在哪？',
  // 鏈01 深入：機制→驗證→人性
  '具体怎么处理连续的错误？', '系统会一直止损吗？', '那止损失败了怎么办？', '你怎么保证纠错有效？',
  '人真的管不住自己吗？', '我一直很自律啊', '那自律的人也需要系统吗？', '系统会不会太机械？',
  '如果系统也错了呢？', '怎么验证它靠谱？',
  // 鏈05：連虧→翻本→失控
  '我已经连续亏了十几次了。', '我就想把亏的拿回来。', '为什么越急越亏？', '怎么知道自己要失控了？',
  '我现在停是不是就彻底输了？', '怎么让我停得住？', '我做不到，忍不住。', '停了之后呢？',
  '会不会停了就错过反弹？', '我是不是不适合交易？',
  // 收尾：情緒→停止教育→切銷售
  '看到账户我就害怕。', '你说得对，可我就是做不到。', '我懂了，核心就是控制错误。',
  '那我到底该不该用？', '明白了，我再想想。', '你们有免费试用吗？', '怎么开始？',
  '第一步做什么？', '谢谢姐姐。', '你还在吗？'
];

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
  const msgs = [{ role: 'system', content: PROMPT }];
  const turns = [];
  console.log('== 40 輪長鏈穩定性測試 ==');
  for (let i = 0; i < CHAIN.length; i++) {
    msgs.push({ role: 'user', content: CHAIN[i] });
    const raw = await retry(msgs, 1600, 0.7);
    const a = raw.replace(/\n?\[COG\|[^\]]*\]/, '').trim();
    turns.push({ n: i + 1, q: CHAIN[i], a });
    msgs.push({ role: 'assistant', content: a });
    const len = a.length;
    const truncated = a.length > 1500;
    console.log(`[${String(i + 1).padStart(2, '0')}] ${CHAIN[i].slice(0, 18)} → ${len}字${truncated ? '⚠️截斷' : ''}`);
  }
  // 保存
  fs.writeFileSync(__dirname + '/v38_longchain40.json', JSON.stringify({ turns }, null, 1));
  // 統計
  const lens = turns.map(t => t.a.length);
  const avg = lens.reduce((s, l) => s + l, 0) / lens.length;
  const min = Math.min(...lens), max = Math.max(...lens);
  const empty = lens.filter(l => l < 20).length;
  console.log(`\n=== 統計 ===\n平均長度 ${avg.toFixed(0)} | 最短 ${min} | 最長 ${max} | 過短(<20字) ${empty}`);
  // 後 10 輪（收尾段）質量抽查標記
  console.log('--- 收尾段（31-40）---');
  for (const t of turns.slice(30)) {
    const a = t.a;
    const hasSales = /註冊|注册|OKX|試用|试用/.test(a);
    const isShort = a.length < 40;
    console.log(`[${t.n}] ${t.q.slice(0, 14)} → ${hasSales ? '含銷售詞' : ''}${isShort ? '短回答' : ''} | ${a.slice(0, 60).replace(/\n/g, ' ')}`);
  }
})();
