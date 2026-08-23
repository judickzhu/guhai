const fs = require("fs");
const kb = JSON.parse(fs.readFileSync("dc-sister/kb-data.json", "utf8"));
function toSimplified(s) { return s; }
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
function scoreQA(query, qa) {
  const q = toSimplified(String(query).toLowerCase().trim()); let score = 0;
  if (qa.keywords && qa.keywords.length) {
    for (const k of qa.keywords) {
      const kw = toSimplified(String(k).toLowerCase()); if (!kw) continue;
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
const queries = ["来这里的目的是什么？", "我亏了很多钱，来这里的目的是什么？", "这里的目的是什么", "来这里做什么"];
for (const query of queries) {
  const scored = [];
  kb.categories.forEach(c => (c.qa || []).forEach(it => {
    const s = scoreQA(query, it);
    if (s >= 2.5) scored.push({ s, cat: c.name, q: it.q.slice(0, 26) });
  }));
  scored.sort((a, b) => b.s - a.s);
  console.log("查詢: " + query);
  scored.slice(0, 3).forEach(x => console.log("  " + x.s.toFixed(1) + " | [" + x.cat + "] " + x.q));
  console.log();
}
