/* 網站登入鎖（軟性防護：憑證存為雜湊，內容仍在前端）
 * 帳號：judick@qq.com　密碼：Jsw@1234
 * 相容舊單一密碼（jsw12345678901@）——只填密碼亦放行
 */
(function(){
  var KEY='guhai-auth';
  var USER_HASH='2f2b72924d583879fcde87703ead445f16b359203adeb7f4d88b591e097ba8c4'; // judick@qq.com
  var PASS_HASH='0bf7f0a6d985ca9ce43812cb3fa369e7185e8188fe0eef49b19c020a9a96f1a7'; // Jsw@1234
  var LEGACY_HASH='41f37e6e9a365d2b5ebbc7827de135220676ec72120dc59ad89bf643ab8990f8'; // jsw12345678901@
  function authed(){ try{ return localStorage.getItem(KEY)==='1'; }catch(e){ return false; } }
  function sha256(s){
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function(buf){
      return Array.from(new Uint8Array(buf)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
    });
  }
  if(!authed()){ document.documentElement.classList.add('locked'); }
  document.addEventListener('DOMContentLoaded', function(){
    if(authed()){ document.documentElement.classList.remove('locked'); return; }
    var ov=document.createElement('div');
    ov.className='auth-overlay';
    ov.innerHTML='<div class="auth-box"><h1>股海雙書 知識庫</h1><p style="color:#888">請輸入登入帳號與密碼</p>'+
      '<input type="text" id="uid" placeholder="帳號" autocomplete="username">'+
      '<input type="password" id="pwd" placeholder="密碼" autocomplete="current-password">'+
      '<button id="btn">進 入</button><p id="err"></p></div>';
    document.body.appendChild(ov);
    function grant(){
      try{ localStorage.setItem(KEY,'1'); }catch(e){}
      document.documentElement.classList.remove('locked'); ov.remove();
    }
    function check(){
      var u=document.getElementById('uid').value.trim();
      var v=document.getElementById('pwd').value;
      var err=document.getElementById('err');
      if(!v){ err.textContent='請輸入密碼'; return; }
      sha256(v).then(function(h){
        if(h===LEGACY_HASH){ grant(); return; }        // 相容舊密碼
        if(h!==PASS_HASH){ err.textContent='帳號或密碼錯誤'; return; }
        if(!u){ err.textContent='請輸入帳號'; return; }
        sha256(u).then(function(uh){
          if(uh===USER_HASH) grant();
          else err.textContent='帳號錯誤';
        });
      });
    }
    document.getElementById('btn').addEventListener('click', check);
    document.getElementById('pwd').addEventListener('keydown', function(e){ if(e.key==='Enter') check(); });
    document.getElementById('uid').addEventListener('keydown', function(e){ if(e.key==='Enter') document.getElementById('pwd').focus(); });
    document.getElementById('uid').focus();
  });
})();
