/* 紅樓解讀 · 交互：檢索 / 字號 / 夜間模式 */
var PREFIX = (typeof PREFIX !== "undefined") ? PREFIX : "";

function setSize(s) { document.body.setAttribute("data-size", s); localStorage.setItem("hl_size", s); }
function toggleTheme() {
  var cur = document.documentElement.getAttribute("data-theme");
  var nxt = (cur === "dark") ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", nxt);
  localStorage.setItem("hl_theme", nxt);
  document.getElementById("themeBtn").textContent = (nxt === "dark") ? "☀" : "◐";
}
function applyPrefs() {
  var s = localStorage.getItem("hl_size"); if (s) setSize(s);
  var t = localStorage.getItem("hl_theme");
  if (t === "dark") { document.documentElement.setAttribute("data-theme", "dark");
    var b = document.getElementById("themeBtn"); if (b) b.textContent = "☀"; }
}
function searchSite() {
  var q = (document.getElementById("q").value || "").trim();
  var box = document.getElementById("sr");
  if (!q) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  var data = (typeof window.SEARCH_DATA !== "undefined") ? window.SEARCH_DATA : [];
  var hits = data.filter(function (e) {
    return (e.title + " " + e.text).indexOf(q) > -1;
  }).slice(0, 12);
  var html = "";
  if (!hits.length) html = '<div class="dim" style="padding:6px 10px">無結果：「' + q + '」</div>';
  else hits.forEach(function (e) {
    html += '<a href="' + PREFIX + e.url + '">' + e.title + '</a>';
  });
  box.innerHTML = html;
  box.classList.remove("hidden");
}
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") { var b = document.getElementById("sr"); if (b) b.classList.add("hidden"); }
});
applyPrefs();
