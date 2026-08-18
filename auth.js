/* 網站密碼鎖（軟性防護：密碼存為雜湊，內容仍在前端） */
(function(){
  var KEY='guhai-auth';
  var HASH='41f37e6e9a365d2b5ebbc7827de135220676ec72120dc59ad89bf643ab8990f8';
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
    ov.innerHTML='<div class="auth-box"><h1>股海雙書 知識庫</h1><p style="color:#888">本站暫時不公開，請輸入密碼</p><input type="password" id="pwd" placeholder="密碼" autocomplete="off"><button id="btn">進 入</button><p id="err"></p></div>';
    document.body.appendChild(ov);
    function check(){
      var v=document.getElementById('pwd').value;
      sha256(v).then(function(h){
        if(h===HASH){ try{ localStorage.setItem(KEY,'1'); }catch(e){} document.documentElement.classList.remove('locked'); ov.remove(); }
        else{ document.getElementById('err').textContent='密碼錯誤'; }
      });
    }
    document.getElementById('btn').addEventListener('click', check);
    document.getElementById('pwd').addEventListener('keydown', function(e){ if(e.key==='Enter') check(); });
    document.getElementById('pwd').focus();
  });
})();
