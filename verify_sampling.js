// V3.3 大樣本匹配合理性抽查：50 句真實用戶話術 → 檢查命中分類合理性
// 判定標準：產品/交易/情緒類話術應命中非書籍分類；明顯問書（書名/情節/書中句子）才允許書籍兜底
const fs = require("fs");
const vm = require("vm");
const ctx = { window: {}, console, state: { lastCat: null, script: null } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("dc-sister/zh-map.js", "utf8"), ctx);
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
const KB_STOPWORDS = {
  "還是":1,"为什么":1,"我":1,"你的":1,"錯":1,"錯的":1,"虧":1,"賺":1,"錢":1,"你們":1,"的人":1,"的時候":1,"的時刻":1,
  "是什麼時候":1,"是什麼":1,"怎麼":1,"一個":1,"你信嗎":1,"同樣是":1,"你是":1,"過嗎":1,"你見過":1,"你能從":1,
  "四個字":1,"你有沒有想過":1,"你上一次":1,"你有沒有":1,"你有沒有發現":1,"你有沒有想過，你":1,
  "再等等":1,"的念頭":1,"你對":1,"兩個字":1,"你看到":1,"你的第一反應是":1,"作者說":1,
  "你知道嗎":1,"你覺得":1,"你上一次因為":1,"有沒有想過":1,"三個字":1,"你聽得進去嗎":1,"而不是":1,
  "這句話":1,"——這句話":1,"主角的":1,"你買股票時":1,"说的是什么":1,"的是什麼":1,"的是什么":1,
  "怎麼辦":1,"該怎麼辦":1,"怎么办":1,"是不是":1,"真的":1,"其實":1,"其实":1,"就是":1,"那個":1,"這個":1,"这个":1,"那个":1
};
const kb = JSON.parse(fs.readFileSync("dc-sister/kb-data.json", "utf8"));
const index = {};
kb.categories.forEach((cat, ci) => {
  cat.qa.forEach((qa, qi) => {
    const ref = { cat, qa, ci, qi };
    const addKey = (k) => {
      if (!k) return;
      k = toSimplified(String(k).toLowerCase());
      if (k.length < 2 || k.length > 12) return;
      if (KB_STOPWORDS[k]) return;
      (index[k] = index[k] || []).push(ref);
    };
    (qa.keywords || []).forEach(addKey);
    tokenize(qa.q).forEach(addKey);
  });
});
function scoreQA(query, qa) {
  const q = toSimplified(String(query).toLowerCase().trim()); let score = 0;
  if (qa.keywords && qa.keywords.length) {
    for (const k of qa.keywords) {
      const kw = toSimplified(String(k).toLowerCase()); if (!kw) continue;
      if (KB_STOPWORDS[kw]) continue;
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
  const BOOK_CATS = { "股路不歸·DC問答": 1, "股道·DC問答": 1 };
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

// 50 句真實用戶話術（混合場景）
const QUERIES = [
  // 產品功能
  "休眠功能是什么？", "你们是怎么控制风险的？", "支持OKX吗？", "怎么绑定交易所？",
  "有哪些功能？", "跟普通量化有什么区别？", "DCOGAI是什么意思？", "收费多少钱？",
  "有免费试用吗？", "怎么下载安装？", "电脑能用吗？", "支持哪些交易所？",
  // 交易認知
  "为什么一直休眠不交易？", "止损和扛单有什么区别？", "连续亏损了怎么办？", "翻本心理怎么克服？",
  "震荡行情怎么做？", "你们保证盈利吗？", "预测涨跌吗？", "怎么判断该不该开仓？",
  "空仓也算交易吗？", "错过行情怎么办？", "为什么等待也是交易？", "盈利了该不该加仓？",
  "怎么做到知行合一？", "系统会出错吗？", "系统错了谁负责？", "怎么验证它有效？",
  // 情緒
  "我亏了20%睡不着觉", "我就是想一把翻本", "看到账户就害怕", "别人赚钱我很难受",
  "我已经连续亏了十几次", "道理都懂就是做不到", "感觉不适合交易", "赚的全吐回去了",
  // 質疑
  "你们是割韭菜吗？", "凭什么信你们？", "是不是骗人的？", "为什么不自己拿钱做？",
  "29800太贵了吧？", "真赚钱的人会卖软件？", "别讲理念，拿数据出来",
  // 書籍（應兜底）
  "主角为什么会带走硬盘？", "走得太远忘记了出发的目的", "主角怎么联想到1987年股灾？",
  "大哥大和BB机说明了什么？", "老太太晕倒主角什么反应？", "股票跌了多少早盘进场的人怎样？",
];
const BOOK_WORDS = ["股路不歸", "股道", "主角", "書", "书中", "小說", "作者"];
let productHit = 0, bookHit = 0, empty = 0, suspect = 0;
console.log("=== 50 句真實話術匹配抽查 ===");
for (const q of QUERIES) {
  const r = matchBest(q);
  const isBook = r && (r.cat.name.includes("股路") || r.cat.name.includes("股道"));
  const asksBook = BOOK_WORDS.some(w => q.includes(w)) || q.includes("主角") || q.includes("大哥大") || q.includes("BB机") || q.includes("1987") || q.includes("老太太") || q.includes("硬盘");
  let flag = "?";
  if (!r) { empty++; flag = "無命中"; }
  else if (asksBook) { if (isBook) { bookHit++; flag = "書籍✅"; } else { suspect++; flag = "問書但非書籍⚠️"; } }
  else { if (!isBook) { productHit++; flag = "非書籍✅"; } else { suspect++; flag = "產品但書籍⚠️"; } }
  console.log((flag.includes("✅") ? "✅" : flag.includes("⚠️") ? "⚠️" : "⏳") + " " + q.slice(0, 16) + " → [" + (r ? r.cat.name.slice(0, 6) : "無") + "] " + (r ? r.qa.q.slice(0, 20) : "") + " (" + (r ? r.score.toFixed(1) : "-") + ") " + flag);
}
console.log("\n=== 抽查統計 ===");
console.log("產品/交易話術 → 非書籍: " + productHit);
console.log("書籍話術 → 書籍兜底: " + bookHit);
console.log("無命中: " + empty);
console.log("可疑（分類與預期不符）: " + suspect);
