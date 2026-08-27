#!/usr/bin/env node
// V3.0 回答迭代工作台：一條命令跑完整閉環（掃描風險→抽查質量→問題清單→修復建議）
// 用法：
//   node kb_iterate.js             # 全流程（掃描 + 抽查 + 報告）
//   node kb_iterate.js --scan      # 只掃描（泛化 keyword / 繁簡異體缺口）
//   node kb_iterate.js --audit     # 只抽查語料（分類合理性）
//   node kb_iterate.js --report    # 只出報告（讀上次結果生成 Markdown）
//   node kb_iterate.js --add "句1;句2"  # 追加真實用戶話術到語料庫
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const KB_PATH = path.join(ROOT, "dc-sister/kb-data.json");
const CORPUS_PATH = path.join(ROOT, "kb_queries.jsonl");
const REPORT_PATH = path.join(ROOT, "kb_iterate_report.md");
const RESULT_PATH = path.join(ROOT, "kb_iterate_result.json");

// ── 載入知識庫 ──
const kb = JSON.parse(fs.readFileSync(KB_PATH, "utf8"));

// ── 簡繁轉換（zh-map） ──
const vm = require("vm");
const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "dc-sister/zh-map.js"), "utf8"), ctx);
const SCRIPT = ctx.window.DCSisterScript;
function toSimplified(text) {
  var t = String(text || ""); if (!t) return t;
  var out = "";
  for (var i = 0; i < t.length; i++) out += (SCRIPT.T2S[t[i]] || t[i]);
  return out;
}
function tokenize(text) {
  if (!text) return [];
  const cleaned = toSimplified(String(text).toLowerCase()).replace(/[\s,，。.;；?？!！、:：()（）"'`]+/g, " ");
  const tokens = []; let buf = "";
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i]; const code = ch.charCodeAt(0);
    const isCJK = code >= 0x4e00 && code <= 0x9fff; const isAlnum = /[a-z0-9]/.test(ch);
    if (isAlnum) { buf += ch; } else { if (buf) { tokens.push(buf); buf = ""; } if (isCJK) tokens.push(ch); }
  }
  if (buf) tokens.push(buf);
  return tokens;
}

// ── 停用詞表（與 dc-sister.js 同步） ──
function isParticleSuffix(k) { return /[嗎呢吧呀哦啦]$/.test(String(k)); }
const KB_STOPWORDS = {
  "還是":1,"为什么":1,"我":1,"你的":1,"錯":1,"錯的":1,"虧":1,"賺":1,"錢":1,"你們":1,"的人":1,"的時候":1,"的時刻":1,
  "是什麼時候":1,"是什麼":1,"怎麼":1,"一個":1,"你信嗎":1,"同樣是":1,"你是":1,"過嗎":1,"你見過":1,"你能從":1,
  "四個字":1,"你有沒有想過":1,"你上一次":1,"你有沒有":1,"你有沒有發現":1,"你有沒有想過，你":1,
  "再等等":1,"的念頭":1,"你對":1,"兩個字":1,"你看到":1,"你的第一反應是":1,"作者說":1,
  "你知道嗎":1,"你覺得":1,"你上一次因為":1,"有沒有想過":1,"三個字":1,"你聽得進去嗎":1,"而不是":1,
  "這句話":1,"——這句話":1,"主角的":1,"你買股票時":1,"说的是什么":1,"的是什麼":1,"的是什么":1,
  "怎麼辦":1,"該怎麼辦":1,"怎么办":1,"是不是":1,"真的":1,"其實":1,"其实":1,"就是":1,"那個":1,"這個":1,"这个":1,"那个":1
};
const BOOK_CATS = { "股路不歸·DC問答": 1, "股道·DC問答": 1 };

