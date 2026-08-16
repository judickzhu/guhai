/* 主題（夜間模式） */
(function(){
  try{ if(localStorage.getItem('theme')==='dark') document.documentElement.setAttribute('data-theme','dark'); }catch(e){}
})();
function toggleTheme(){
  var el=document.documentElement;
  var dark=el.getAttribute('data-theme')==='dark';
  if(dark){ el.removeAttribute('data-theme'); try{localStorage.setItem('theme','light');}catch(e){} }
  else{ el.setAttribute('data-theme','dark'); try{localStorage.setItem('theme','dark');}catch(e){} }
}
/* 字體大小 */
(function(){
  try{ var s=localStorage.getItem('fontsize'); if(s) document.body.className+=' size-'+s; }catch(e){}
})();
function setSize(s){
  document.body.classList.remove('size-s','size-l');
  if(s!=='m') document.body.classList.add('size-'+s);
  try{ localStorage.setItem('fontsize', s); }catch(e){}
}
/* 全站搜尋 */
function searchSite(kw){
  kw=(kw||'').trim();
  var box=document.getElementById('search-results');
  if(!box) return;
  if(kw.length<1){ box.innerHTML=''; box.style.display='none'; return; }
  var hits=(window.SITE_SEARCH||[]).filter(function(x){return x.t.indexOf(kw)>=0;}).slice(0,12);
  var pre=(typeof PREFIX!=='undefined')?PREFIX:'';
  box.innerHTML=hits.length?hits.map(function(x){return '<a href="'+pre+x.u+'">'+x.t+'</a>';}).join(''):'<span class="none">無相符結果</span>';
  box.style.display='block';
}
document.addEventListener('click',function(e){
  var box=document.getElementById('search-results');
  if(box && !e.target.closest('.search')) box.style.display='none';
});
