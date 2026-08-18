/* 股海雙書 · 知識庫問答聊天窗（仿 DCOGAI DC姐姐 風格） */
(function () {
  var KB = [];
  var loaded = false;

  function esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function loadKB() {
    var pre = (typeof window.PREFIX !== 'undefined') ? window.PREFIX : '';
    fetch(pre + 'kb-books.json?v=2').then(function (r) { return r.json(); })
      .then(function (d) { KB = d.articles || []; loaded = true; })
      .catch(function () { loaded = false; });
  }

  function tokens(q) {
    q = (q || '').trim();
    var out = [q];
    if (q.length > 2) { for (var i = 0; i < q.length - 1; i++) out.push(q.substr(i, 2)); }
    return out;
  }

  function score(a, toks) {
    var s = 0, q = a.q || '', x = a.a || '', r = a.reflection || '', kws = a.keywords || [];
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (!t) continue;
      if (q.indexOf(t) >= 0) s += 3;
      for (var j = 0; j < kws.length; j++) if (kws[j].indexOf(t) >= 0) { s += 2; break; }
      if (x.indexOf(t) >= 0) s += 1;
      if (r.indexOf(t) >= 0) s += 1;
    }
    return s;
  }

  function bestMatches(query, n) {
    var toks = tokens(query);
    var scored = KB.map(function (a) { return { a: a, s: score(a, toks) }; })
      .filter(function (o) { return o.s > 0; })
      .sort(function (x, y) { return y.s - x.s; });
    return scored.slice(0, n);
  }

  /* ---------------- 介面 ---------------- */
  var btn, panel;

  function open() {
    if (!panel) return;
    panel.classList.add('open');
    if (!panel.getAttribute('data-greeted')) {
      panel.setAttribute('data-greeted', '1');
      addMsg('bot', '哈嘍～😊 我是「股海問答」助手，可以問我《股路不归》《股道》裡的問題，例如：「什麼是止損？」「主力是怎麼割散戶的？」「沽空是什麼？」。每題會從知識庫（2385 題）找最接近的回答。');
      addMsg('bot', '⚠️ 非投資建議，不承諾收益；股市有風險，本金可能波動，請謹慎決策。');
      renderQuick();
    }
    var inp = document.getElementById('dchat-inp');
    if (inp) inp.focus();
  }

  function close() { if (panel) panel.classList.remove('open'); }

  function addMsg(who, text) {
    var box = document.getElementById('dchat-msgs');
    if (!box) return;
    var d = document.createElement('div');
    d.className = 'dmsg ' + who;
    d.innerHTML = '<div class="dmsg-bubble">' + esc(text).replace(/\n/g, '<br/>') + '</div>';
    box.appendChild(d);
    box.scrollTop = box.scrollHeight;
  }

  function renderQuick() {
    var box = document.getElementById('dchat-quick');
    if (!box) return;
    var qs = ['什麼是止損？', '主力怎麼割散戶？', '什麼是沉沒成本？', '漲了為什麼不敢賣？'];
    box.innerHTML = qs.map(function (q) {
      return '<button onclick="DCSister.ask(\'' + q + '\')">' + esc(q) + '</button>';
    }).join('');
  }

  function ask(question) {
    send(question);
  }

  function send(text) {
    text = (text || '').trim();
    if (!text) return;
    addMsg('user', text);
    var inp = document.getElementById('dchat-inp');
    if (inp) inp.value = '';

    var typing = document.createElement('div');
    typing.className = 'dmsg bot';
    typing.id = 'dchat-typing';
    typing.innerHTML = '<div class="dmsg-bubble">思考中…</div>';
    var box = document.getElementById('dchat-msgs');
    box.appendChild(typing);
    box.scrollTop = box.scrollHeight;

    setTimeout(function () {
      var tp = document.getElementById('dchat-typing');
      if (tp) tp.remove();
      if (!loaded || !KB.length) { addMsg('bot', '知識庫還沒載入，請稍後再試一次。'); return; }
      var hits = bestMatches(text, 2);
      if (!hits.length) {
        addMsg('bot', '這個問題我知識庫裡還沒找到直接答案～😊 你可以試試換個關鍵字，例如「止損」「恐懼」「沽空」「主力」。');
        return;
      }
      hits.forEach(function (o, i) {
        var a = o.a;
        var head = i === 0 ? '找到最接近的一題：' : '另一題相關的：';
        var reply = head + '\n【' + a.title + '｜' + a.part + '】\n' + a.q + '\n' + a.a + (a.reflection ? '\n\n照見：' + a.reflection : '');
        addMsg('bot', reply);
      });
    }, 400);
  }

  /* ---------------- 注入 DOM ---------------- */
  function build() {
    if (document.getElementById('dchat-root')) return;
    var root = document.createElement('div');
    root.id = 'dchat-root';
    root.innerHTML =
      '<button id="dchat-fab" title="問答助手" onclick="DCSister.open()">💬</button>' +
      '<div id="dchat-panel">' +
      '  <div id="dchat-head"><span>💬 股海問答助手</span><button onclick="DCSister.close()" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer">✕</button></div>' +
      '  <div id="dchat-quick"></div>' +
      '  <div id="dchat-msgs"></div>' +
      '  <div id="dchat-inputrow">' +
      '    <input id="dchat-inp" placeholder="輸入問題…（Enter 送出）">' +
      '    <button onclick="DCSister.send(document.getElementById(\'dchat-inp\').value)">➤</button>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(root);
    panel = document.getElementById('dchat-panel');
    var inp = document.getElementById('dchat-inp');
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') DCSister.send(inp.value); });
    loadKB();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }

  window.DCSister = { open: open, close: close, send: send, ask: ask };
})();