// ── 索引 + 匹配（複刻 dc-sister.js 邏輯） ──
let index = null;
function buildIndex() {
  index = {};
  kb.categories.forEach((cat, ci) => {
    cat.qa.forEach((qa, qi) => {
      const ref = { cat, qa, ci, qi };
      const addKey = (k) => {
        if (!k) return;
        k = toSimplified(String(k).toLowerCase());
        if (k.length < 2 || k.length > 12) return;
        if (KB_STOPWORDS[k] || isParticleSuffix(k)) return;
        (index[k] = index[k] || []).push(ref);
      };
      (qa.keywords || []).forEach(addKey);
      tokenize(qa.q).forEach(addKey);
    });
  });
}
function scoreQA(query, qa) {
  const q = toSimplified(String(query).toLowerCase().trim()); let score = 0;
  if (qa.keywords && qa.keywords.length) {
    for (const k of qa.keywords) {
      const kw = toSimplified(String(k).toLowerCase()); if (!kw) continue;
      if (KB_STOPWORDS[kw] || isParticleSuffix(kw)) continue;
      if (q.indexOf(kw) >= 0) score += 2 + Math.min(kw.length, 6) * 0.4;
    }
  }
  const ql = toSimplified(qa.q.toLowerCase());
  if (q.indexOf(ql) >= 0 || ql.indexOf(q) >= 0) score += 5;
  const qTokens = tokenize(q); const aTokens = tokenize(qa.q + " " + (qa.keywords || []).join(" "));
  if (qTokens.length && aTokens.length) {
    const setA = {}, setB = {}, all = {};
    qTokens.forEach(t => { setA[t] = true; all[t] = true; });
    aTokens.forEach(t => { setB[t] = true; all[t] = true; });
    const union = Object.keys(all).length;
    let inter = 0; for (const k in setA) { if (setB[k]) inter++; }
    score += (union ? inter / union : 0) * 8;
  }
  return score;
}
function matchBest(query) {
  if (!index) buildIndex();
  const qRaw = toSimplified(String(query || "").toLowerCase());
  const seen = {}; const candidates = [];
  const collect = (key) => {
    const list = index[key]; if (!list) return;
    for (const ref of list) { const k = ref.ci + "|" + ref.qi; if (!seen[k]) { seen[k] = true; candidates.push(ref); } }
  };
  tokenize(qRaw).forEach(t => { if (t.length >= 2) collect(t); });
  for (let st = 0; st < qRaw.length; st++) {
    for (let len = 2; len <= 10 && st + len <= qRaw.length; len += 1) collect(qRaw.slice(st, st + len));
  }
  let best = null, bestScore = 0;
  let bestBook = null, bestBookScore = 0;
  for (const ref of candidates) {
    const s = scoreQA(query, ref.qa);
    if (BOOK_CATS[ref.cat.name]) {
      if (s > bestBookScore) { bestBookScore = s; bestBook = ref; }
    } else {
      if (s > bestScore) { bestScore = s; best = { qa: ref.qa, cat: ref.cat, score: s }; }
    }
  }
  if (bestScore >= 2.5) return best;
  if (bestBookScore >= 2.5) return { qa: bestBook.qa, cat: bestBook.cat, score: bestBookScore };
  return best || (bestBook ? { qa: bestBook.qa, cat: bestBook.cat, score: bestBookScore } : null);
}

