#!/usr/bin/env node
// V3.3 自我評審器：答 → 自評 → 找錯 → 重寫 → 盲比 → 保留更好
// 產出：v37_review.jsonl（每題 A1/A2/評審/分數/選擇）+ 統計
// 用法：node v37_self_review.js [--nos 01,02,...] [--sample N]
const fs = require('fs');
const https = require('https');

const KEY = process.env.DEEPSEEK_KEY || 'sk-93c3b3ecc44f4c79973dbf7ffad4d2e9';
const PROMPT = fs.readFileSync(__dirname + '/网站/v31_prompt.txt', 'utf8');
const DATA = JSON.parse(fs.readFileSync(__dirname + '/网站/v36_trap20.json', 'utf8'));

function call(messages, max_tokens = 2000, temperature = 0.7) {
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

// ① 回答
async function answer(q) {
  return retry([{ role: 'system', content: PROMPT }, { role: 'user', content: q }], 1600, 0.7);
}

// ② 自我評審（7問 + 質量分）
const REVIEW_SYS = '你是「DC姐姐自我評審器」。對回答做嚴格自我評審。輸出 JSON：{"score":0-10,"issues":["紅燈問題列表"],"check1_接住用戶":true/false,"check2_狀態識別":true/false,"check3_認知卡點":true/false,"check4_層級正確":true/false,"check5_情緒處理":true/false,"check6_無過度銷售":true/false,"check7_收尾正確":true/false,"review_note":"一句話評審結論"}';
async function review(q, a) {
  const raw = await retry([{ role: 'system', content: REVIEW_SYS }, { role: 'user', content: `題目：${q}\n回答：${a}` }], 1500, 0.2);
  const m = raw.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : { score: 5, issues: ['parse fail'], review_note: raw.slice(0, 60) };
}

// ③ 自動重寫
const REWRITE_SYS = '你是「DC姐姐改寫器」。基於評審指出的問題，重寫答案（保留 DC姐姐人設：短促/直接/口語化/不卑不亢）。只輸出重寫後的回答，不要任何解釋。';
async function rewrite(q, a, reviewNote) {
  return retry([{ role: 'system', content: REWRITE_SYS }, { role: 'user', content: `題目：${q}\n原回答：${a}\n評審問題：${reviewNote}\n\n請重寫。` }], 1600, 0.5);
}

// ④ 盲比（不知道哪個是原始）
const COMPARE_SYS = '你是嚴格評審。兩個回答（A/B）打亂順序給出，你各打 0-10 分（按：接住用戶/認知準確/無過度銷售/收尾質量），並說哪個更好。輸出 JSON：{"scoreA":0-10,"scoreB":0-10,"better":"A或B","reason":"一句話"}';
async function compare(q, a1, a2) {
  // 隨機打亂
  const order = Math.random() < 0.5 ? [a1, a2] : [a2, a1];
  const raw = await retry([{ role: 'system', content: COMPARE_SYS }, { role: 'user', content: `題目：${q}\n回答A：${order[0]}\n回答B：${order[1]}` }], 800, 0.2);
  const m = raw.match(/\{[\s\S]*\}/);
  const j = m ? JSON.parse(m[0]) : { scoreA: 5, scoreB: 5, better: 'A', reason: 'parse' };
  // 對應回原始/重寫
  const a1IsA = order[0] === a1;
  return {
    a1_score: a1IsA ? j.scoreA : j.scoreB,
    a2_score: a1IsA ? j.scoreB : j.scoreA,
    better: (a1IsA ? j.better === 'A' : j.better === 'B') ? 'a1' : 'a2',
    reason: j.reason
  };
}

(async () => {
  const args = process.argv.slice(2);
  let items = DATA.items;
  const nosArg = args.find(a => a.startsWith('--nos='));
  if (nosArg) {
    const nos = new Set(nosArg.replace('--nos=', '').split(','));
    items = items.filter(i => nos.has(i.no));
  }
  const sampleArg = args.find(a => a.startsWith('--sample='));
  if (sampleArg) items = items.slice(0, parseInt(sampleArg.replace('--sample=', ''), 10));

  const out = [];
  console.log('== V3.3 自我評審器 ==', items.length, '題');
  let improved = 0, degraded = 0, kept = 0, totalGain = 0;
  for (const item of items) {
    // ① 回答
    const a1 = await answer(item.q);
    // ② 自我評審
    const rv = await review(item.q, a1);
    // ③ 重寫（若分數低或有紅燈）
    let a2 = null;
    const needRewrite = rv.score < 7;
    if (needRewrite) {
      a2 = await rewrite(item.q, a1, rv.review_note || (rv.issues || []).join(';'));
    }
    // ④ 盲比
    let cmp = null;
    if (a2) {
      cmp = await compare(item.q, a1, a2);
      const gain = cmp.a2_score - cmp.a1_score;
      if (cmp.better === 'a2') { improved++; totalGain += gain; }
      else if (cmp.better === 'a1') { degraded++; }
      else kept++;
    } else { kept++; }
    const rec = { no: item.no, q: item.q, trap: item.trap, a1, review: rv, a2, compare: cmp, final: (cmp && cmp.better === 'a2') ? a2 : a1 };
    out.push(rec);
    const final = rec.final === a2 ? '重寫版✅' : '原版';
    console.log(`[${item.no}] 評審分${rv.score} ${needRewrite ? '→重寫' : '→免改'} | 盲比 A1:${cmp ? cmp.a1_score : '-'} A2:${cmp ? cmp.a2_score : '-'} → ${final}`);
  }
  fs.writeFileSync(__dirname + '/v37_review.jsonl', out.map(r => JSON.stringify(r)).join('\n'));
  console.log(`\n=== 完成 ===\n改進(重寫勝): ${improved} | 保持原版: ${degraded + kept} | 總分提升: ${totalGain.toFixed(1)}`);
})();
