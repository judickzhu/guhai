/* ============================================================
 * DC姐姐 · 产品顾问 —— 核心逻辑
 * 版本：v2.2
 * 功能：
 *   1. 悬浮入口 + 全屏侧滑面板
 *   2. 智能问答：优先调用后端 DeepSeek LLM（知识库增强方案A），
 *      失败/未启用时回退到前端本地关键词匹配兜底
 *   3. 后端合规过滤 + 前端禁语硬拦截 + 统一合规后缀
 *   4. 知识库浏览（分类导航 / 搜索 / 内容索引）
 *   5. 快捷提问 / 打字指示 / 多轮上下文
 *   6. 繁简体自适应（V2.2）：
 *      - 系统初始化时按设备语言/区域自动切换界面文字体系（简/繁）
 *      - 用户输入过程中实时检测输入文字体系并无缝切换
 *      - 对话回复与用户输入文字体系保持一致（后端 + 前端本地兜底）
 * 依赖：kb-data.js (window.DCSisterKB)、zh-map.js (window.DCSisterScript)、iconify-icon
 * ============================================================ */
(function () {
  "use strict";

  var KB = window.DCSisterKB;        // 展示用知识库（跟随当前文字体系，简/繁）
  var KB_MATCH = window.DCSisterKB;  // 匹配用知识库（始终简体，供检索/禁语/分层识别）
  if (!KB) {
    console.error("[DC姐姐] 知识库数据未加载 (kb-data.js)");
    return;
  }

  var SCRIPT = window.DCSisterScript || null; // zh-map.js 繁简映射数据
  var SCRIPT_SIMPLIFIED = "simplified";
  var SCRIPT_TRADITIONAL = "traditional";

  var API_BASE = "/api/dc-sister";
  var llmEnabled = false;  // 后端 DeepSeek 是否可用
  var llmChecked = false;  // 是否已完成状态探测

  /* ============== 繁简体工具（V2.2） ============== */
  // 内置小表（zh-map.js 未加载时的兜底）
  var SMALL_T2S = {
    "錢": "钱", "點": "点", "軟": "软", "為": "为", "會": "会",
    "電": "电", "話": "话", "問": "问", "對": "对", "過": "过",
    "時": "时", "間": "间", "開": "开", "發": "发", "機": "机",
    "來": "来", "個": "个", "們": "们", "這": "这", "說": "说",
    "麼": "么", "沒": "没", "讓": "让", "該": "该", "進": "进",
    "還": "还", "經": "经", "從": "从", "兩": "两", "覺": "觉",
    "記": "记", "錯": "错", "應": "应", "選": "择", "擇": "择",
    "係": "系", "統": "统", "務": "务", "質": "质", "題": "题",
    "類": "类", "關": "关", "聯": "联", "員": "员", "與": "与",
    "許": "许", "認": "认", "識": "识"
  };
  var SMALL_S2T = {
    "钱": "錢", "点": "點", "软": "軟", "为": "為", "会": "會", "电": "電", "话": "話",
    "问": "問", "对": "對", "过": "過", "时": "時", "间": "間", "开": "開", "发": "發",
    "机": "機", "来": "來", "个": "個", "们": "們", "这": "這", "说": "說", "么": "麼",
    "没": "沒", "让": "讓", "该": "該", "进": "進", "还": "還", "经": "經", "从": "從",
    "两": "兩", "觉": "覺", "记": "記", "错": "錯", "应": "應", "选": "選", "择": "擇",
    "系": "係", "统": "統", "务": "務", "质": "質", "题": "題", "类": "類", "关": "關",
    "联": "聯", "员": "員", "与": "與", "许": "許", "认": "認", "识": "識"
  };

  // 简体字 -> 繁体字（单字 + 歧义短语修正）
  function toTraditional(text) {
    text = String(text || "");
    if (!text) return text;
    if (!SCRIPT) {
      return text.replace(/./g, function (c) { return SMALL_S2T[c] || c; });
    }
    var S2T = SCRIPT.S2T;
    var P = SCRIPT.PHRASES;
    var keys = null;
    if (P) {
      keys = Object.keys(P).sort(function (a, b) { return b.length - a.length; });
    }
    var out = "", i = 0, n = text.length;
    while (i < n) {
      var matched = null;
      if (keys) {
        for (var k = 0; k < keys.length; k++) {
          var ph = keys[k];
          if (text.slice(i, i + ph.length) === ph) { matched = ph; break; }
        }
      }
      if (matched) {
        out += P[matched];
        i += matched.length;
      } else {
        out += S2T[text[i]] || SMALL_S2T[text[i]] || text[i];
        i++;
      }
    }
    return out;
  }

  // 繁体字 -> 简体字（全量单字映射）
  function toSimplified(text) {
    var t = String(text || "");
    if (!t) return t;
    if (!SCRIPT) {
      return t.replace(/./g, function (c) { return SMALL_T2S[c] || c; });
    }
    var T2S = SCRIPT.T2S;
    var out = "";
    for (var i = 0; i < t.length; i++) {
      out += T2S[t[i]] || SMALL_T2S[t[i]] || t[i];
    }
    return out;
  }

  // 检测文本主要文字体系：简体 / 繁体
  function detectScript(text) {
    var t = String(text || "");
    var trad = 0, simp = 0;
    var T2S = SCRIPT ? SCRIPT.T2S : SMALL_T2S;
    var S2T = SCRIPT ? SCRIPT.S2T : SMALL_S2T;
    for (var i = 0; i < t.length; i++) {
      var c = t[i];
      if (T2S[c]) trad++;
      else if (S2T[c]) simp++;
    }
    if (trad > simp) return SCRIPT_TRADITIONAL;
    if (simp > trad) return SCRIPT_SIMPLIFIED;
    // 繁簡同形為主的句子：傾向保持當前文字體系，避免繁體用戶被誤切到簡體
    if (state && state.script === SCRIPT_TRADITIONAL) return SCRIPT_TRADITIONAL;
    return trad ? SCRIPT_TRADITIONAL : SCRIPT_SIMPLIFIED;
  }

  // 检测设备系统语言/区域偏好（初始化时使用）
  function detectSystemScript() {
    var langs = [];
    try {
      langs = navigator.languages || [navigator.language || navigator.userLanguage || "zh-CN"];
    } catch (e) {
      langs = ["zh-CN"];
    }
    for (var i = 0; i < langs.length; i++) {
      var l = String(langs[i] || "").toLowerCase().replace(/_/g, "-");
      if (l.indexOf("zh") !== 0) continue;
      // zh-Hant / zh-TW / zh-HK / zh-MO 视为繁体偏好
      if (l.indexOf("hant") >= 0 || /-(tw|hk|mo)$/.test(l)) return SCRIPT_TRADITIONAL;
      return SCRIPT_SIMPLIFIED;
    }
    return SCRIPT_SIMPLIFIED;
  }

  // 将简体源文本转换为当前界面文字体系（用于渲染展示）
  function displayText(s) {
    if (!s) return s;
    if (state.script === SCRIPT_TRADITIONAL) return toTraditional(s);
    return toSimplified(s);
  }

  /* ============== UI 多语言文案（简/繁） ============== */
  var UI_TEXT = {
    launcher_aria: { s: "打开 DC姐姐 · 产品顾问", t: "打開 DC姐姐 · 產品顧問" },
    launcher_hint: { s: "有问题随时问我，DC姐姐在线 👋", t: "有問題隨時問我，DC姐姐在線 👋" },
    header_name: { s: "DC姐姐 · 产品顾问", t: "DC姐姐 · 產品顧問" },
    status_initial: { s: "在线 · 平均 3 秒响应", t: "在線 · 平均 3 秒響應" },
    status_llm: { s: "在线 · 问答中", t: "在線 · 問答中" },
    status_local: { s: "本地模式 · 知识库兜底", t: "本地模式 · 知識庫兜底" },
    btn_kb: { s: "知识库", t: "知識庫" },
    btn_kb_aria: { s: "打开知识库", t: "打開知識庫" },
    btn_restart: { s: "重新开始", t: "重新開始" },
    btn_close: { s: "关闭客服", t: "關閉客服" },
    btn_script: { s: "切换简繁体", t: "切換簡繁體" },
    input_placeholder: { s: "输入你的问题，例如：怎么收费？API怎么绑定？…", t: "輸入你的問題，例如：怎麼收費？API怎麼綁定？…" },
    input_aria: { s: "输入消息", t: "輸入消息" },
    send_aria: { s: "发送", t: "發送" },
    avatar_me: { s: "我", t: "我" },
    suffix_label: { s: "（合规后缀）", t: "（合規後綴）" },
    deep_tag: { s: "深入了解 · 详细解读", t: "深入了解 · 詳細解讀" },
    deep_btn: { s: "深入了解", t: "深入了解" },
    deep_loading: { s: "展开中…", t: "展開中…" },
    deep_done: { s: "已展开", t: "已展開" },
    deep_err: { s: "抱歉，展开详细内容时网络出了点小状况，请稍后再试，或换个方式问我～", t: "抱歉，展開詳細內容時網絡出了點小狀況，請稍後再試，或換個方式問我～" },
    kb_title: { s: "客服知识库", t: "客服知識庫" },
    kb_search_ph: { s: "搜索关键词，例如：收费 / API / 休眠…", t: "搜索關鍵詞，例如：收費 / API / 休眠…" },
    kb_all: { s: "全部", t: "全部" },
    kb_count: { s: "条", t: "條" },
    kb_empty: { s: "未找到相关内容，换个关键词试试 🙏", t: "未找到相關內容，換個關鍵詞試試 🙏" },
    q_price: { s: "怎么收费？", t: "怎麼收費？" },
    q_diff: { s: "和普通量化有什么区别？", t: "和普通量化有什麼區別？" },
    q_api: { s: "API怎么绑定？安全吗？", t: "API怎麼綁定？安全嗎？" },
    q_newbie: { s: "新手能用吗？", t: "新手能用嗎？" },
    q_human: { s: "找人工客服", t: "找人工客服" },
    human_intro: { s: "好的，已为你准备官方人工客服通道，7×24 小时全天候轮班值守：", t: "好的，已為你準備官方人工客服通道，7×24 小時全天候輪班值守：" },
    human_scope: { s: "• 服务范围：安装报错、API异常、参数调试、模型讲解、运行故障、授权咨询、机构定制、批量部署、日志复盘等", t: "• 服務範圍：安裝報錯、API異常、參數調試、模型講解、運行故障、授權諮詢、機構定制、批量部署、日誌複盤等" },
    human_remote: { s: "• 疑难问题支持一对一远程桌面协助", t: "• 疑難問題支援一對一遠程桌面協助" },
    human_tip: { s: "建议优先联系，会有专人对接。", t: "建議優先聯絡，會有專人對接。" },
    bl_start: { s: "关于「{w}」这类问题，我无法做出承诺或暗示。", t: "關於「{w}」這類問題，我無法做出承諾或暗示。" },
    bl_mid1: { s: "DCOGAI 是标准化自动化风控执行工具，不承诺、不保证任何正向交易收益，", t: "DCOGAI 是標準化自動化風控執行工具，不承諾、不保證任何正向交易收益，" },
    bl_mid2: { s: "核心价值是减少无效交易、管控单笔亏损、降低账户回撤、规避人性弱点。", t: "核心價值是減少無效交易、管控單筆虧損、降低賬戶回撤、規避人性弱點。" },
    bl_end: { s: "我可以帮你介绍功能、收费、安装、安全等内容，欢迎继续提问。", t: "我可以幫你介紹功能、收費、安裝、安全等內容，歡迎繼續提問。" },
    fb_head: { s: "这个问题我暂时没有完全匹配的答案，你可以试试这样问我：", t: "這個問題我暫時沒有完全匹配的答案，你可以試試這樣問我：" },
    fb_q1: { s: "• 「怎么收费？」「年费多少？」", t: "• 「怎麼收費？」「年費多少？」" },
    fb_q2: { s: "• 「休眠是什么？」「纠错体系是什么？」", t: "• 「休眠是什麼？」「糾錯體系是什麼？」" },
    fb_q3: { s: "• 「API怎么绑定？」「资金安全吗？」", t: "• 「API怎麼綁定？」「資金安全嗎？」" },
    fb_q4: { s: "• 「新手能用吗？」「怎么暂停交易？」", t: "• 「新手能用嗎？」「怎麼暫停交易？」" },
    fb_tail: { s: "或者点击右上角 📖 打开知识库浏览全部内容，也可以输入「人工」转接人工客服。", t: "或者點擊右上角 📖 打開知識庫瀏覽全部內容，也可以輸入「人工」轉接人工客服。" },
    books_head: { s: "这个问题在投资书籍库里找到了相关解读（《股道》/《股路不归》精选）：", t: "這個問題在投資書籍庫裡找到了相關解讀（《股道》/《股路不歸》精選）：" },
    books_tail: { s: "💡 以上为书籍投资理念摘录，仅作参考。想继续了解某个观点，可以追问具体关键词～", t: "💡 以上為書籍投資理念摘錄，僅作參考。想繼續了解某個觀點，可以追問具體關鍵詞～" }
  };

  // 取当前文字体系下的文案
  function t(key) {
    var item = UI_TEXT[key];
    if (!item) return key;
    return state.script === SCRIPT_TRADITIONAL ? (item.t || item.s) : (item.s || item.t);
  }
  // 取简体基准文案（用于存储原始数据，渲染时再统一转换）
  function u(key) {
    var item = UI_TEXT[key];
    return item ? (item.s || item.t) : key;
  }

  /* ============== 工具函数 ============== */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // 中文分词：按非字母数字汉字切分 + 单字散列
  function tokenize(text) {
    if (!text) return [];
    var cleaned = toSimplified(String(text).toLowerCase()).replace(/[\s,，。.;；?？!！、:：()（）"'`]+/g, " ");
    var tokens = [];
    var buf = "";
    for (var i = 0; i < cleaned.length; i++) {
      var ch = cleaned[i];
      var code = ch.charCodeAt(0);
      var isCJK = code >= 0x4e00 && code <= 0x9fff;
      var isAlnum = /[a-z0-9]/.test(ch);
      if (isAlnum) {
        buf += ch;
      } else {
        if (buf) { tokens.push(buf); buf = ""; }
        if (isCJK) tokens.push(ch);
      }
    }
    if (buf) tokens.push(buf);
    return tokens;
  }

  // 禁语检测（繁体先转简体再匹配）
  function containsBlacklist(text) {
    var lower = toSimplified(String(text).toLowerCase());
    for (var i = 0; i < KB_MATCH.meta.blacklist.length; i++) {
      if (lower.indexOf(toSimplified(KB_MATCH.meta.blacklist[i].toLowerCase())) >= 0) return KB_MATCH.meta.blacklist[i];
    }
    return null;
  }

  // 给输出做合规后缀挂载（前端兜底场景）
  function withSuffix(text) {
    if (!text) return text;
    var suffix = "\n" + t("suffix_label") + KB_MATCH.meta.complianceSuffix;
    if (String(text).indexOf(suffix) >= 0) return text;
    return text + suffix;
  }

  /* ============== 意图匹配引擎（前端兜底，始终基于简体数据） ============== */
  function scoreQA(query, qa) {
    if (!query) return 0;
    var q = toSimplified(String(query).toLowerCase().trim());
    var score = 0;
    if (qa.keywords && qa.keywords.length) {
      for (var i = 0; i < qa.keywords.length; i++) {
        var kw = toSimplified(String(qa.keywords[i]).toLowerCase());
        if (!kw) continue;
        if (q.indexOf(kw) >= 0) {
          score += 2 + Math.min(kw.length, 6) * 0.4;
        }
      }
    }
    var ql = toSimplified(qa.q.toLowerCase());
    if (q.indexOf(ql) >= 0 || ql.indexOf(q) >= 0) score += 5;
    var qTokens = tokenize(q);
    var aTokens = tokenize(qa.q + " " + (qa.keywords || []).join(" "));
    if (qTokens.length && aTokens.length) {
      var setA = {}; qTokens.forEach(function (t) { setA[t] = true; });
      var setB = {}; aTokens.forEach(function (t) { setB[t] = true; });
      var inter = 0, union = 0;
      var all = {};
      qTokens.forEach(function (t) { all[t] = true; });
      aTokens.forEach(function (t) { all[t] = true; });
      union = Object.keys(all).length;
      for (var k in setA) { if (setB[k]) inter++; }
      var jac = union ? inter / union : 0;
      score += jac * 8;
    }
    return score;
  }

  // V2.3 情緒優先引擎：用戶情緒詞 → 優先匹配情緒狀態鏈（es20）與反向題
  var EMOTION_WORDS = {
    fear: ["亏麻","亏惨","睡不","失眠","害怕","恐惧","恐慌","爆仓","亏光","睡不着","怕了","绝望","崩溃","想哭"],
    anxiety: ["焦虑","着急","急死","心慌","坐不住","难受","停不下来","忍不住","烦躁","压力大"],
    greed: ["翻本","翻倍","回本","赚回","一把","梭哈","满仓","重仓","翻盘","快速赚"],
    anger: ["骗子","骗人","割韭菜","傻逼","傻鸟","没用","废物","垃圾","滚","退钱","退款","曝光","投诉","智商税","坑","煞笔","有病","什么破","破軟體","破软件","就是個屁","什么鬼","惡心","恶心"],
    doubt: ["真的吗","靠谱","可信","是不是假","验证","凭什么","忽悠","吹牛","信你"]
  };
  var EMOTION_CATS = {
    fear: "es20", anxiety: "es20", greed: "es20", anger: "es20", doubt: "es20"
  };
  function matchEmotionFirst(query) {
    if (!query) return null;
    var q = toSimplified(String(query).toLowerCase());
    var best = null, bestScore = 0;
    for (var e in EMOTION_WORDS) {
      var hit = 0;
      EMOTION_WORDS[e].forEach(function (w) {
        if (q.indexOf(w) >= 0) hit++;
      });
      if (hit > bestScore) { bestScore = hit; best = e; }
    }
    if (bestScore === 0) return null;
    // 純攻擊詞（垃圾/傻鳥/廢物/騙子…）直接命中衝突場景對應條目，不走相似度
    var ANGER_DIRECT = {
      "垃圾":"你們就是割韭菜！", "傻鳥":"你是個傻鳥！", "廢物":"你是個傻鳥！", "傻逼":"你是個傻鳥！",
      "割韭菜":"你們就是割韭菜！", "騙子":"你們是不是騙人的？", "騙人":"你們是不是騙人的？",
      "智商稅":"你們這就是在收智商稅。", "退錢":"我要退款！", "退款":"我要退款！",
      "曝光":"我要曝光你們！", "滾":"你是個傻鳥！"
    };
    if (best === "anger") {
      for (var aw in ANGER_DIRECT) {
        if (q.indexOf(aw) >= 0) {
          var hitCat = null;
          KB_MATCH.categories.forEach(function (c) {
            if (c.id === "conflict") c.qa.forEach(function (qa) {
              if (qa.q === ANGER_DIRECT[aw]) hitCat = { qa: qa, cat: c, score: 10 };
            });
          });
          if (hitCat) return hitCat;
        }
      }
    }
    // 在情緒狀態鏈(es20) + 衝突場景(conflict) + 攻擊場景中找匹配
    var searchCats = [];
    KB_MATCH.categories.forEach(function (c) {
      if (c.id === "es20" || c.id === "conflict" || c.id === "v22") searchCats.push(c);
    });
    var localBest = null, localScore = 0;
    searchCats.forEach(function (cat) {
      cat.qa.forEach(function (qa) {
        var s = scoreQA(query, qa);
        // 情緒詞加分
        EMOTION_WORDS[best].forEach(function (w) {
          if (toSimplified(qa.q.toLowerCase()).indexOf(w) >= 0) s += 1.5;
        });
        if (s > localScore) { localScore = s; localBest = { qa: qa, cat: cat, score: s }; }
      });
    });
    if (localBest && localScore >= 3) return localBest;
    return null;
  }

  function matchBest(query) {
    var best = null, bestScore = 0;
    KB_MATCH.categories.forEach(function (cat) {
      cat.qa.forEach(function (qa) {
        var s = scoreQA(query, qa);
        // V2.3 上下文狀態：上一輪同分類話題延續時加權（真實對話是連貫的）
        if (state.lastCat && cat.id === state.lastCat) s *= 1.25;
        if (s > bestScore) { bestScore = s; best = { qa: qa, cat: cat, score: s }; }
      });
    });
    if (!best || bestScore < 2.5) return null;
    return best;
  }

  function normalizeBookQuery(text) {
    return toSimplified(String(text || "").toLowerCase())
      .replace(/[\s,，。.;；?？!！、:：()（）"'`“”‘’《》〈〉「」【】…—-]+/g, "");
  }

  function isStrongBookHit(query, hit) {
    if (!query || !hit) return false;
    var q = normalizeBookQuery(query);
    var hq = normalizeBookQuery(hit.q || "");
    if (q && hq && (q.indexOf(hq) >= 0 || hq.indexOf(q) >= 0)) return true;
    return (hit.score || 0) >= 8;
  }

  function replyFromBooks(hits) {
    var h = hits && hits.length ? hits[0] : null;
    if (!h) return;
    var parts = ["这个问题，姐姐会先抓住一个重点。"];
    if (h.a) parts.push(h.a);
    if (h.reflection) parts.push("你也可以先反问自己一句：" + h.reflection);
    parts.push("如果你想，我们还可以顺着这个角度，再往下一层拆开聊。");
    botReply(displayText(parts.join("\n\n")), { delay: 900, quick: ["什么是化繁为简？", "庄家是怎么操作的？", "散户怎样才能不亏损？"] });
  }

  function detectTier(text) {
    var t = toSimplified(String(text || "").toLowerCase());
    var best = null, bestHit = 0;
    KB_MATCH.meta.userTiers.forEach(function (tier) {
      var hit = 0;
      tier.keywords.forEach(function (kw) {
        if (t.indexOf(toSimplified(String(kw).toLowerCase())) >= 0) hit++;
      });
      if (hit > bestHit) { bestHit = hit; best = tier; }
    });
    return bestHit > 0 ? best : null;
  }

  /* ============== 后端 LLM 服务 ============== */
  function checkLLMStatus() {
    fetch(API_BASE + "/status", { method: "GET", cache: "no-store" })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        llmEnabled = !!data.enabled;
        llmChecked = true;
        updateStatusText();
      })
      .catch(function () {
        llmEnabled = false;
        llmChecked = true;
        updateStatusText();
      });
  }

  function updateStatusText() {
    var el = $("#dc-header .dc-hd-status");
    if (!el) return;
    if (llmEnabled) {
      el.textContent = t("status_llm");
    } else {
      el.textContent = t("status_local");
    }
  }

  function buildHistoryForAPI() {
    // 后端只需要最近 user/assistant 对话；排除 system/welcome 等自定义类型
    // 统一转简体发送，保证后端意图/话题识别的关键词匹配不受文字体系影响
    return state.history
      .filter(function (h) { return h.role === "user" || h.role === "assistant" || h.role === "bot"; })
      .map(function (h) {
        return {
          role: h.role === "bot" ? "assistant" : h.role,
          content: toSimplified(h.text)
        };
      })
      .slice(-12); // 保留最近 12 条（约 6 轮）
  }

  // ── V3.5 直連 DeepSeek（混合模式：本地檢索＋可選 AI 增強）──
  var DS_KEY = "";            // localStorage 中的 DeepSeek key
  var DS_ENABLED = false;     // AI 模式是否開啟
  var dsRateLimit = { count: 0, windowStart: 0 };  // 限頻：每分鐘最多 N 次
  var DS_RATE_MAX = 10;       // 每分鐘上限（防盜刷）

  function loadDSConfig() {
    try {
      DS_KEY = localStorage.getItem('ds_key') || '';
      DS_ENABLED = localStorage.getItem('ds_enabled') === '1';
    } catch (e) { DS_KEY = ''; DS_ENABLED = false; }
  }

  function dsRateOk() {
    var now = Date.now();
    if (now - dsRateLimit.windowStart > 60000) {
      dsRateLimit = { count: 0, windowStart: now };
    }
    if (dsRateLimit.count >= DS_RATE_MAX) return false;
    dsRateLimit.count++;
    return true;
  }

  // V3 認知引擎 system prompt（濃縮 334 題知識庫的核心認知）
  function buildDSPrompt() {
    return "你是「DC姐姐」，DCOGAI自動化交易執行工具（加密貨幣/金融自動化交易）的產品顧問。\n" +
      "【人設】像深夜陪朋友聊天的交易老兵：不卑不亢、不賣弄、不跪舔、不機械。語氣短促、直接、口語化，繁體優先（用戶用簡體就跟簡體）。\n" +
      "【回答原則】①先接住情緒再講道理 ②一個回答只推進一個認知，不一次講完 ③操作/價格問題直接準確答，不講哲學 ④認知問題講透一層、留一個自然的下一層 ⑤用戶質疑先承認「你懷疑有道理」再拆 ⑥用戶罵人不轉人工、正面接住 ⑦不重複貼合規（被問到風險才說一次）⑧產品是認知的結果，不是起點——先拆認知再自然落產品。\n" +
      "【核心認知（V3.0 節點）】工具不是幫人預測漲跌，而是把執行/糾錯/風控交給系統，解決「知道卻做不到」；等待也是交易，不交易也是決策；翻本心理本身就是風險，越急著拿回越容易拿剩下的冒險；順風時最危險，人最危險的時候是覺得自己不會虧的時候；止損是停止犯錯不是認輸；連續虧損要停、降低攻擊性；系統會錯但錯了能活——判斷錯了以後還能繼續活才是核心；錯過≠虧損，追高才是風險。\n" +
      "【產品事實】全年授權29800U/年；12個月免費試用全功能無閹割；支持OKX；有休眠（行情無價值時不交易）/糾錯（錯誤擴大前處理）/分水嶺多級風控體系；不保證盈利、不提供投資建議；7×24人工客服（Telegram: t.me/DCOGAI877 / t.me/DCOGAI888）。\n" +
      "【語言風格】少說「這是因為」，多說「你有沒有發現」；少說「正確的做法是」，多說「姐姐反而想問你一句」；少說「風險很大請謹慎」，多說「真正需要問的，不是能不能賺，而是錯了以後你還能不能承受」。";
  }

  function callDeepSeekDirect(query, onSuccess, onError) {
    if (!DS_KEY || !DS_ENABLED) { onError(); return; }
    if (!dsRateOk()) {
      // 限頻：降級本地
      onError();
      return;
    }
    var sys = buildDSPrompt();
    var hist = [];
    try {
      var h = state.history || [];
      for (var i = Math.max(0, h.length - 6); i < h.length; i++) {
        if (h[i] && h[i].text) hist.push({ role: h[i].role === "bot" ? "assistant" : "user", content: String(h[i].text).slice(0, 500) });
      }
    } catch (e) {}
    fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + DS_KEY },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        messages: [{ role: "system", content: sys }].concat(hist).concat([{ role: "user", content: query }]),
        max_tokens: 400,
        temperature: 0.7
      }),
      cache: "no-store"
    })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        var reply = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (reply) onSuccess(reply);
        else throw new Error("empty");
      })
      .catch(function (e) { onError(e); });
  }

  // AI 設置面板：輸入 DeepSeek key + 開啟 AI 模式
  function openAISettings() {
    if (document.getElementById("dc-ai-modal")) { document.getElementById("dc-ai-modal").remove(); return; }
    loadDSConfig();
    var modal = document.createElement("div");
    modal.id = "dc-ai-modal";
    modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:999;display:flex;align-items:center;justify-content:center;";
    var isTrad = state.script === SCRIPT_TRADITIONAL;
    modal.innerHTML =
      '<div style="background:#1c1c22;color:#eee;border:1px solid #333;border-radius:12px;padding:22px;width:320px;max-width:90%;">' +
      '<h3 style="margin:0 0 12px;font-size:16px;">' + (isTrad ? 'AI 模式（DeepSeek）' : 'AI 模式（DeepSeek）') + '</h3>' +
      '<p style="font-size:12px;color:#999;margin:0 0 10px;">' + (isTrad ? '開啟後由 DeepSeek AI 回答（需 API key）。key 只存本機瀏覽器。' : '开启后由 DeepSeek AI 回答（需 API key）。key 只存本机浏览器。') + '</p>' +
      '<input id="dc-ai-key" type="password" placeholder="sk-..." value="" style="width:100%;padding:9px;margin-bottom:10px;border-radius:6px;border:1px solid #444;background:#111;color:#eee;font-size:13px;box-sizing:border-box;">' +
      '<label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:14px;cursor:pointer;">' +
      '<input id="dc-ai-on" type="checkbox" ' + (DS_ENABLED ? 'checked' : '') + '> ' + (isTrad ? '開啟 AI 回答' : '开启 AI 回答') + '</label>' +
      '<div style="display:flex;gap:8px;">' +
      '<button id="dc-ai-save" style="flex:1;padding:9px;border-radius:6px;border:none;background:#00c853;color:#000;font-weight:bold;cursor:pointer;">' + (isTrad ? '儲存' : '保存') + '</button>' +
      '<button id="dc-ai-close" style="flex:1;padding:9px;border-radius:6px;border:1px solid #444;background:transparent;color:#ccc;cursor:pointer;">' + (isTrad ? '關閉' : '关闭') + '</button>' +
      '</div></div>';
    document.body.appendChild(modal);
    document.getElementById("dc-ai-key").value = DS_KEY;
    document.getElementById("dc-ai-save").addEventListener("click", function () {
      var k = document.getElementById("dc-ai-key").value.trim();
      var on = document.getElementById("dc-ai-on").checked;
      try {
        localStorage.setItem("ds_key", k);
        localStorage.setItem("ds_enabled", on ? "1" : "0");
      } catch (e) {}
      DS_KEY = k; DS_ENABLED = on;
      modal.remove();
      var statusEl = document.querySelector("#dc-header .dc-hd-status");
      if (statusEl && on && k) statusEl.textContent = isTrad ? "AI 模式 · DeepSeek" : "AI 模式 · DeepSeek";
    });
    document.getElementById("dc-ai-close").addEventListener("click", function () { modal.remove(); });
  }

  function callLLM(query, onSuccess, onError, deep) {
    var payload = {
      message: query,
      history: buildHistoryForAPI(),
      script: state.script // 繁简体自适应：告知后端回复所用文字体系
    };
    // 深入了解模式：后端生成不受字数限制的详尽解读
    if (deep) payload.deep = true;
    fetch(API_BASE + "/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store"
    })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (data && data.reply) {
          onSuccess(data.reply, data.source || "llm", data.matched_items || []);
        } else {
          throw new Error("empty reply");
        }
      })
      .catch(function (err) {
        onError(err);
      });
  }

  /* ============== UI 渲染 ============== */
  var state = {
    opened: false,
    welcomed: false,
    tierDetected: null,
    lastCat: null,  // V2.3 上下文：上一輪命中分類
    kbOpen: false,
    kbActiveCat: null,
    kbKeyword: "",
    typing: false,
    history: [], // {role, text}
    script: SCRIPT_SIMPLIFIED,   // 当前界面文字体系
    tradKB: null,                // 繁体版知识库缓存（避免重复拉取/转换）
    quick: [],                   // 当前快捷提问原始项（简体基准）
    welcomeEl: null,             // 欢迎语气泡元素
    welcomeRaw: ""               // 欢迎语简体原文
  };

  // 应用数据国际化：刷新所有带 data-i18n 标记的元素
  function applyI18n() {
    $all("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (key === "script_toggle") {
        el.textContent = state.script === SCRIPT_TRADITIONAL ? "简" : "繁";
      } else {
        el.textContent = t(key);
      }
    });
    $all("[data-i18n-ph]").forEach(function (el) {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-ph")));
    });
    $all("[data-i18n-title]").forEach(function (el) {
      el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
    });
    $all("[data-i18n-aria]").forEach(function (el) {
      el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria")));
    });
  }

  // 把简体知识库深拷贝并转换为目标文字体系（静态托管/后端不可用时的兜底）
  function convertKBToScript(kb, script) {
    var conv = function (s) {
      return script === SCRIPT_TRADITIONAL ? toTraditional(s) : toSimplified(s);
    };
    var out = { meta: {}, welcome: {}, categories: [], closing: {} };
    if (!kb) return out;
    out.meta = {
      brand: kb.meta.brand,
      assistantName: conv(kb.meta.assistantName),
      assistantRole: conv(kb.meta.assistantRole),
      complianceSuffix: conv(kb.meta.complianceSuffix),
      blacklist: kb.meta.blacklist || [],
      slogans: (kb.meta.slogans || []).map(conv),
      userTiers: (kb.meta.userTiers || []).map(function (tier) {
        return { id: tier.id, label: conv(tier.label), keywords: tier.keywords || [] };
      }),
      humanContact: {
        telegram: (kb.meta.humanContact && kb.meta.humanContact.telegram) || [],
        serviceWindow: conv((kb.meta.humanContact && kb.meta.humanContact.serviceWindow) || "")
      }
    };
    out.welcome = { general: conv(kb.welcome.general || ""), byTier: {} };
    if (kb.welcome && kb.welcome.byTier) {
      for (var k in kb.welcome.byTier) out.welcome.byTier[k] = conv(kb.welcome.byTier[k]);
    }
    if (kb.closing) {
      for (var ck in kb.closing) {
        var cv = kb.closing[ck];
        out.closing[ck] = typeof cv === "string" ? conv(cv) : cv;
      }
    }
    out.categories = (kb.categories || []).map(function (cat) {
      return {
        id: cat.id,
        name: conv(cat.name),
        icon: cat.icon,
        description: conv(cat.description || ""),
        qa: (cat.qa || []).map(function (qa) {
          return { id: qa.id, q: conv(qa.q), a: conv(qa.a), keywords: qa.keywords || [] };
        })
      };
    });
    return out;
  }

  function fetchJSON(url) {
    return fetch(url, { method: "GET", cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      });
  }

  // 应用后台知识库数据（欢迎语 / meta / 分类），字段缺失时保留本地兜底值
  function applyRemoteKB(remote) {
    if (!remote || !remote.welcome || !remote.meta) return;
    var simpKB = {
      meta: remote.meta || KB_MATCH.meta,
      welcome: {
        general: remote.welcome.general || KB_MATCH.welcome.general,
        byTier: remote.welcome.byTier || KB_MATCH.welcome.byTier
      },
      categories: remote.categories && remote.categories.length ? remote.categories : KB_MATCH.categories,
      closing: remote.closing || KB_MATCH.closing
    };
    KB_MATCH = simpKB; // 匹配数据始终简体
    KB = simpKB;       // 展示数据先按简体，繁体时由 loadDisplayKB 异步替换
  }

  // 从后端拉取知识库配置（含后台可配置的欢迎语 / meta / 分类）
  // 优先级：同源 API → 同目录 kb-data.json（适配纯静态服务托管页面）→ 本地 kb-data.js
  function loadRemoteKB() {
    return fetchJSON(API_BASE + "/kb")
      .then(applyRemoteKB)
      .catch(function () {
        // 同源 API 不可用时（页面由静态服务器提供），直接读后台写入的同目录 JSON
        return fetchJSON((window.PREFIX || "") + "dc-sister/kb-data.json")
          .then(applyRemoteKB)
          .catch(function () {
            // 均不可用时保持本地知识库
          });
      });
  }

  // 加载当前文字体系对应的展示知识库
  // - 简体：直接用 KB_MATCH
  // - 繁体：优先请求后端转换版（OpenCC 高质量），失败时用 JS 映射兜底转换
  function loadDisplayKB(cb) {
    if (state.script === SCRIPT_SIMPLIFIED) {
      KB = KB_MATCH;
      if (cb) cb();
      return;
    }
    if (state.tradKB) {
      KB = state.tradKB;
      if (cb) cb();
      return;
    }
    fetchJSON(API_BASE + "/kb?script=traditional")
      .then(function (remote) {
        if (remote && remote.welcome && remote.meta) {
          state.tradKB = {
            meta: remote.meta,
            welcome: remote.welcome,
            categories: remote.categories && remote.categories.length ? remote.categories : KB_MATCH.categories,
            closing: remote.closing || KB_MATCH.closing
          };
        } else {
          state.tradKB = convertKBToScript(KB_MATCH, SCRIPT_TRADITIONAL);
        }
        KB = state.tradKB;
        if (cb) cb();
      })
      .catch(function () {
        state.tradKB = convertKBToScript(KB_MATCH, SCRIPT_TRADITIONAL);
        KB = state.tradKB;
        if (cb) cb();
      });
  }

  // 实时切换文字体系：更新 UI 文案、展示知识库、快捷提问与欢迎语
  function applyScript(script) {
    if (script === state.script) return;
    state.script = script;
    applyI18n();
    loadDisplayKB(function () {
      if (state.kbOpen) { renderKBIndex(); renderKBList(); }
    });
    rerenderQuickAndWelcome();
    updateStatusText();
  }

  function rerenderQuickAndWelcome() {
    if (state.quick && state.quick.length) renderQuick(state.quick);
    if (state.welcomeEl && state.welcomeRaw) {
      var bubble = $(".dc-msg-bubble", state.welcomeEl);
      if (bubble) {
        var text = displayText(state.welcomeRaw);
        bubble.innerHTML = escapeHtml(text);
        var suffixFull = displayText(KB_MATCH.meta.complianceSuffix);
        if (String(text).indexOf(KB_MATCH.meta.complianceSuffix) < 0) {
          bubble.innerHTML += escapeHtml("\n" + t("suffix_label") + suffixFull);
        }
      }
    }
  }

  function buildLauncher() {
    var el = document.createElement("div");
    el.id = "dc-launcher";
    el.setAttribute("role", "button");
    el.setAttribute("data-i18n-aria", "launcher_aria");
    el.tabIndex = 0;
    el.innerHTML =
      '<div class="dc-avatar"><span class="dc-avatar-text">DC</span></div>' +
      '<span class="dc-online"></span>' +
      '<span class="dc-badge">1</span>' +
      '<div class="dc-hint" data-i18n="launcher_hint">有问题随时问我，DC姐姐在线 👋</div>';
    el.addEventListener("click", openPanel);
    el.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPanel(); }
    });
    document.body.appendChild(el);
    setTimeout(function () {
      if (!state.opened) el.classList.add("hint-show");
    }, 4000);
    setTimeout(function () {
      el.classList.remove("hint-show");
    }, 12000);
  }

  function buildPanel() {
    var el = document.createElement("div");
    el.id = "dc-panel";
    el.innerHTML =
      '<div id="dc-shell">' +
        '<header id="dc-header">' +
          '<div class="dc-hd-avatar">DC<span class="dc-hd-online"></span></div>' +
          '<div class="dc-hd-info">' +
            '<div class="dc-hd-name" data-i18n="header_name">DC姐姐 · 产品顾问</div>' +
            '<div class="dc-hd-status" data-i18n="status_initial">在线 · 平均 3 秒响应</div>' +
          '</div>' +
          '<div class="dc-hd-actions">' +
            '<button class="dc-hd-btn dc-script-toggle" data-i18n-title="btn_script" data-i18n-aria="btn_script">' +
              '<span data-i18n="script_toggle">繁</span></button>' +
            '<button class="dc-hd-btn dc-ai-toggle" title="AI 模式" aria-label="AI 模式">' +
              '<iconify-icon icon="mdi:robot-outline"></iconify-icon></button>' +
            '<button class="dc-hd-btn dc-kb-toggle" data-i18n-title="btn_kb" data-i18n-aria="btn_kb_aria">' +
              '<iconify-icon icon="mdi:book-open-variant"></iconify-icon></button>' +
            '<button class="dc-hd-btn dc-restart" data-i18n-title="btn_restart" data-i18n-aria="btn_restart">' +
              '<iconify-icon icon="mdi:restart"></iconify-icon></button>' +
            '<button class="dc-hd-btn dc-close" data-i18n-title="btn_close" data-i18n-aria="btn_close">' +
              '<iconify-icon icon="mdi:close"></iconify-icon></button>' +
          '</div>' +
        '</header>' +
        '<div id="dc-body">' +
          '<div id="dc-chat">' +
            '<div id="dc-messages"></div>' +
            '<div id="dc-quick"></div>' +
            '<div id="dc-input-wrap">' +
              '<textarea id="dc-input" rows="1" data-i18n-ph="input_placeholder" data-i18n-aria="input_aria" placeholder="输入你的问题，例如：怎么收费？API怎么绑定？…" aria-label="输入消息"></textarea>' +
              '<button id="dc-send" data-i18n-aria="send_aria" aria-label="发送">' +
                '<iconify-icon icon="mdi:send"></iconify-icon></button>' +
            '</div>' +
          '</div>' +
          '<aside id="dc-kb">' +
            '<div class="dc-kb-head">' +
              '<div class="dc-kb-title">' +
                '<iconify-icon icon="mdi:book-open-variant"></iconify-icon>' +
                '<span data-i18n="kb_title">客服知识库</span></div>' +
              '<div class="dc-kb-search">' +
                '<iconify-icon icon="mdi:magnify"></iconify-icon>' +
                '<input type="text" id="dc-kb-input" data-i18n-ph="kb_search_ph" data-i18n-aria="kb_search_ph" placeholder="搜索关键词，例如：收费 / API / 休眠…" aria-label="搜索知识库">' +
              '</div>' +
            '</div>' +
            '<div class="dc-kb-index" id="dc-kb-index"></div>' +
            '<div class="dc-kb-list" id="dc-kb-list"></div>' +
          '</aside>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);

    $(".dc-close", el).addEventListener("click", closePanel);
    $(".dc-ai-toggle", el).addEventListener("click", openAISettings);
    $(".dc-restart", el).addEventListener("click", restart);
    $(".dc-kb-toggle", el).addEventListener("click", toggleKB);
    $(".dc-script-toggle", el).addEventListener("click", function () {
      applyScript(state.script === SCRIPT_TRADITIONAL ? SCRIPT_SIMPLIFIED : SCRIPT_TRADITIONAL);
    });
    $("#dc-send", el).addEventListener("click", onSend);
    var input = $("#dc-input", el);
    var scriptDebounce = null;
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    });
    input.addEventListener("input", function () {
      autoGrow(input);
      var sendBtn = $("#dc-send");
      if (input.value.trim()) sendBtn.removeAttribute("disabled");
      else sendBtn.setAttribute("disabled", "disabled");
      // 输入过程中实时检测文字体系并无缝切换
      clearTimeout(scriptDebounce);
      scriptDebounce = setTimeout(function () {
        var detected = detectScript(input.value);
        if (detected !== state.script) applyScript(detected);
      }, 300);
    });
    el.addEventListener("click", function (e) {
      if (e.target === el) closePanel();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && state.opened) closePanel();
    });
    $("#dc-kb-input").addEventListener("input", function (e) {
      state.kbKeyword = e.target.value.trim();
      renderKBList();
    });
    $("#dc-send").setAttribute("disabled", "disabled");
  }

  function autoGrow(el) {
    el.style.height = "auto";
    el.style.height = Math.min(100, el.scrollHeight) + "px";
  }

  function openPanel() {
    if (state.opened) return;
    state.opened = true;
    var panel = $("#dc-panel");
    panel.classList.add("show");
    setTimeout(function () { panel.classList.add("mask-show"); }, 10);
    var launcher = $("#dc-launcher");
    launcher.classList.remove("hint-show");
    $(".dc-badge", launcher).classList.remove("show");

    if (!state.welcomed) {
      state.welcomed = true;
      setTimeout(function () { sendWelcome(); }, 320);
    }
    setTimeout(function () { $("#dc-input").focus(); }, 380);
  }

  function closePanel() {
    if (!state.opened) return;
    state.opened = false;
    var panel = $("#dc-panel");
    panel.classList.remove("mask-show");
    setTimeout(function () { panel.classList.remove("show"); }, 280);
  }

  function restart() {
    state.welcomed = true;
    state.tierDetected = null;
    state.history = [];
    state.quick = [];
    state.welcomeEl = null;
    state.welcomeRaw = "";
    $("#dc-messages").innerHTML = "";
    $("#dc-quick").innerHTML = "";
    sendWelcome();
  }

  /* ============== 消息渲染 ============== */
  function appendMessage(role, text, opts) {
    opts = opts || {};
    var messages = $("#dc-messages");
    var div = document.createElement("div");
    div.className = "dc-msg " + (role === "user" ? "user" : "bot");

    var avatar = document.createElement("div");
    avatar.className = "dc-msg-avatar";
    avatar.textContent = role === "user" ? t("avatar_me") : "DC";

    var bubble = document.createElement("div");
    bubble.className = "dc-msg-bubble";

    // 深入了解 · 详细解读 标签（二次响应消息顶部）
    if (role === "bot" && opts.deepReply) {
      var tag = document.createElement("span");
      tag.className = "dc-deep-tag";
      tag.innerHTML = '<iconify-icon icon="mdi:compass-outline"></iconify-icon>' + t("deep_tag");
      bubble.appendChild(tag);
    }

    var html = escapeHtml(text);

    // 机器人消息统一挂载合规后缀（若后端未带则前端补）
    if (role === "bot" && opts.suffix !== false) {
      var sep = "\n" + t("suffix_label") + KB.meta.complianceSuffix;
      if (String(text).indexOf(sep) < 0 && String(text).indexOf(KB.meta.complianceSuffix) < 0) {
        html = escapeHtml(text + sep);
      }
    }
    bubble.innerHTML += html;
    // 链接化 Telegram 联系方式
    bubble.innerHTML = bubble.innerHTML
      .replace(/https:\/\/t\.me\/(DCOGAI\d+)/g, '<a href="https://t.me/$1" target="_blank" style="color:#1a237e;text-decoration:underline;">https://t.me/$1</a>')
      .replace(/(@DCOGAI\d+)/g, '<a href="https://t.me/$1" target="_blank" style="color:#1a237e;text-decoration:underline;">$1</a>');

    // 深入了解按钮（挂载在简洁回答下方，携带原始提问）
    if (role === "bot" && opts.deepBtn) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dc-deep-btn";
      btn.innerHTML = '<iconify-icon icon="mdi:arrow-down-bold-circle-outline"></iconify-icon>' + t("deep_btn");
      btn.addEventListener("click", function () {
        handleDeepDive(btn, opts.deepBtn);
      });
      bubble.appendChild(btn);
    }

    div.appendChild(avatar);
    div.appendChild(bubble);
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;

    state.history.push({ role: role, text: text });
    if (opts.onAppend) opts.onAppend(div);
    return div;
  }

  function appendTyping() {
    var messages = $("#dc-messages");
    var div = document.createElement("div");
    div.className = "dc-msg bot";
    div.id = "dc-typing-msg";
    div.innerHTML =
      '<div class="dc-msg-avatar">DC</div>' +
      '<div class="dc-msg-bubble"><div class="dc-typing"><span></span><span></span><span></span></div></div>';
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    state.typing = true;
  }
  function removeTyping() {
    var t = $("#dc-typing-msg");
    if (t) t.parentNode.removeChild(t);
    state.typing = false;
  }

  function botReply(text, opts) {
    opts = opts || {};
    appendTyping();
    var delay = opts.delay || (Math.min(1800, 500 + text.length * 8));
    setTimeout(function () {
      removeTyping();
      appendMessage("bot", text, opts);
      if (opts.quick) renderQuick(opts.quick);
    }, delay);
  }

  /* ============== 欢迎语 ============== */
  function sendWelcome() {
    state.welcomeRaw = KB_MATCH.welcome.general || KB.welcome.general;
    state.quick = [u("q_price"), u("q_diff"), u("q_api"), u("q_newbie"), u("q_human")];
    botReply(displayText(state.welcomeRaw), {
      delay: 420,
      quick: state.quick.slice(),
      onAppend: function (el) { state.welcomeEl = el; }
    });
  }

  /* ============== 快捷提问 ============== */
  function renderQuick(items) {
    var box = $("#dc-quick");
    box.innerHTML = "";
    if (!items || !items.length) return;
    state.quick = items.slice();
    items.forEach(function (it) {
      var chip = document.createElement("button");
      chip.className = "dc-chip";
      chip.textContent = displayText(it);
      chip.addEventListener("click", function () {
        $("#dc-input").value = it;
        $("#dc-input").focus();
        onSend();
      });
      box.appendChild(chip);
    });
  }

  /* ============== 发送 / 响应 ============== */
  function onSend() {
    var input = $("#dc-input");
    var text = (input.value || "").trim();
    if (!text) return;
    // 实时检测：用户输入文字体系变化时，无缝切换整个界面
    var detected = detectScript(text);
    if (detected !== state.script) applyScript(detected);
    appendMessage("user", text, { suffix: false });
    input.value = "";
    autoGrow(input);
    $("#dc-send").setAttribute("disabled", "disabled");
    $("#dc-quick").innerHTML = "";

    handleUserMessage(text);
  }

  function handleUserMessage(text) {
    var lower = toSimplified(text.toLowerCase());

    // 0) AI 模式開啟時，直接走 LLM（情緒層/本地匹配都讓位）
    loadDSConfig();
    if (DS_ENABLED && DS_KEY && !llmEnabled) {
      appendTyping();
      callDeepSeekDirect(text,
        function (reply) {
          removeTyping();
          appendMessage("bot", reply, { suffix: false, deepBtn: text });
          renderQuick([u("q_price"), u("q_diff"), u("q_api")]);
        },
        function () {
          removeTyping();
          // DeepSeek 失敗才降級到本地完整流程
          localFallbackPath(text);
        }
      );
      return;
    }

    // 0) 情緒優先層（V2.3 意圖引擎）：先跑知識庫強匹配，強命中優先；情緒只在弱匹配/未命中時接管
    var preMatch = matchBest(text);
    var emotionHit = (!preMatch || preMatch.score < 4) ? matchEmotionFirst(text) : null;
    if (emotionHit) {
      botReply(displayText(emotionHit.qa.a), { delay: 500 + emotionHit.qa.a.length * 4, quick: suggestFollowups(emotionHit), deepBtn: text });
      highlightKBItem(emotionHit.cat.id, emotionHit.qa.id);
      state.lastCat = emotionHit.cat.id;
      return;
    }

    // 1) 转人工：直接本地回复（繁体输入也会被转简体后匹配）
    if (/找人工|转人工|轉人工|人工客服|真人客服|联系人工|聯繫人工|人工对接|人工對接|人工服务|人工服務|人工(技术|技術)?(客服|服務)|telegram|电报|電報|人工电话|人工電話/.test(lower)) {
      botReply(
        t("human_intro") + "\n" +
        "• Telegram：" + KB_MATCH.meta.humanContact.telegram.join("  /  ") + "\n" +
        t("human_scope") + "\n" +
        t("human_remote") + "\n" +
        t("human_tip"),
        { delay: 600, quick: [u("q_price"), u("q_api"), u("q_newbie")] }
      );
      return;
    }

    // 2) 先尝试本地知识库匹配；命中则优先按知识库回复（覆盖黑名单硬拦截）
    var localMatch = matchBest(text);
    if (localMatch) {
      botReply(displayText(localMatch.qa.a), { delay: 500 + localMatch.qa.a.length * 4, quick: suggestFollowups(localMatch), deepBtn: text });
      highlightKBItem(localMatch.cat.id, localMatch.qa.id);
      state.lastCat = localMatch.cat.id;
      return;
    }

    // 3) 禁语黑名单触发：直接本地拒绝
    var bl = containsBlacklist(text);
    if (bl) {
      botReply(
        t("bl_start").replace("{w}", displayText(bl)) + "\n" +
        t("bl_mid1") + "\n" +
        t("bl_mid2") + "\n" +
        t("bl_end"),
        { delay: 700, quick: ["核心功能是什么？", "怎么收费？", "新手能用吗？"] }
      );
      return;
    }

    // 4) 用户分层识别（首次识别后记忆）
    if (!state.tierDetected) {
      var tier = detectTier(text);
      if (tier) {
        state.tierDetected = tier;
        botReply(
          KB.welcome.byTier[tier.id],
          {
            delay: 800,
            quick: ["怎么收费？", "核心功能是什么？", "API怎么绑定？"]
          }
        );
        return;
      }
    }

    // 4) 官方後端 LLM（DCOGAI 伺服器，僅後台登入環境可用）
    if (llmEnabled) {
      appendTyping();
      callLLM(text,
        function (reply, source, matchedItems) {
          removeTyping();
          appendMessage("bot", reply, { suffix: false, deepBtn: text });
          renderQuick(suggestFollowupsByQuery(text, matchedItems));
          if (matchedItems && matchedItems.length) highlightKBItemById(matchedItems[0].id);
        },
        function () {
          removeTyping();
          localFallback(text);
        }
      );
      return;
    }

    // 5) LLM 未启用：前端本地匹配兜底
    localFallback(text);
  }

  function localFallbackPath(text) { localFallback(text); }

  function localFallback(text) {
    var match = matchBest(text);
    var replyKB = function () {
      if (!match) return false;
      botReply(displayText(match.qa.a), { delay: 500 + match.qa.a.length * 4, quick: suggestFollowups(match), deepBtn: text });
      highlightKBItem(match.cat.id, match.qa.id);
      return true;
    };

    // 本地书籍知识库兜底（V2.3：僅書籍強命中或 KB 完全無匹配時用；弱命中走意圖澄清，避免答非所問）
    if (match && match.score >= 4) { if (replyKB()) return; }
    if (window.DCSisterBooks) {
      window.DCSisterBooks.load(function () {
        var hits = window.DCSisterBooks.search(text, 2);
        if (hits && hits.length) {
          var bookStrong = isStrongBookHit(text, hits[0]);
          if (bookStrong) { replyFromBooks(hits); return; }
        }
        if (match) { if (replyKB()) return; }
        defaultFallback(text);
      });
      return;
    }
    if (match) { if (replyKB()) return; }
    defaultFallback(text);
  }

  function defaultFallback(text) {
    // V2.3 優雅兜底：意圖澄清，不機械說「沒有匹配」
    var clarify = state.script === SCRIPT_TRADITIONAL
      ? "你問的這個問題，姐姐想先確認一下：你更關心的是它怎麼用，還是它到底值不值得用？\n\n告訴姐姐一句，我們就從那裏聊起。"
      : "你问的这个问题，姐姐想先确认一下：你更关心的是它怎么用，还是它到底值不值得用？\n\n告诉姐姐一句，我们就从那里聊起。";
    botReply(
      clarify,
      { delay: 700, quick: ["怎么收费？", "休眠是什么？", "API怎么绑定？", "你们是不是割韭菜"] }
    );
  }

  /* ============== 深入了解（二次响应） ============== */
  // 用户点击简洁回答下方的「深入了解」按钮，触发详尽解读
  function handleDeepDive(btn, query) {
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    btn.innerHTML = '<iconify-icon icon="mdi:loading" style="animation:dc-spin 1s linear infinite;"></iconify-icon>' + t("deep_loading");
    appendTyping();

    callLLM(query,
      function (reply, source, matchedItems) {
        removeTyping();
        appendMessage("bot", reply, { suffix: false, deepReply: true }); // 后端已带合规后缀
        btn.innerHTML = '<iconify-icon icon="mdi:check-bold"></iconify-icon>' + t("deep_done");
        if (matchedItems && matchedItems.length) {
          highlightKBItemById(matchedItems[0].id);
        }
      },
      function () {
        removeTyping();
        // 二次响应失败：回退到本地知识库的完整答案
        var m = matchBest(query);
        if (m) {
          appendMessage("bot", displayText(m.qa.a), { suffix: true, deepReply: true });
          btn.innerHTML = '<iconify-icon icon="mdi:check-bold"></iconify-icon>' + t("deep_done");
          highlightKBItem(m.cat.id, m.qa.id);
        } else {
          btn.disabled = false;
          btn.innerHTML = '<iconify-icon icon="mdi:arrow-down-bold-circle-outline"></iconify-icon>' + t("deep_btn");
          appendMessage("bot", t("deep_err"), { suffix: true });
        }
      },
      true // deep 模式
    );
  }

  function suggestFollowups(match) {
    // V2.1 連續對話：條目帶 next 欄位（下一句高概率）時，快捷按鈕精確指向下一句
    if (match.qa && match.qa.next) {
      return [match.qa.next];
    }
    var pool = [];
    match.cat.qa.forEach(function (qa) {
      if (qa.id !== match.qa.id) pool.push(qa.q);
    });
    if (match.cat.id !== "pricing") pool.push(u("q_price"));
    if (match.cat.id !== "support") pool.push(u("q_human"));
    var seen = {}; var out = [];
    pool.forEach(function (q) {
      if (!seen[q] && out.length < 4) { seen[q] = true; out.push(q); }
    });
    return out;
  }

  function suggestFollowupsByQuery(query, matchedItems) {
    var pool = [];
    // 根据后端返回的匹配项取同分类追问（始终基于简体数据，渲染时统一转换）
    if (matchedItems && matchedItems.length) {
      var firstId = matchedItems[0].id;
      KB_MATCH.categories.forEach(function (cat) {
        cat.qa.forEach(function (qa) {
          if (qa.id === firstId) {
            cat.qa.forEach(function (q) {
              if (q.id !== qa.id) pool.push(q.q);
            });
          }
        });
      });
    }
    // 兜底热门问题
    if (!pool.length) {
      pool = [u("q_price"), "休眠是什么？", "API怎么绑定？"];
    }
    if (!/人工|客服/.test(query)) pool.push(u("q_human"));
    var seen = {}; var out = [];
    pool.forEach(function (q) {
      if (!seen[q] && out.length < 4) { seen[q] = true; out.push(q); }
    });
    return out;
  }

  function highlightKBItemById(qaId) {
    var found = null, catId = null;
    KB.categories.forEach(function (cat) {
      cat.qa.forEach(function (qa) {
        if (qa.id === qaId) { found = qa; catId = cat.id; }
      });
    });
    if (found) highlightKBItem(catId, qaId);
  }

  /* ============== 知识库浏览（展示用知识库，跟随当前文字体系） ============== */
  function toggleKB() {
    state.kbOpen = !state.kbOpen;
    var kb = $("#dc-kb");
    var btn = $(".dc-kb-toggle");
    if (state.kbOpen) {
      kb.classList.add("show");
      btn.classList.add("active");
      if (!state.kbActiveCat) state.kbActiveCat = KB.categories[0].id;
      renderKBIndex();
      renderKBList();
    } else {
      kb.classList.remove("show");
      btn.classList.remove("active");
    }
  }

  function renderKBIndex() {
    var box = $("#dc-kb-index");
    box.innerHTML = "";
    var allChip = document.createElement("button");
    allChip.className = "dc-idx-chip" + (!state.kbActiveCat ? " active" : "");
    allChip.innerHTML = '<iconify-icon icon="mdi:all-inclusive"></iconify-icon> ' + t("kb_all") + ' <span class="dc-idx-count">' + totalQA() + "</span>";
    allChip.addEventListener("click", function () {
      state.kbActiveCat = null;
      renderKBIndex();
      renderKBList();
    });
    box.appendChild(allChip);
    KB.categories.forEach(function (cat) {
      var chip = document.createElement("button");
      chip.className = "dc-idx-chip" + (state.kbActiveCat === cat.id ? " active" : "");
      chip.innerHTML = '<iconify-icon icon="' + cat.icon + '"></iconify-icon> ' + escapeHtml(cat.name) +
        ' <span class="dc-idx-count">' + cat.qa.length + "</span>";
      chip.addEventListener("click", function () {
        state.kbActiveCat = cat.id;
        state.kbKeyword = "";
        $("#dc-kb-input").value = "";
        renderKBIndex();
        renderKBList();
      });
      box.appendChild(chip);
    });
  }

  function totalQA() {
    var n = 0;
    KB.categories.forEach(function (c) { n += c.qa.length; });
    return n;
  }

  function renderKBList() {
    var box = $("#dc-kb-list");
    box.innerHTML = "";
    var kw = state.kbKeyword.toLowerCase();
    var groups = [];
    KB.categories.forEach(function (cat) {
      if (state.kbActiveCat && state.kbActiveCat !== cat.id) return;
      var items = cat.qa.filter(function (qa) {
        if (!kw) return true;
        if (qa.q.toLowerCase().indexOf(kw) >= 0) return true;
        if (qa.a.toLowerCase().indexOf(kw) >= 0) return true;
        if (qa.keywords && qa.keywords.some(function (k) { return String(k).toLowerCase().indexOf(kw) >= 0; })) return true;
        return false;
      });
      if (items.length) groups.push({ cat: cat, items: items });
    });

    if (!groups.length) {
      box.innerHTML = '<div class="dc-kb-empty">' + t("kb_empty") + '</div>';
      return;
    }

    groups.forEach(function (g) {
      var group = document.createElement("div");
      group.className = "dc-kb-group";
      var title = document.createElement("div");
      title.className = "dc-kb-group-title";
      title.innerHTML = '<iconify-icon icon="' + g.cat.icon + '"></iconify-icon> ' + escapeHtml(g.cat.name) +
        ' <span style="color:#9ca3af;font-weight:400;font-size:11px;">· ' + g.items.length + ' ' + t("kb_count") + '</span>';
      group.appendChild(title);
      g.items.forEach(function (qa) {
        var item = document.createElement("button");
        item.className = "dc-kb-item";
        item.dataset.catId = g.cat.id;
        item.dataset.qaId = qa.id;
        item.textContent = qa.q;
        item.addEventListener("click", function () {
          showQADetail(g.cat, qa);
          highlightKBItem(g.cat.id, qa.id);
        });
        group.appendChild(item);
      });
      box.appendChild(group);
    });
  }

  function highlightKBItem(catId, qaId) {
    $all("#dc-kb-list .dc-kb-item").forEach(function (el) {
      if (el.dataset.catId === catId && el.dataset.qaId === qaId) {
        el.classList.add("active");
        try { el.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (e) {}
      } else {
        el.classList.remove("active");
      }
    });
  }

  function showQADetail(cat, qa) {
    if (window.innerWidth <= 768) {
      state.kbOpen = false;
      $("#dc-kb").classList.remove("show");
      $(".dc-kb-toggle").classList.remove("active");
    }
    var messages = $("#dc-messages");
    var div = document.createElement("div");
    div.className = "dc-msg bot";
    var avatar = document.createElement("div");
    avatar.className = "dc-msg-avatar";
    avatar.textContent = "DC";
    var bubble = document.createElement("div");
    bubble.className = "dc-msg-bubble";
    bubble.style.padding = "0";
    bubble.style.background = "transparent";
    bubble.style.boxShadow = "none";

    var card = document.createElement("div");
    card.className = "dc-kb-detail";
    card.innerHTML =
      '<div class="dc-kd-tag"><iconify-icon icon="' + cat.icon + '"></iconify-icon> ' + escapeHtml(cat.name) + '</div>' +
      '<div class="dc-kd-q"><iconify-icon icon="mdi:comment-question-outline" style="color:#1a237e;margin-top:2px;"></iconify-icon><span>' + escapeHtml(qa.q) + '</span></div>' +
      '<div class="dc-kd-a">' + escapeHtml(qa.a) + '</div>';

    var suffix = document.createElement("span");
    suffix.className = "dc-suffix";
    suffix.style.display = "block";
    suffix.style.marginTop = "8px";
    suffix.textContent = t("suffix_label") + KB.meta.complianceSuffix;
    card.appendChild(suffix);

    bubble.appendChild(card);
    div.appendChild(avatar);
    div.appendChild(bubble);
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    state.history.push({ role: "bot", text: qa.a });

    renderQuick(suggestFollowups({ cat: cat, qa: qa }));
  }

  /* ============== 初始化 ============== */
  function init() {
    loadDSConfig();
    // 初始化：检测设备系统语言/区域，确定初始界面文字体系
    state.script = detectSystemScript();
    // 先尝试加载后台配置（欢迎语等），再渲染组件
    loadRemoteKB().then(function () {
      buildLauncher();
      buildPanel();
      applyI18n();
      checkLLMStatus();
      // 繁体用户：异步加载/转换展示用知识库（欢迎语等已按当前体系渲染）
      if (state.script === SCRIPT_TRADITIONAL) loadDisplayKB();
      window.DCSister = {
        open: openPanel,
        close: closePanel,
        restart: restart,
        ask: function (q) {
          openPanel();
          setTimeout(function () {
            var detected = detectScript(q);
            if (detected !== state.script) applyScript(detected);
            appendMessage("user", q, { suffix: false });
            handleUserMessage(q);
          }, 400);
        },
        kb: KB
      };
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
