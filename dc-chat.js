/* 問問 ima —— 網站問答助手改為 ima 入口（知識庫已同步到 ima） */
(function () {
  var panel;

  function esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function open() {
    if (!panel) return;
    panel.classList.add('open');
  }

  function close() { if (panel) panel.classList.remove('open'); }

  function build() {
    if (document.getElementById('dchat-root')) return;
    var root = document.createElement('div');
    root.id = 'dchat-root';
    root.innerHTML =
      '<button id="dchat-fab" title="問問 ima" onclick="DCSister.open()">💬</button>' +
      '<div id="dchat-panel">' +
      '  <div id="dchat-head"><span>❓ 問問 ima</span><button onclick="DCSister.close()" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer">✕</button></div>' +
      '  <div id="dchat-body">' +
      '    <p>本網站的問答助手已升級為「<b>問問 ima</b>」～😊</p>' +
      '    <p>知識庫內容（<b>2385 題問答 ＋ 網站框架</b>）已全部同步到 ima 的「噑號的知识库」，現在由 ima 回答你的問題。</p>' +
      '    <a id="dchat-cta" href="https://ima.qq.com" target="_blank" rel="noopener">➤ 前往 ima 提問</a>' +
      '    <p class="dchat-alt">沒有 ima？也可用本站<b>離線檢索</b>：<a href="kb.html">知識庫檢索</a></p>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(root);
    panel = document.getElementById('dchat-panel');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }

  window.DCSister = { open: open, close: close };
})();
