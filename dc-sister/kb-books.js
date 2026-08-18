/* ============================================================
 * DC姐姐 · 书籍知识库（kb-books.js）
 * 功能：
 *   1. 懒加载 kb-books.json（约 1MB，仅当本地 KB 未命中时才加载）
 *   2. 中文分词倒排索引检索（标题/关键词加权 + 正文词频 BM25 式打分）
 *   3. 供 dc-sister.js 做本地兜底检索
 * 依赖（可选）：zh-map.js 的 window.DCSisterScript（query 繁转简）
 * 说明：书籍检索失败/未加载时静默降级，不影响主客服功能。
 * ============================================================ */
(function () {
  "use strict";

  var URL = (window.PREFIX || "") + "kb-books.json"; // 本站繁體書籍庫（根目錄，2385 篇）
  var data = null;        // {meta, articles:[{id,book,title,q,a,reflection,keywords,summary,content}]}
  var INDEX = null;       // term -> [{d, tf}]  正文倒排
  var TITLE_IDX = null;   // term -> [d]  标题
  var KW_IDX = null;      // term -> [d]  关键词
  var Q_IDX = null;       // term -> [d]  问题字段（QA 库优先命中）
  var loaded = false;
  var loading = false;
  var pendingCbs = [];

  /* ---------- 中文分词 ---------- */
  function toSimplified(text) {
    var t = String(text || "");
    var S = window.DCSisterScript;
    if (S && S.T2S) {
      var T2S = S.T2S, out = "";
      for (var i = 0; i < t.length; i++) out += T2S[t[i]] || t[i];
      return out;
    }
    return t;
  }

  // 返回去重后的检索 term 列表（连续汉字串 → 整词 + 全部 bigram）
  function tokenize(text) {
    var t = toSimplified(String(text || "")).toLowerCase();
    var terms = {}, seg = "";
    var flush = function () {
      if (seg.length === 0) return;
      if (seg.length <= 12) terms[seg] = 1;
      for (var i = 0; i + 2 <= seg.length; i++) terms[seg.slice(i, i + 2)] = 1;
      seg = "";
    };
    for (var i = 0; i < t.length; i++) {
      if (/[\u4e00-\u9fa5]/.test(t[i])) seg += t[i];
      else flush();
    }
    flush();
    return Object.keys(terms);
  }

  /* ---------- 倒排索引构建 ---------- */
  function buildIndex(articles) {
    var idx = {}, tidx = {}, kidx = {}, qidx = {}, dlen = [];
    var push = function (map, term, d) {
      var arr = map[term];
      if (!arr) { map[term] = arr = []; }
      if (arr[arr.length - 1] !== d) arr.push(d);
    };
    for (var d = 0; d < articles.length; d++) {
      var a = articles[d];
      dlen.push(String(a.content || "").length);
      var titleTerms = tokenize(a.title);
      var kwTerms = tokenize((a.keywords || []).join(" "));
      var qTerms = tokenize(a.q);
      for (var i = 0; i < titleTerms.length; i++) push(tidx, titleTerms[i], d);
      for (var j = 0; j < kwTerms.length; j++) push(kidx, kwTerms[j], d);
      for (var qi = 0; qi < qTerms.length; qi++) push(qidx, qTerms[qi], d);
      var terms = tokenize(a.content);
      for (var k = 0; k < terms.length; k++) {
        var t = terms[k];
        var lst = idx[t];
        if (!lst) { lst = idx[t] = []; }
        if (lst.length && lst[lst.length - 1].d === d) lst[lst.length - 1].tf++;
        else lst.push({ d: d, tf: 1 });
      }
    }
    return { index: idx, titleIdx: tidx, kwIdx: kidx, qIdx: qidx, dlen: dlen };
  }

  /* ---------- 检索 ---------- */
  // 返回 [{id, book, title, q, a, reflection, summary, content, score}]，按分数降序
  // QA 库评分：问题字段命中 4.0 > 标题 3.0 > 关键词 2.0 > 正文 BM25
  function search(query, topN) {
    if (!loaded) return [];
    var n = topN || 3;
    var terms = tokenize(query);
    if (!terms.length) return [];
    var scores = {}, weight = {};
    for (var i = 0; i < terms.length; i++) {
      var term = terms[i];
      weight[term] = (weight[term] || 0) + (term.length >= 2 ? 1 : 0.6);
    }
    for (var t in weight) {
      var w = weight[t];
      var qi = Q_IDX[t];
      if (qi) for (var x = 0; x < qi.length; x++) scores[qi[x]] = (scores[qi[x]] || 0) + 4.0 * w;
      var ti = TITLE_IDX[t];
      if (ti) for (var y = 0; y < ti.length; y++) scores[ti[y]] = (scores[ti[y]] || 0) + 3.0 * w;
      var ki = KW_IDX[t];
      if (ki) for (var z = 0; z < ki.length; z++) scores[ki[z]] = (scores[ki[z]] || 0) + 2.0 * w;
      var lst = INDEX[t];
      if (lst) for (var v = 0; v < lst.length; v++) {
        var e = lst[v];
        scores[e.d] = (scores[e.d] || 0) + w * (e.tf / (e.tf + 1.5));
      }
    }
    var arr = [];
    for (var d in scores) {
      if (scores[d] >= 0.8) arr.push({ d: +d, score: scores[d] });
    }
    arr.sort(function (a, b) { return b.score - a.score; });
    return arr.slice(0, n).map(function (r) {
      var a = data.articles[r.d];
      return { id: a.id, book: a.book, title: a.title, q: a.q, a: a.a,
               reflection: a.reflection, keywords: a.keywords,
               summary: a.summary, content: a.content, score: Math.round(r.score * 100) / 100 };
    });
  }

  /* ---------- 懒加载 ---------- */
  function ensureLoad(cb) {
    if (loaded) { if (cb) cb(); return; }
    if (cb) pendingCbs.push(cb);
    if (loading) return;
    loading = true;
    fetch(URL, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (json) {
        data = json;
        if (data && data.articles) {
          var built = buildIndex(data.articles);
          INDEX = built.index; TITLE_IDX = built.titleIdx; KW_IDX = built.kwIdx; Q_IDX = built.qIdx;
          loaded = true;
        }
      })
      .catch(function () { /* 静默降级：书籍库不可用时不影响主功能 */ })
      .then(function () {
        loading = false;
        var cbs = pendingCbs; pendingCbs = [];
        for (var i = 0; i < cbs.length; i++) cbs[i]();
      });
  }

  window.DCSisterBooks = {
    load: ensureLoad,
    search: search,
    isLoaded: function () { return loaded; },
    count: function () { return loaded && data ? data.articles.length : 0; }
  };
})();