// ── ① 掃描風險 ──
function scan() {
  const issues = [];
  // A. 泛化 keyword（共用≥5 且 非書籍特有）
  const kwUsage = {};
  kb.categories.forEach(c => (c.qa || []).forEach(it => {
    const seen = new Set();
    (it.keywords || []).forEach(k => { if (!seen.has(k)) { seen.add(k); kwUsage[k] = (kwUsage[k] || 0) + 1; } });
  }));
  const PROD_TERMS = new Set(["休眠","風控","止損","糾錯","預測","倉位","系統","翻本","連虧","穩賺","重倉","死扛","回本","錯過","等待","割韭菜","連續虧損","勝率","扛單","29800","CCI","低買高賣","化繁為簡","錯過行情","便宜","值","價格","數據","安全","報仇"]);
  const stopSet = new Set([...Object.keys(KB_STOPWORDS), ...Object.keys(KB_STOPWORDS).map(toSimplified)]);
  // 話題詞特徵：含交易領域字 → 共用多但該保留，不算泛化
  const TOPIC_CHARS = "錢虧賺倉單盤損利盈跌漲買賣交系統貨幣金本息價";
  const isTopicWord = (k) => { for (const ch of k) { if (TOPIC_CHARS.includes(ch)) return true; } return false; };
  const generic = Object.entries(kwUsage)
    .filter(([k, n]) => n >= 5 && !stopSet.has(k) && !stopSet.has(toSimplified(k)) && !PROD_TERMS.has(k) && !isTopicWord(k))
    .sort((a, b) => b[1] - a[1]);
  if (generic.length) {
    issues.push({
      type: "E泛化keyword",
      detail: `${generic.length} 個共用≥5題的keyword未入停用表`,
      items: generic.slice(0, 15).map(([k, n]) => `${k}(${n}題)`)
    });
  }
  // B. 繁簡異體缺口：T2S 無法轉換的異體用詞（硬碟/硬盘、著/着、帳/帐 等）
  const VARIANT_CHARS = { "碟": "盘", "著": "着", "帳": "帐", "盤": "盘", "複": "复", "鬱": "郁", "檯": "台" };
  const tradKw = [];
  kb.categories.forEach(c => (c.qa || []).forEach(it => {
    (it.keywords || []).forEach(k => {
      // 只報 T2S 無法轉換（toSimplified 無變化）卻含異體字的 keyword
      const simpK = toSimplified(k);
      if (simpK !== k) return;  // T2S 能轉 → 匹配沒問題，不算異體
      let hasVar = false;
      for (const ch of k) { if (VARIANT_CHARS[ch]) { hasVar = true; break; } }
      if (!hasVar || k.length > 8) return;
      // 檢查同題是否已有含簡體異體字的 keyword（硬碟/硬盘）
      const variantKey = Object.keys(VARIANT_CHARS).find(ch => k.includes(ch));
      const simpVariant = VARIANT_CHARS[variantKey];
      const hasSimpKw = (it.keywords || []).some(k2 => k2.includes(simpVariant));
      if (!hasSimpKw) tradKw.push({ cat: c.name, kw: k, q: it.q.slice(0, 20) });
    });
  }));
  const tradMap = {};
  tradKw.forEach(t => {
    if (!tradMap[t.kw]) tradMap[t.kw] = { kw: t.kw, cats: new Set(), q: t.q };
    tradMap[t.kw].cats.add(t.cat);
  });
  const tradList = Object.values(tradMap).slice(0, 20);
  if (tradList.length) {
    issues.push({
      type: "D繁簡異體",
      detail: `${tradList.length}+ 個含異體字（碟/著/帳等）的keyword缺簡體對應`,
      items: tradList.slice(0, 10).map(t => `${t.kw} [${[...t.cats].slice(0,2).join(",")}] ${t.q}`)
    });
  }
  // C. 太短 keyword（≤2字，除產品專業詞）
  const PROD_WORDS = ["休眠","風控","止損","糾錯","預測","倉位","系統","翻本","連虧","穩賺","重倉","死扛","回本","錯過","等待","割韭菜","风控","止损","纠错","系统","翻本","连亏","稳赚","重仓","死扛","回本","错过","等待","震荡","横盘","信号","体系","功能","区别","对比","止盈","止损线","仓位","离场","深套","减仓","扛单","深套","不亏","少亏","套牢","满仓","空仓","清仓","做单","下单","挂单","止盈","风控"];
  // 只報語法虛詞（的/了/嗎/都…）被當 keyword 用的——真正該進停用表的
  const FUNC_WORDS = "的了吧嗎呢啊都也就還在沒有會能要想是不很真更最太又再只才該被把給從向對到與及或但並這那";
  const shortKw = [];
  const seenKw = new Set();
  kb.categories.forEach(c => (c.qa || []).forEach(it => {
    (it.keywords || []).forEach(k => {
      const simp = toSimplified(k).replace(/\s/g, "");
      if (simp.length <= 2 && [...simp].every(ch => FUNC_WORDS.includes(ch)) && !KB_STOPWORDS[k] && !stopSet.has(simp) && !seenKw.has(simp)) {
        seenKw.add(simp);
        shortKw.push({ cat: c.name, kw: k, q: it.q.slice(0, 20) });
      }
    });
  }));
  if (shortKw.length) {
    issues.push({
      type: "C短keyword風險",
      detail: `${shortKw.length} 個 ≤2字keyword（非產品專業詞）可能過泛`,
      items: shortKw.slice(0, 12).map(t => `${t.kw} [${t.cat}] ${t.q}`)
    });
  }
  return issues;
}

