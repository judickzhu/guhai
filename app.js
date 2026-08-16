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
