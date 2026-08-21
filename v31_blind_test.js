// V3.1 100条无标准答案盲测 harness
// Pass A: 答題（AI 只见用户原话 + V3.1 system prompt，无分组/无考点）
// Pass B: 反向驗證器評分（judge 可见分组+隐藏考点，输出 8 项隐式记录 + 10 项分数 + 删DCOGAI测试）
const fs = require('fs');
const https = require('https');

const KEY = process.env.DEEPSEEK_KEY || 'sk-93c3b3ecc44f4c79973dbf7ffad4d2e9';
const MODEL = 'deepseek-v4-flash';
const PROMPT = fs.readFileSync(__dirname + '/v31_prompt.txt', 'utf8');
const DATA = JSON.parse(fs.readFileSync(__dirname + '/v31_blind100.json', 'utf8'));

const args = process.argv.slice(2);
const pilot = args.includes('--pilot');
const pilotN = parseInt(args[args.indexOf('--pilot') + 1], 10) || 10;
const sample = args.includes('--sample');

const JUDGE_SYS = '你是「反向驗證器」，DC姐姐 V3.1 盲測的評分員。你的任務分兩步：\n' +
  '第一步【隱式記錄】從回答中推出 DC姐姐實際走的推理，記錄 8 項：\n' +
  '①它判斷用戶是什麼狀態 ②它認為用戶真正問什麼 ③它抓到哪個認知卡點 ④它選擇哪個逆向方向 ⑤它回答推進了哪一個認知 ⑥有沒有廣告化（主動把話題往產品上拽/反复提品牌）⑦有沒有重複上一層或說空話（車轱轆話、沒針對問題）⑧有沒有在用戶已準備行動或問事務時繼續教育。\n' +
  '第二步【打分】對照隱藏考點打分（0-10 整數）：\n' +
  's1 狀態判斷準確度（對照考點的情緒/動機）\n' +
  's2 真正問題把握（是否直擊考點）\n' +
  's3 認知卡點抓取（拆卡點而非繞過）\n' +
  's4 逆向切入（該反者道之動的地方有沒有反）\n' +
  's5 一答一認知（只推進一層、留自然下一層，沒一口氣倒完）\n' +
  's6 無廣告化（10=完全無廣告感，≤3=像廣告）\n' +
  's7 無重複空洞（10=句句針對問題）\n' +
  's8 時機切換（該切事務/停止教育時是否切了；不適用給 -1）\n' +
  's9 刪DCOGAI價值（把回答中所有「DCOGAI」四字刪掉後是否仍有價值：1=有 0=無）\n' +
  's10 總評（綜合 0-10）\n' +
  '只輸出一個 JSON 對象（不要任何其他文字、不要 markdown 代碼塊）：\n' +
  '{"rec":["①...","②...","③...","④...","⑤...","⑥...","⑦...","⑧..."],"scores":{"s1":0,"s2":0,"s3":0,"s4":0,"s5":0,"s6":0,"s7":0,"s8":0,"s10":0},"del_value":0,"opinion":"一句最該改進的點（繁體）"}';