// ── ② 抽查語料 ──
function audit() {
  const lines = fs.readFileSync(CORPUS_PATH, "utf8").trim().split("\n").filter(Boolean);
  const results = [];
  let hit = 0, miss = 0, bookHit = 0;
  const BOOK_WORDS = ["股路不歸", "股道", "主角", "書", "书中", "小說", "作者", "硬盘", "硬碟", "1987", "BB机", "大哥大", "老太太"];
  for (const line of lines) {
    const item = JSON.parse(line);
    const r = matchBest(item.q);
    const isBook = r && BOOK_CATS[r.cat.name];
    const asksBook = BOOK_WORDS.some(w => item.q.includes(w));
    let status, flag;
    if (!r) { miss++; status = "miss"; flag = "無命中"; }
    else if (asksBook) {
      if (isBook) { bookHit++; status = "ok"; flag = "書籍✅"; }
      else if (["认知主题","認知節點","認知節點地圖","情緒狀態鏈","反向思維訓練"].includes(r.cat.name)) { hit++; status = "ok"; flag = "問書→打磨版✅"; }
      else { status = "book-nonbook"; flag = "問書→非書籍"; }
    } else {
      if (!isBook) { hit++; status = "ok"; flag = "非書籍✅"; }
      else { status = "book-抢"; flag = "非書籍話術→書籍⚠️"; }
    }
    results.push({ q: item.q, source: item.source, status, flag, hit: r ? { cat: r.cat.name, q: r.qa.q.slice(0, 30), score: r.score } : null });
  }
  return { total: results.length, hit, miss, bookHit, problems: results.filter(r => r.status !== "ok"), results };
}

// ── ③ 報告 ──
function report(scanIssues, auditResult) {
  const lines = [];
  lines.push("# DC姐姐 回答迭代報告");
  lines.push("");
  lines.push(`> 生成時間：${new Date().toISOString().slice(0, 19)}`);
  lines.push("");
  lines.push("## 一、掃描風險");
  lines.push("");
  if (!scanIssues.length) { lines.push("✅ 無風險"); }
  scanIssues.forEach(iss => {
    lines.push(`### ${iss.type}（${iss.detail}）`);
    iss.items.forEach(it => lines.push(`- ${it}`));
    lines.push("");
  });
  lines.push("## 二、語料抽查");
  lines.push("");
  lines.push(`語料總數 ${auditResult.total}：正常命中 ${auditResult.hit} / 書籍兜底 ${auditResult.bookHit} / 無命中 ${auditResult.miss}`);
  lines.push("");
  const probs = auditResult.problems;
  if (!probs.length) { lines.push("✅ 全部通過"); }
  probs.forEach(p => {
    lines.push(`### [${p.status}] ${p.q.slice(0, 30)}（${p.source}）`);
    lines.push(`- ${p.flag}`);
    if (p.hit) lines.push(`- 命中：${p.hit.cat}「${p.hit.q}」(${p.hit.score.toFixed(1)}分)`);
    lines.push("");
  });
  lines.push("## 三、修復建議");
  lines.push("");
  lines.push("按問題類型對照《V3.0回答迭代機制.md》標準修法：");
  lines.push("- A答非所問 → 查命中題keywords泛化詞→停用表");
  lines.push("- B缺題 → 補專屬Q&A（q用真實話術，keywords含繁簡雙版）");
  lines.push("- C/D keywords缺口/異體 → 補簡體+口語化keywords");
  lines.push("- E泛化keyword → 加入KB_STOPWORDS");
  lines.push("- G書籍搶答 → 書籍純備用（已修）");
  lines.push("");
  return lines.join("\n");
}

