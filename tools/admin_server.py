#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
後台管理員 · 子嗥問答補充審核（本地運行，零依賴）
用法: python3 tools/admin_server.py  → 開 http://127.0.0.1:8701
功能:
  1. 列出 honglou_qa_feedback.json 的 待審 / 已審 條目
  2. 逐條「通過→已審」/「駁回→刪除」
  3. 手動貼入補充(子嗥窗「⤴ 導出」的 JSON)
  4. 一鍵「重跑生成器 + git 提交推送」(審核通過即入庫上線)
數據檔: 電子書ipa/honglou_qa_feedback.json
"""
import json, os, subprocess, sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

ROOT = os.path.dirname(os.path.abspath(__file__))  # 電子書ipa/網站/tools
REPO = os.path.dirname(ROOT)                        # 電子書ipa/網站（git 倉庫根）
WS   = os.path.dirname(REPO)                        # 電子書ipa（素材與生成器所在）
FEED = os.path.join(WS, "honglou_qa_feedback.json")
GEN  = os.path.join(WS, "build_honglou_site.py")

def load_feed():
    try:
        d = json.load(open(FEED, encoding="utf-8"))
    except Exception:
        d = {"_说明": "問答互動·知識庫迭代入口。", "entries": []}
    d.setdefault("entries", [])
    return d

def save_feed(d):
    tmp = FEED + ".tmp"
    json.dump(d, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    os.replace(tmp, FEED)

PAGE = """<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>後台管理員 · 子嗥補充審核</title>
<style>
 body{font-family:"Noto Serif TC","PMingLiU",serif;background:#f5efe3;color:#2b2118;margin:0;padding:20px}
 h1{color:#9e2b25} h2{border-left:4px solid #9e2b25;padding-left:10px;color:#7c3f2d}
 .card{background:#fffaf0;border:1px solid #d9c9a8;border-radius:10px;padding:14px 16px;margin:10px 0}
 .pend{background:#fff4e0}.done{background:#eef7ee;opacity:.85}
 .tag{display:inline-block;padding:1px 8px;border-radius:10px;font-size:.85em}
 .tag-w{background:#f3d9a4}.tag-g{background:#cde8cd}
 button{cursor:pointer;border:1px solid #9e2b25;background:#9e2b25;color:#fff;border-radius:6px;padding:6px 14px;margin-right:6px}
 button.ghost{background:#fff;color:#9e2b25}
 textarea{width:100%;height:120px;font-family:inherit}
 .dim{color:#7a6a55;font-size:.9em}
 #msg{padding:8px;border-radius:6px;margin:8px 0;display:none}
</style></head><body>
<h1>後台管理員 · 子嗥問答補充審核</h1>
<p class="dim">數據檔：honglou_qa_feedback.json · 審核通過後按「重跑生成並上線」即入知識庫</p>
<div id="msg"></div>
<h2>待審（N1）</h2><div id="pend"></div>
<h2>已審（N2）</h2><div id="done"></div>
<h2>手動貼入補充（子嗥窗「⤴ 導出」的 JSON）</h2>
<div class="card"><textarea id="in" placeholder='[{"q":"問題","a":"補充內容","ref":"章回或頁面","source":"補充者","date":"2025-01-01"}]'></textarea>
<button onclick="addManual()">貼入（status=待審）</button></div>
<div class="card"><button onclick="rebuild()">🔁 重跑生成器 + git 提交推送（上線）</button>
<button class="ghost" onclick="refresh()">↻ 刷新</button></div>
<script>
let E=[];
async function j(url,opt){const r=await fetch(url,opt);return r.json();}
function card(e,i){
 const cls=e.status==='已審'?'card done':'card pend';
 const tag=e.status==='已審'?'<span class="tag tag-g">已審</span>':'<span class="tag tag-w">待審</span>';
 return `<div class="${cls}"><b>${e.q||'(無問題)'}</b> ${tag}
 <p>${(e.a||'').replace(/</g,'&lt;')}</p>
 <p class="dim">ref:${e.ref||'-'} ｜ 來源:${e.source||'-'} ｜ ${e.date||'-'}</p>
 ${e.status==='已審'?'':'<button onclick="rv(${i},\\'approve\\')">✓ 通過（已審）</button><button class="ghost" onclick="rv(${i},\\'reject\\')">✗ 駁回</button>'}</div>`;
}
function render(){
 document.getElementById('pend').innerHTML=E.filter(x=>x.status!=='已審').map(card).join('')||'<p class="dim">無待審</p>';
 document.getElementById('done').innerHTML=E.filter(x=>x.status==='已審').map(card).join('')||'<p class="dim">無已審</p>';
 const h=[...document.querySelectorAll('h2')];h[0].innerHTML='待審（'+E.filter(x=>x.status!=='已審').length+'）';h[1].innerHTML='已審（'+E.filter(x=>x.status==='已審').length+'）';
}
async function refresh(){const r=await j('/api/list');E=r.entries;render();}
async function rv(i,act){const r=await j('/api/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({index:i,action:act})});msg(r.ok||r.err);refresh();}
async function addManual(){const v=document.getElementById('in').value.trim();if(!v){msg('請貼入 JSON');return;}
 const r=await j('/api/manual',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raw:v})});msg(r.ok||r.err);document.getElementById('in').value='';refresh();}
async function rebuild(){const r=await j('/api/rebuild',{method:'POST'});msg(r.ok||r.err);refresh();}
function msg(s){const m=document.getElementById('msg');m.textContent=s;m.style.display='block';m.style.background=s.startsWith('✓')?'#cde8cd':'#f3d9a4';setTimeout(()=>m.style.display='none',6000);}
refresh();
</script></body></html>"""

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        self.send_response(code); self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body))); self.end_headers()
        self.wfile.write(body)
    def _body(self):
        n = int(self.headers.get("Content-Length", 0))
        return self.rfile.read(n).decode("utf-8") if n else ""
    def do_GET(self):
        p = urlparse(self.path).path
        if p in ("/", "/index.html"):
            self._send(200, PAGE.encode("utf-8"), "text/html; charset=utf-8")
        elif p == "/api/list":
            self._send(200, json.dumps(load_feed(), ensure_ascii=False).encode("utf-8"))
        else:
            self._send(404, b'{"err":"404"}')
    def do_POST(self):
        p = urlparse(self.path).path
        d = load_feed()
        if p == "/api/review":
            b = json.loads(self._body() or "{}"); i = b.get("index"); act = b.get("action")
            if not isinstance(i, int) or not (0 <= i < len(d["entries"])) or act not in ("approve", "reject"):
                self._send(400, '{"err":"參數錯誤"}'.encode("utf-8")); return
            if act == "approve": d["entries"][i]["status"] = "已審"
            else: d["entries"].pop(i)
            save_feed(d); self._send(200, '{"ok":"已更新"}'.encode("utf-8"))
        elif p == "/api/manual":
            b = json.loads(self._body() or "{}"); raw = b.get("raw", "")
            try:
                items = json.loads(raw)
                if isinstance(items, dict): items = [items]
                for it in items:
                    it.setdefault("status", "待審")
                    d["entries"].append(it)
                save_feed(d); self._send(200, f'{{"ok":"已貼入 {len(items)} 條（待審）"}}'.encode("utf-8"))
            except Exception as e:
                self._send(400, f'{{"err":"JSON 解析失敗:{e}"}}'.encode("utf-8"))
        elif p == "/api/ingest":
            try:
                b = json.loads(self._body() or "{}")
                items = b.get("entries") or ([b] if b.get("q") else [])
                n = 0
                for it in items:
                    if not it.get("q") and not it.get("a"): continue
                    it.setdefault("status", "待審")
                    d["entries"].append(it); n += 1
                save_feed(d)
                self._send(200, f'{{"ok":"已接收 {n} 條（待審）"}}'.encode("utf-8"))
            except Exception as e:
                self._send(400, f'{{"err":"{e}"}}'.encode("utf-8"))
        elif p == "/api/rebuild":
            # 先寫入鏡像,再重跑生成器,再 git 提交推送
            out = []
            try:
                import shutil
                for fn in os.listdir(WS):
                    if fn.startswith("honglou_") and fn.endswith(".json"):
                        shutil.copy(os.path.join(WS, fn), os.path.join(ROOT, "tools", "content-mirror", fn))
                r1 = subprocess.run([sys.executable, GEN], capture_output=True, text=True, cwd=WS, timeout=300)
                out.append("生成器:" + ("OK" if r1.returncode == 0 else "失敗 " + r1.stderr[-300:]))
                if r1.returncode == 0:
                    r2 = subprocess.run(["git", "add", "-A"], cwd=REPO, capture_output=True, text=True)
                    r3 = subprocess.run(["git", "commit", "-m", "後台審核入庫:子嗥補充更新"], cwd=REPO, capture_output=True, text=True)
                    r4 = subprocess.run(["git", "push", "origin", "main"], cwd=REPO, capture_output=True, text=True, timeout=300)
                    out.append("git:" + ("OK" if r4.returncode == 0 else "push 需處理 " + r4.stderr[-200:]))
                self._send(200, f'{{"ok":"{";".join(out)}"}}'.encode("utf-8"))
            except Exception as e:
                self._send(500, f'{{"err":"{e}"}}'.encode("utf-8"))
        else:
            self._send(404, b'{"err":"404"}')

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8701
    print(f"後台管理員: http://127.0.0.1:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