function call(messages, max_tokens, temperature) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: MODEL, messages, max_tokens, temperature, stream: false });
    const req = https.request({
      host: 'api.deepseek.com', path: '/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode + ': ' + d.slice(0, 160)));
        try {
          const j = JSON.parse(d);
          if (!j.choices || !j.choices[0]) return reject(new Error('no choices: ' + d.slice(0, 160)));
          resolve(j.choices[0].message.content);
        } catch (e) { reject(new Error('parse: ' + d.slice(0, 160))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(90000, () => { req.destroy(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

async function callRetry(messages, max_tokens, temperature, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { return await call(messages, max_tokens, temperature); }
    catch (e) { if (i === tries - 1) throw e; await new Promise(r => setTimeout(r, 1500)); }
  }
}

async function answerItem(it) {
  const raw = await callRetry([
    { role: 'system', content: PROMPT },
    { role: 'user', content: it.q }
  ], 1600, 0.7);
  if (!raw || !raw.trim()) throw new Error('empty answer');
  return raw;
}

async function judgeItem(it, answer) {
  const userMsg = JSON.stringify({ 组别: 'G' + it.g, 题号: it.no, 用户原话: it.q, 隐藏考点: it.point, DC姐姐的回答: answer }, null, 1);
  let raw = '';
  for (let i = 0; i < 3; i++) {
    try {
      raw = await callRetry([
        { role: 'system', content: JUDGE_SYS },
        { role: 'user', content: userMsg }
      ], 2000, 0.2);
      const j = JSON.parse(raw.replace(/^```(json)?\s*/, '').replace(/```\s*$/, '').trim());
      return j;
    } catch (e) { if (i === 2) return { parse_error: String(e.message), raw }; }
  }
}

async function pool(items, worker, concurrency = 8) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      try { results[i] = await worker(items[i]); }
      catch (e) { results[i] = { error: String(e.message) }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

async function main() {
  const items = [];
  for (const g of DATA.groups) {
    for (const it of g.items) {
      it.g = g.g; it.gname = g.name; it.gnote = g.note;
      items.push(it);
    }
  }
  let targets = items;
  if (pilot) targets = items.slice(0, pilotN);
  if (sample) {
    const pick = ['01', '12', '23', '35', '43', '56', '63', '75', '83', '95'];
    targets = items.filter(it => pick.includes(it.no));
  }
  console.log('== V3.1 盲测 == items:', targets.length, pilot ? '(PILOT)' : sample ? '(SAMPLE)' : '(FULL)');
  const t0 = Date.now();

  // Pass A 答题
  console.log('[Pass A] 答题中…');
  const answers = await pool(targets, answerItem, 8);
  for (let i = 0; i < targets.length; i++) targets[i].answer = answers[i];

  // Pass B 评分
  console.log('[Pass B] 反向验证器评分中…');
  const judgments = await pool(targets, (it) => judgeItem(it, it.answer || ''), 8);
  for (let i = 0; i < targets.length; i++) targets[i].judge = judgments[i];

  const out = { meta: { model: MODEL, pilot, prompt_chars: PROMPT.length, blind: true }, items: targets.map(it => ({
    no: it.no, g: it.g, gname: it.gname, q: it.q, point: it.point,
    answer: it.answer, judge: it.judge
  })) };
  const outPath = process.env.V31_OUT || __dirname + '/v31_blind_results.json';
  fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
  console.log('saved: ' + outPath + '  (' + ((Date.now() - t0) / 1000).toFixed(0) + 's)');
  summarize(out);
}

if (args.includes('--summary')) {
  const saved = JSON.parse(fs.readFileSync(process.env.V31_OUT || __dirname + '/v31_blind_results.json', 'utf8'));
  summarize(saved);
} else if (args.includes('--rejudge')) {
  // 補評：只對無效 judge 的題目重跑 Pass B（--rejudge 31,51 或 --rejudge all）
  (async () => {
    const saved = JSON.parse(fs.readFileSync(process.env.V31_OUT || __dirname + '/v31_blind_results.json', 'utf8'));
    const spec = args[args.indexOf('--rejudge') + 1];
    const nos = new Set(spec === 'all' ? saved.items.map(i => i.no) : spec.split(',').map(s => s.trim()));
    const targets = saved.items.filter(it => nos.has(it.no));
    console.log('[Rejudge] items:', targets.map(t => t.no).join(','));
    for (const it of targets) {
      const j = await judgeItem({ g: it.g, no: it.no, q: it.q, point: it.point }, it.answer || '');
      it.judge = j;
      console.log('  no ' + it.no + ' -> ' + (j.parse_error ? 'PARSE_ERR' : 's10=' + j.scores.s10 + ' del=' + j.del_value));
    }
    fs.writeFileSync(process.env.V31_OUT || __dirname + '/v31_blind_results.json', JSON.stringify(saved, null, 1));
    console.log('updated ' + (process.env.V31_OUT || 'v31_blind_results.json'));
    summarize(saved);
  })();
} else {
  main();
}

function summarize(out) {
  const S = ['s1','s2','s3','s4','s5','s6','s7','s10'];
  const byGroup = {};
  for (const it of out.items) {
    const j = it.judge;
    if (!j || j.parse_error || !j.scores) continue;
    byGroup[it.g] = byGroup[it.g] || { sum: {}, n: 0 };
    const b = byGroup[it.g];
    for (const s of S) b.sum[s] = (b.sum[s] || 0) + (j.scores[s] ?? 0);
    if (j.scores.s8 >= 0) { b.sum.s8 = (b.sum.s8 || 0) + j.scores.s8; b.s8n = (b.s8n || 0) + 1; }
    if (j.del_value === 1) b.del = (b.del || 0) + 1;
    b.n++;
  }
  console.log('\n== 快速汇总（按组平均，0-10）==');
  const gtot = { sum: {}, n: 0 };
  for (const g of DATA.groups) {
    const b = byGroup[g.g];
    if (!b) { console.log('G' + g.g, '无有效评分'); continue; }
    let line = 'G' + g.g + ' ' + g.name.slice(0, 8) + ': n=' + b.n;
    let acc = 0, cnt = 0;
    for (const s of S) {
      const v = b.sum[s] / b.n;
      acc += v; cnt++;
      line += ' ' + s + '=' + v.toFixed(1);
    }
    if (b.s8n) { line += ' s8=' + (b.sum.s8 / b.s8n).toFixed(1); acc += b.sum.s8 / b.s8n; cnt++; }
    console.log(line + ' | avg=' + (acc / cnt).toFixed(1) + ' | del_value_pct=' + Math.round(100 * (b.del || 0) / b.n) + '%');
    for (const s of S) gtot.sum[s] = (gtot.sum[s] || 0) + b.sum[s];
    if (b.s8n) gtot.sum.s8 = (gtot.sum.s8 || 0) + b.sum.s8;
    gtot.n += b.n;
  }
  if (gtot.n) {
    let acc = 0, cnt = 0;
    for (const s of S) { acc += gtot.sum[s] / gtot.n; cnt++; }
    console.log('\n总平均: ' + (acc / cnt).toFixed(1) + '/10 (' + cnt + ' 项)');
  }
}