// ── 主流程 ──
const args = process.argv.slice(2);
if (args.includes("--add")) {
  const idx = args.indexOf("--add");
  const added = args[idx + 1] || "";
  const lines = added.split(";").map(s => s.trim()).filter(Boolean);
  const f = fs.openSync(CORPUS_PATH, "a");
  lines.forEach(q => {
    fs.writeSync(f, JSON.stringify({ q, expect: "分類合理", source: "真實用戶", ts: new Date().toISOString().slice(0, 10) }) + "\n");
  });
  fs.closeSync(f);
  console.log(`已追加 ${lines.length} 句到語料庫`);
  process.exit(0);
}

// --monitor [--file=qa_log.json]：分析問答日誌，揪出疑似答非所問
if (args.includes("--monitor")) {
  const mf = args.find(a => a.startsWith('--file='));
  const logPath = mf ? mf.replace('--file=', '') : path.join(ROOT, 'qa_log.json');
  if (!fs.existsSync(logPath)) {
    console.log('日誌不存在: ' + logPath + '\n（用 ego-browser 從網站 localStorage 導出 qa_log 後再跑）');
    process.exit(0);
  }
  const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
  console.log('=== 答非所問監控 === 日誌 ' + log.length + ' 條');
  // ① 弱命中（分數<4）
  const weak = log.filter(l => l.weak);
  // ② 書籍兜底（book=true）
  const books = log.filter(l => l.book);
  // ③ 重複提問（同 q 出現 ≥2 次 = 用戶可能沒得到答案）
  const qCount = {};
  log.forEach(l => { qCount[l.q] = (qCount[l.q] || 0) + 1; });
  const repeated = Object.entries(qCount).filter(([q, n]) => n >= 2);
  // ④ 低分命中（<5 分，含非弱命中）
  const low = log.filter(l => l.score < 5 && !l.weak);
  console.log(`\n弱命中(<4分): ${weak.length} | 書籍兜底: ${books.length} | 低分(4-5): ${low.length} | 重複提問: ${repeated.length} 組`);
  if (weak.length) { console.log('\n--- 疑似答非所問（弱命中）---'); weak.slice(-10).forEach(l => console.log(`  [${new Date(l.ts).toLocaleTimeString()}] "${l.q}" → ${l.cat}「${l.hit}」(${l.score}分)`)); }
  if (books.length) { console.log('\n--- 書籍兜底（需人工確認是否答非所問）---'); books.slice(-10).forEach(l => console.log(`  "${l.q}" → ${l.cat}「${l.hit}」(${l.score}分)`)); }
  if (repeated.length) { console.log('\n--- 重複提問（可能沒答好）---'); repeated.slice(0, 10).forEach(([q, n]) => console.log(`  "${q}" ×${n}`)); }
  if (low.length) {
    console.log('\n--- 低分命中(4-5分，疑似答非所問需確認)---');
    low.slice(-10).forEach(l => console.log(`  "${l.q}" → ${l.cat}「${l.hit}」(${l.score}分)`));
  }
  // ⑤ 語義檢查提示：查詢與命中題目的字面重疊低 → 疑似答非所問（重疊率<0.15 且分數<6）
  const overlapLow = log.filter(l => {
    if (l.score >= 6) return false;
    const qSet = new Set(l.q.replace(/[^一-鿿]/g, '').split(''));
    const hSet = new Set(l.hit.replace(/[^一-鿿]/g, '').split(''));
    let inter = 0; qSet.forEach(c => { if (hSet.has(c)) inter++; });
    const ratio = qSet.size ? inter / qSet.size : 0;
    return ratio < 0.15;
  });
  if (overlapLow.length) {
    console.log('\n--- 字面重疊低（強疑似答非所問）---');
    overlapLow.slice(-10).forEach(l => console.log(`  "${l.q}" → ${l.cat}「${l.hit}」(${l.score}分)`));
  }
  process.exit(0);
}

// --emotion：跑 V3.1 情緒知識題（8 維度 24 題，情緒六型處理）
if (args.includes("--emotion")) {
  const { execSync } = require("child_process");
  execSync(`node ${path.join(ROOT, "v42_emotion_test.js")}`, { stdio: "inherit" });
  process.exit(0);
}

