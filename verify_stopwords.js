// V3.3 泛化詞停用表回歸測試：驗證「答非所問」修復且專業詞不誤傷
const fs = require("fs");
const vm = require("vm");
const ctx = { window: {}, console, state: { lastCat: null, script: null }, KB_MATCH: null };
// 載入 zh-map（DCSisterScript）
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("dc-sister/zh-map.js", "utf8"), ctx);
const SCRIPT = ctx.window.DCSisterScript;
const SMALL_T2S = {};
function toSimplified(text) {
  var t = String(text || ""); if (!t) return t;
  var out = "";
  for (var i = 0; i < t.length; i++) out += (SCRIPT.T2S[t[i]] || SMALL_T2S[t[i]] || t[i]);
  return out;
}
function tokenize(text) {
  if (!text) return [];
  const cleaned = toSimplified(String(text).toLowerCase()).replace(/[\s,，。.;；?？!！、:：()（）"'`]+續損該開關頭盤處無萬間時後發現單問題/g, " ");
  const tokens = []; let buf = "";
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i]; const code = ch.charCodeAt(0);
    const isCJK = code >= 0x4e00 && code <= 0x9fff; const isAlnum = /[a-z0-9]/.test(ch);
    if (isAlnum) { buf += ch; } else { if (buf) { tokens.push(buf); buf = ""; } if (isCJK) tokens.push(ch); }
  }
  if (buf) tokens.push(buf);
  return tokens;
}
// 複刻 buildKBIndex + matchBest + scoreQA（含 KB_STOPWORDS）
const KB_STOPWORDS = {
  "還是":1,"为什么":1,"我":1,"你的":1,"錯":1,"錯的":1,"虧":1,"賺":1,"錢":1,"你們":1,"的人":1,"的時候":1,"的時刻":1,
  "是什麼時候":1,"是什麼":1,"怎麼":1,"一個":1,"你信嗎":1,"同樣是":1,"你是":1,"過嗎":1,"你見過":1,"你能從":1,
  "四個字":1,"你有沒有想過":1,"你上一次":1,"你有沒有":1,"你有沒有發現":1,"你有沒有想過，你":1,
  "再等等":1,"的念頭":1,"你對":1,"兩個字":1,"你看到":1,"你的第一反應是":1,"作者說":1,
  "你知道嗎":1,"你覺得":1,"你上一次因為":1,"有沒有想過":1,"三個字":1,"你聽得進去嗎":1,"而不是":1,
  "這句話":1,"——這句話":1,"主角的":1,"你買股票時":1,"说的是什么":1,"的是什麼":1,"的是什么":1,"怎麼辦":1,"該怎麼辦":1,"怎么办":1,"是不是":1,"真的":1,"其實":1,"其实":1,"就是":1,"那個":1,"這個":1,"这个":1,"那个":1
};
const kb = JSON.parse(fs.readFileSync("dc-sister/kb-data.json", "utf8"));
// 構建索引
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
  for (const ref of candidates) {
    const s = scoreQA(query, ref.qa);
    if (s > bestScore) { bestScore = s; best = { qa: ref.qa, cat: ref.cat, score: s }; }
  }
  if (!best || bestScore < 2.5) return null;
  return best;
}

// 測試用例
const tests = [
  // 修復場景（之前會誤命中硬碟題）
  { q: "来这里的目的是什么？", expect: "來這裡的目的是什麼" },
  { q: "我亏了很多钱，来这里的目的是什么？", expect: "來這裡的目的是什麼" },
  { q: "这里是做什么的", expect: "來這裡的目的是什麼" },
  // 正常專業詞（確保不誤傷）
  { q: "休眠功能是什么？", expect: "休眠" },
  { q: "为什么一直休眠？", expect: "休眠" },
  { q: "止损和扛单有什么区别？", expect: "止損" },
  { q: "翻本心理很危险吗？", expect: "翻本" },
  { q: "你们是割韭菜吗？", expect: "割韭菜" },
  { q: "系统错了谁负责？", expect: "系統" },
  { q: "连续亏损了该怎么办？", expect: "停" },
  { q: "震荡行情怎么做？", expect: "震盪" },
  { q: "你们保证盈利吗？", expect: "保證" },
  // 書籍題（應命中書籍分類）
  { q: "主角为什么会带走硬盘？", expect: "硬碟" },
  { q: "走得太远以至于忘记了出发的目的", expect: "出發" },
];
let pass = 0;
for (const t of tests) {
  const r = matchBest(t.q);
  const hitQ = r ? r.qa.q : "(無命中)";
  const sim = (s) => { const m = {"這":"这","裡":"里","麼":"么","為":"为","什麼":"什么","說":"说","麼":"么","虧":"亏","賺":"赚","連":"连","虧":"亏","穩":"稳","錯":"错","勝":"胜","確":"确","繫":"系","統":"统","證":"证","证":"證","讓":"让","續":"续","損":"损","該":"该","開":"开","關":"关","頭":"头","盤":"盘","處":"处","無":"无","萬":"万","間":"间","時":"时","後":"后","發":"发","現":"现","單":"单","問":"问","題":"题","這":"这","裡":"里","麼":"么","為":"为","說":"说","虧":"亏","賺":"赚","連":"连","穩":"稳","錯":"错","勝":"胜","確":"确"}; return String(s).replace(/[這裡麼為說虧賺連穩錯勝確繫統續損該開關頭盤處無萬間時後發現單問題證讓]/g, c => m[c] || c); };
  const ok = r && (sim(hitQ).includes(sim(t.expect)) || sim(t.expect).includes(sim(hitQ).slice(0, 4)));
  if (ok) pass++;
  console.log((ok ? "✅" : "❌") + " " + t.q.slice(0, 22) + " → " + hitQ.slice(0, 34) + " (" + (r ? r.score.toFixed(1) : "-") + "分) 期望含:" + t.expect);
}
console.log("\n通過: " + pass + "/" + tests.length);
