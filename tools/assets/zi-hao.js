/* 子嗥 · 紅樓夢解讀問答窗（本地知識庫匹配版）
 * 依賴：zi-hao-data.js（window.ZiHaoKB）—— 知識庫由 build_honglou_site.py 生成
 * 與 dc-sister 同架構：倒排計分 → 分類優先 → 兜底回覆；簡繁自動顯示。
 * 子嗥人設：紅樓解碼提問者的案頭搭檔，說話親切直接，繁簡混合（粵語味）。
 */
(function () {
  var KB = window.ZiHaoKB || { meta: {}, categories: [] };
  var state = { open: false, lang: 't' };
  var root, panel, body, input, hint;
  var S2T = { "里": "裡", "门": "門", "们": "們", "为": "為", "说": "說", "话": "話", "问": "問", "题": "題", "读": "讀", "写": "寫", "书": "書", "宝": "寶", "钗": "釵", "凤": "鳳", "园": "園", "国": "國", "这": "這", "个": "個", "么": "麼", "没": "沒", "来": "來", "对": "對", "时": "時", "会": "會", "见": "見", "历": "歷", "码": "碼", "纲": "綱", "总": "總", "构": "構", "录": "錄", "寻": "尋", "关": "關", "开": "開", "车": "車", "马": "馬", "鸟": "鳥", "龙": "龍", "荣": "榮", "宁": "寧", "处": "處", "后": "後", "发": "發", "认": "認", "证": "證", "扩": "擴", "兴": "興", "义": "義", "观": "觀", "亲": "親", "双": "雙", "节": "節", "声": "聲", "异": "異", "齐": "齊", "联": "聯", "诗": "詩", "词": "詞", "识": "識", "鉴": "鑑", "梦": "夢", "灵": "靈", "环": "環", "记": "記", "红": "紅", "楼": "樓", "让": "讓", "边": "邊", "风": "風", "云": "雲", "雾": "霧", "与": "與", "学": "學", "业": "業", "习": "習", "劳": "勞", "动": "動", "归": "歸", "残": "殘", "阳": "陽", "阴": "陰", "旧": "舊", "难": "難", "烦": "煩", "忧": "憂", "伤": "傷", "恶": "惡", "乡": "鄉", "爱": "愛", "贝": "貝", "钱": "錢", "银": "銀", "销": "銷", "铁": "鐵", "铜": "銅", "响": "響", "听": "聽", "闻": "聞", "间": "間", "闲": "閒", "阁": "閣", "台": "臺", "馆": "館", "画": "畫", "语": "語", "译": "譯", "谈": "談", "讲": "講", "论": "論", "赋": "賦" };
  var T2S = {};
  for (var k in S2T) T2S[S2T[k]] = k;

  function toT(s) { return String(s).replace(/./g, function (c) { return S2T[c] || c; }); }
  function toS(s) { return String(s).replace(/./g, function (c) { return T2S[c] || c; }); }
  function disp(s) { return state.lang === 't' ? toT(s) : toS(s); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function tokenize(text) {
    return String(text).replace(/[，。！？、；：""''（）《》\s]/g, ' ').split(' ').filter(function (t) { return t.length > 0; });
  }

  // 計分：關鍵詞 + 標題包含 + Jaccard
  function scoreQA(query, qa) {
    if (!query) return 0;
    var q = toS(String(query).toLowerCase().trim());
    var score = 0;
    if (qa.keywords) {
      qa.keywords.forEach(function (kw) {
        kw = toS(String(kw).toLowerCase());
        if (kw && q.indexOf(kw) >= 0) score += 2 + Math.min(kw.length, 6) * 0.4;
      });
    }
    var ql = toS(qa.q.toLowerCase());
    if (q.indexOf(ql) >= 0 || ql.indexOf(q) >= 0) score += 5;
    var qt = tokenize(q), at = tokenize(ql + ' ' + (qa.keywords || []).join(' '));
    if (qt.length && at.length) {
      var inter = 0, all = {};
      qt.forEach(function (t) { all[t] = true; });
      var setB = {}; at.forEach(function (t) { setB[t] = true; });
      qt.forEach(function (t) { if (setB[t]) inter++; });
      var union = Object.keys(all).length + at.length - inter;
      score += (union ? inter / union : 0) * 8;
    }
    return score;
  }

  // 分類優先匹配：先精確分類，再全域
  function match(query) {
    var best = null, bestScore = 0;
    KB.categories.forEach(function (cat) {
      cat.qa.forEach(function (qa) {
        var s = scoreQA(query, qa);
        if (s > bestScore) { bestScore = s; best = { qa: qa, cat: cat, score: s }; }
      });
    });
    return best && bestScore >= 2 ? best : null;
  }

  // ── 人物點評聯動：問「第X回人物點評」→ 讀提問者填寫嘅 honglou_char_review ──
  var CN_DIG = { "零": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 };
  function cnNum(s) {
    s = String(s).trim();
    if (/^\d+$/.test(s)) { var n = parseInt(s, 10); return n >= 1 && n <= 120 ? n : null; }
    if (s === "十") return 10;
    if (s.indexOf("一百二十") >= 0) return 120;
    var m = s.match(/一百零?([一二三四五六七八九])?/);
    if (m) return 100 + (m[1] ? CN_DIG[m[1]] : 0);
    var m2 = s.match(/^([一二三四五六七八九])?十([一二三四五六七八九])?$/);
    if (m2) return (m2[1] ? CN_DIG[m2[1]] : 1) * 10 + (m2[2] ? CN_DIG[m2[2]] : 0);
    if (s.length === 1 && CN_DIG[s] !== undefined) return CN_DIG[s];
    return null;
  }
  function reviewAnswer(query) {
    var q = String(query || "");
    if (q.indexOf("點評") < 0 && q.indexOf("点评") < 0) return null;
    var m = q.match(/第\s*([零一二三四五六七八九十百\d]{1,6})\s*回/);
    if (!m) return null;
    var n = cnNum(m[1]);
    if (!n) return null;
    var review = (KB.charReview || {})[String(n)];
    if (review && review.length) {
      var lines = review.map(function (r) { return "· " + r[0] + " — " + r[1]; }).join("\n");
      return "第" + n + "回人物點評（提問者自填）：\n" + lines;
    }
    return "第" + n + "回嘅人物點評槽位仲係空嘅——呢欄係留畀你自己逐人點評嘅。填法：喺 honglou_char_review.json 寫 {" + n + ": [[\"人物\", \"一句點評\"], ...]}，再重跑生成器，子嗥就識答你。";
  }

  // ── 詩詞解讀聯動：問「第X回詩詞解讀」→ 讀提問者填寫嘅 honglou_poem_review ──
  function poemAnswer(query) {
    var q = String(query || "");
    var hasPoem = q.indexOf("詩詞") >= 0 || q.indexOf("诗词") >= 0
      || q.indexOf("詩句") >= 0 || q.indexOf("诗句") >= 0
      || (q.indexOf("詩") >= 0 && q.indexOf("解") >= 0)
      || (q.indexOf("诗") >= 0 && q.indexOf("解") >= 0);
    if (!hasPoem) return null;
    var m = q.match(/第\s*([零一二三四五六七八九十百\d]{1,6})\s*回/);
    if (!m) return null;
    var n = cnNum(m[1]);
    if (!n) return null;
    var pr = (KB.poemReview || {})[String(n)];
    if (pr && pr.length) {
      var lines = pr.map(function (r) { return "· " + r[0] + " — " + r[1]; }).join("\n");
      return "第" + n + "回詩詞解讀（提問者自填）：\n" + lines;
    }
    return "第" + n + "回嘅詩詞解讀槽位仲係空嘅——呢欄係留畀你自己解讀本回詩詞嘅。填法：喺 honglou_poem_review.json 寫 {" + n + ": [[\"詩詞題目或原句\", \"解讀\"], ...]}，再重跑生成器，子嗥就識答你。";
  }

  // 兜底回覆
  function fallback(query) {
    var meta = KB.meta || {};
    var s = meta.fallback || '總綱素材暫未覆蓋這個問題，你可以換個問法，或者問我「人物對標」「判詞」「某回解碼」呢啲方向。';
    return s + '\n\n（子嗥答唔到，唔代表素材無——可以翻對應回卡，或者去「人物對標」頁睇。）';
  }

  function greeting() {
    var meta = KB.meta || {};
    return meta.greeting || '嗨，我係子嗥——紅樓解碼嘅案頭搭檔。你可以問我：某回講咩、人物對標、判詞、字音字形、九幕分期。想知邊個方向？';
  }

  function open() { if (root) { root.classList.add('open'); state.open = true; input.focus(); } }
  function close() { if (root) { root.classList.remove('open'); state.open = false; } }
  function toggle() { state.open ? close() : open(); }

  function bubble(text, who) {
    var div = document.createElement('div');
    div.className = 'zh-msg ' + who;
    div.innerHTML = esc(text).replace(/\n/g, '<br>');
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
  }

  function ask() {
    var q = input.value.trim();
    if (!q) return;
    bubble(disp(q), 'me');
    input.value = '';
    var hit = match(q);
    var rv = reviewAnswer(q);
    var pv = poemAnswer(q);
    if (rv) {
      bubble(disp(rv), 'ai');
    } else if (pv) {
      bubble(disp(pv), 'ai');
    } else if (hit) {
      var a = hit.qa.a + (hit.qa.ref ? '\n\n（出處：' + hit.qa.ref + '）' : '');
      bubble(disp(a), 'ai');
      if (hit.qa.hint) bubble(disp(hit.qa.hint), 'hint');
    } else {
      bubble(disp(fallback(q)), 'ai');
    }
  }

  function toggleLang() {
    state.lang = state.lang === 't' ? 's' : 't';
    var btn = document.getElementById('zh-lang');
    if (btn) btn.textContent = state.lang === 't' ? '簡' : '繁';
    // 重繪歡迎語
    body.innerHTML = '';
    bubble(disp(greeting()), 'ai');
  }

  function build() {
    if (document.getElementById('zh-root')) return;
    root = document.createElement('div');
    root.id = 'zh-root';
    root.innerHTML =
      '<button id="zh-fab" title="問問子嗥" onclick="ZiHao.toggle()">嗥</button>' +
      '<div id="zh-panel">' +
      '  <div id="zh-head"><span>📖 子嗥 · 紅樓解碼搭檔</span>' +
      '    <span class="zh-hd-tools"><button id="zh-lang" onclick="ZiHao.toggleLang()">簡</button>' +
      '    <button onclick="ZiHao.close()" title="關閉">✕</button></span></div>' +
      '  <div id="zh-body"></div>' +
      '  <div id="zh-foot"><input id="zh-input" placeholder="問子嗥：例如「第一回講咩」「寶釵係邊個」「判詞點解」…">' +
      '    <button id="zh-send" onclick="ZiHao.ask()">發送</button></div>' +
      '</div>';
    document.body.appendChild(root);
    body = document.getElementById('zh-body');
    input = document.getElementById('zh-input');
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') ask(); });
    bubble(disp(greeting()), 'ai');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }

  window.ZiHao = { open: open, close: close, toggle: toggle, ask: ask, toggleLang: toggleLang };
})();