// --cog [--n=N]：跑 V3.1 認知能力測試（10 維度，測「該怎麼動作」）
if (args.includes("--cog")) {
  const { execSync } = require("child_process");
  const out = path.join(ROOT, "v41_cog_results.jsonl");
  execSync(`node ${path.join(ROOT, "v41_cog_test.js")}`, { stdio: "inherit" });
  if (fs.existsSync(out)) {
    try {
      const lines = fs.readFileSync(out, "utf8").trim().split("\n").filter(Boolean);
      let total = 0, pass = 0;
      const fails = [];
      lines.forEach(l => { const d = JSON.parse(l); (d.items || []).forEach(it => { total++; if (it.v && it.v.ok === 1) pass++; else if (it.v) fails.push(it.no + ':' + (it.v.action || '?')); }); });
      console.log(`\n[認知能力] ${pass}/${total} (${(pass / total * 100).toFixed(1)}%) 失敗: ${fails.join(' ') || '無'}`);
    } catch (e) {}
  }
  process.exit(0);
}

// --self-review [--n=N]：批量自我評審（答→評→重寫→盲比→沉澱）
if (args.includes("--self-review")) {
  const { execSync } = require("child_process");
  const nArg = args.find(a => a.startsWith("--n="));
  const n = nArg ? parseInt(nArg.replace("--n=", ""), 10) : 10;
  const lines = fs.readFileSync(CORPUS_PATH, "utf8").trim().split("\n").filter(Boolean).slice(0, n);
  const items = lines.map((l, i) => { const j = JSON.parse(l); return { no: String(i + 1).padStart(2, "0"), q: j.q, trap: j.expect || "" }; });
  const tmpIn = path.join(ROOT, "kb_selfreview_input.json");
  const tmpOut = path.join(ROOT, "kb_selfreview_out.jsonl");
  const tmpPpt = path.join(ROOT, "kb_selfreview_precipitate.jsonl");
  fs.writeFileSync(tmpIn, JSON.stringify({ items }));
  console.log(`[自我評審] 語料前 ${items.length} 條…`);
  execSync(`node ${path.join(ROOT, "v37_self_review.js")} --input=${tmpIn} --out=${tmpOut} --precipitate=${tmpPpt}`, { stdio: "inherit" });
  const better = fs.existsSync(tmpPpt) ? fs.readFileSync(tmpPpt, "utf8").trim().split("\n").filter(Boolean).length : 0;
  console.log(`[沉澱] ${better} 條重寫版 → kb_selfreview_precipitate.jsonl（人工確認後入庫）`);
  process.exit(0);
}

const doScan = args.includes("--scan") || args.length === 0;
const doAudit = args.includes("--audit") || args.length === 0;
const doReport = args.includes("--report") || args.length === 0;

let scanIssues = [];
let auditResult = null;
if (doScan) {
  console.log("[掃描] 檢查泛化keyword/繁簡異體/短keyword…");
  scanIssues = scan();
  console.log(`  發現 ${scanIssues.length} 類風險`);
}
if (doAudit) {
  console.log(`[抽查] 語料 ${fs.readFileSync(CORPUS_PATH, "utf8").trim().split("\n").filter(Boolean).length} 條…`);
  auditResult = audit();
  console.log(`  正常 ${auditResult.hit} / 書籍 ${auditResult.bookHit} / 無命中 ${auditResult.miss} / 問題 ${auditResult.problems.length}`);
}
if (doReport) {
  if (!scanIssues.length && !auditResult) { console.log("請先跑掃描或抽查"); process.exit(1); }
  const md = report(scanIssues, auditResult || { total: 0, hit: 0, miss: 0, bookHit: 0, problems: [] });
  fs.writeFileSync(REPORT_PATH, md);
  fs.writeFileSync(RESULT_PATH, JSON.stringify({ scan: scanIssues, audit: auditResult && { total: auditResult.total, hit: auditResult.hit, miss: auditResult.miss, bookHit: auditResult.bookHit, problems: auditResult.problems.map(p => ({ q: p.q, status: p.status, source: p.source, hit: p.hit })) } }, null, 1));
  console.log("報告已生成: " + REPORT_PATH);
}
