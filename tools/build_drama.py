#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_drama.py — 生成「短劇改編」章節頁（drama/index.html、drama/ep001.html）

用法：
    python3 tools/build_drama.py

來源：
    drama/src/ep01-shotlist.md     第 1 集逐鏡拍攝腳本（40 鏡）
    drama/src/ep01-storyboard.md   第 1 集分段分鏡（12 段）
    drama/assets/ep01-animatic.mp4 節奏測試片

新增一集：把 md 放進 drama/src/，在 EPISODES 加一筆，再跑一次。
"""
import html
import re
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "drama" / "src"
OUT = ROOT / "drama"

NAV_ITEMS = [
    ("index.html", "首頁"),
    ("chapters/000.html", "股路不归問答"),
    ("phenomena.html", "現象索引"),
    ("checklist.html", "自檢表"),
    ("framework.html", "框架"),
    ("mapping.html", "三層映射"),
    ("acts.html", "六幕"),
    ("gudao/000.html", "股道問答"),
    ("drama/index.html", "短劇改編"),
    ("dc-kb.html", "DC知識庫"),
    ("kb.html", "知識庫檢索"),
]

EPISODES = [
    {
        "no": 1,
        "title": "刀已入手",
        "part": "第一篇　黃土歸城・人工坐莊",
        "shots": 40,
        "seconds": 180,
        "page": "ep001.html",
        "src": "ep01-shotlist.md",
        "done": True,
        "note": "逐鏡腳本完成",
    },
    {"no": 2, "title": "授權與四人入組", "part": "第一篇　黃土歸城・人工坐莊", "done": False},
    {"no": 3, "title": "第一筆試單", "part": "第一篇　黃土歸城・人工坐莊", "done": False},
    {"no": 4, "title": "山子的虧損一課", "part": "第一篇　黃土歸城・人工坐莊", "done": False},
    {"no": 5, "title": "稽查上門前", "part": "第一篇　黃土歸城・人工坐莊", "done": False},
]

ACTS = [
    ("第一篇", "黃土歸城・人工坐莊", "1–30", "人工盤感、組隊、內鬼埋線、遇小周",
     "「一袋錢搭在肩膀上，人長錢短。」"),
    ("第二篇", "數智啟元・代碼刀鋒", "31–60", "DCOGAI 立項、數據污染攻防、反釣收證",
     "「刀是代碼，握刀的，永遠是人。」"),
    ("第三篇", "跨市狂瀾", "61–90", "商品、外盤、匯率；基差、流動性、槓桿",
     "「股票比的是人心，期貨比的是命。」"),
    ("第四篇", "混沌荒原", "91–120", "加密合約、插針、金錢豹立項、不下場",
     "「這裡沒有規則，只有獵手和獵物。」"),
    ("第五篇", "暗莊潛行", "121–150", "偽市值管理、研報、龍虎榜、大宗過橋",
     "「當莊家藏進量化黑箱，連盤口都不再說真話。」"),
    ("第六篇", "黑箱高頻", "151–180", "量化殼矩陣、訂單切片、ETF 聯動、陳默源碼",
     "「市場永不落幕，股路，不歸。」"),
]


# ---------- markdown → html（只支援本專案用到的語法） ----------
def inline(s: str) -> str:
    s = html.escape(s, quote=False)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"(https?://[^\s）)]+)", r'<a href="\1">\1</a>', s)
    return s


def md_to_html(md: str) -> str:
    lines = md.split("\n")
    out, i = [], 0
    while i < len(lines):
        ln = lines[i]
        s = ln.rstrip()

        # 代碼塊
        if s.startswith("```"):
            i += 1
            buf = []
            while i < len(lines) and not lines[i].startswith("```"):
                buf.append(html.escape(lines[i], quote=False))
                i += 1
            i += 1
            out.append("<pre class=code>" + "\n".join(buf) + "</pre>")
            continue

        # 表格
        if s.startswith("|") and i + 1 < len(lines) and re.match(r"^\|[\s:|-]+\|$", lines[i + 1].strip()):
            head = [c.strip() for c in s.strip("|").split("|")]
            i += 2
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            t = "<div class=tablewrap><table><thead><tr>" + "".join(
                f"<th>{inline(c)}</th>" for c in head) + "</tr></thead><tbody>"
            for r in rows:
                t += "<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>"
            out.append(t + "</tbody></table></div>")
            continue

        # 標題
        m = re.match(r"^(#{1,4})\s+(.*)$", s)
        if m:
            lvl = len(m.group(1))
            out.append(f"<h{lvl}>{inline(m.group(2))}</h{lvl}>")
            i += 1
            continue

        # 分隔線
        if s == "---":
            out.append("<hr>")
            i += 1
            continue

        # 引用
        if s.startswith(">"):
            buf = []
            while i < len(lines) and lines[i].startswith(">"):
                buf.append(inline(lines[i].lstrip("> ").rstrip()))
                i += 1
            out.append("<blockquote>" + "<br>".join(buf) + "</blockquote>")
            continue

        # 有序清單
        if re.match(r"^\d+\.\s", s):
            buf = []
            while i < len(lines) and re.match(r"^\d+\.\s", lines[i]):
                buf.append(f"<li>{inline(re.sub(r'^\d+\.\s', '', lines[i]).rstrip())}</li>")
                i += 1
            out.append("<ol>" + "".join(buf) + "</ol>")
            continue

        # 無序清單
        if s.startswith("- "):
            buf = []
            while i < len(lines) and lines[i].startswith("- "):
                buf.append(f"<li>{inline(lines[i][2:].rstrip())}</li>")
                i += 1
            out.append("<ul>" + "".join(buf) + "</ul>")
            continue

        if s.strip() == "":
            i += 1
            continue

        out.append(f"<p>{inline(s)}</p>")
        i += 1
    return "\n".join(out)


# ---------- 站點外殼 ----------
def nav_html(prefix: str, active: str) -> str:
    items = []
    for href, label in NAV_ITEMS:
        a = f' class=active' if label == active else ""
        items.append(f'<a href="{prefix}{href}"{a}>{label}</a>')
    return "".join(items)


def page(title: str, desc: str, slug: str, body: str, active: str) -> str:
    prefix = "../"
    return f"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(desc)}">
<meta property="og:type" content="website">
<meta property="og:image" content="https://judickzhu.github.io/guhai/og.png">
<meta property="og:url" content="https://judickzhu.github.io/guhai/drama/{slug}">
<meta name="twitter:card" content="summary_large_image">
<script>var PREFIX = "{prefix}";</script>
<link rel="stylesheet" href="{prefix}style.css?v=3">
<script src="{prefix}search-data.js?v=3" defer></script>
<script src="{prefix}auth.js?v=3"></script>
<script src="{prefix}app.js?v=3" defer></script>
<link rel="stylesheet" href="{prefix}dc-sister/dc-sister.css">
<script src="{prefix}dc-sister/iconify-icon.min.js"></script>
<script src="{prefix}dc-sister/kb-data.js?v=22"></script>
<script src="{prefix}dc-sister/zh-map.js"></script>
<script src="{prefix}dc-sister/kb-books.js"></script>
<script src="{prefix}dc-sister/dc-sister.js?v=85"></script>
<style>
 main{{max-width:920px;margin:0 auto;padding:0 18px 80px}}
 article h1{{margin:.6em 0 .3em}}
 article h2{{margin-top:1.8em;border-bottom:1px solid var(--line,#e5e5e5);padding-bottom:.3em}}
 article h3{{margin-top:1.6em}}
 .tablewrap{{overflow-x:auto;margin:1em 0}}
 table{{border-collapse:collapse;width:100%;font-size:.92em}}
 th,td{{border:1px solid var(--line,#e0e0e0);padding:.5em .6em;vertical-align:top;text-align:left}}
 th{{background:rgba(128,128,128,.10);white-space:nowrap}}
 pre.code{{background:#14161a;color:#d7e2e8;padding:14px 16px;border-radius:10px;overflow-x:auto;font-size:.85em;line-height:1.5}}
 code{{background:rgba(128,128,128,.16);padding:.12em .35em;border-radius:4px;font-size:.92em}}
 blockquote{{margin:1em 0;padding:.6em 1em;border-left:3px solid rgba(190,160,70,.8);background:rgba(190,160,70,.08);border-radius:0 8px 8px 0}}
 .video{{width:100%;max-width:420px;display:block;margin:1.2em auto;border-radius:12px;background:#000}}
 .kpi{{display:flex;flex-wrap:wrap;gap:10px;margin:1.2em 0}}
 .kpi div{{flex:1 1 130px;border:1px solid var(--line,#e0e0e0);border-radius:10px;padding:.7em .9em}}
 .kpi b{{display:block;font-size:1.35em;line-height:1.2}}
 .kpi span{{color:#888;font-size:.85em}}
 .epdone{{color:#2e7d32;font-weight:600}}
 .eptodo{{color:#999}}
 .dl{{line-height:2}}
</style>
</head>
<body>
<header>
  <div class="brand"><a href="{prefix}index.html">股海雙書</a></div>
  <nav>{nav_html(prefix, active)}</nav>
  <div class="search">
    <input type="search" id="q" placeholder="搜尋 252 篇問答…" oninput="searchSite(this.value)" autocomplete="off">
    <div id="search-results"></div>
  </div>
  <div class="tools">
    <button onclick="setSize('s')" title="小字">A-</button>
    <button onclick="setSize('m')" title="中字">A</button>
    <button onclick="setSize('l')" title="大字">A+</button>
    <button onclick="toggleTheme()" title="夜間模式">◐</button>
  </div>
</header>
<main>{body}</main>
<footer>
  <p>原著：王新平　·　整理：南嗥</p>
  <p>免責與合規：本內容為對王新平《股路不归》《股道》的解讀與教學整理，非投資建議；劇本與分鏡為藝術虛構，所有交易情節不構成任何投資建議，請勿模仿。投資有風險，入市須謹慎。</p>
</footer>
</body>
</html>
"""


def build_index() -> str:
    rows = []
    for ep in EPISODES:
        if ep.get("done"):
            rows.append(
                f'<tr><td>{ep["no"]}</td><td><a href="{ep["page"]}">{ep["title"]}</a></td>'
                f'<td>{ep["shots"]} 鏡 / {ep["seconds"]} 秒</td>'
                f'<td class="epdone">{ep["note"]}</td></tr>')
        else:
            rows.append(
                f'<tr><td>{ep["no"]}</td><td>{ep["title"]}</td><td>—</td>'
                f'<td class="eptodo">待製作</td></tr>')
    ep_table = ("<div class=tablewrap><table><thead><tr><th>集</th><th>標題</th>"
                "<th>規格</th><th>狀態</th></tr></thead><tbody>"
                + "".join(rows) + "</tbody></table></div>")

    act_rows = "".join(
        f'<tr><td>{a}</td><td>{b}</td><td>{c}</td><td>{d}</td><td>{html.escape(e)}</td></tr>'
        for a, b, c, d, e in ACTS)
    act_table = ("<div class=tablewrap><table><thead><tr><th>篇</th><th>名稱</th><th>集數</th>"
                 "<th>主線</th><th>收尾金句</th></tr></thead><tbody>"
                 + act_rows + "</tbody></table></div>")

    body = f"""<article>
<h1>《股路不歸》短劇改編</h1>
<p class="sub">原著：王新平　·　改編：DCOGAI 研發團隊　·　180 集 × 3 分鐘豎屏短劇</p>

<blockquote>本頁存檔的是「可拍攝的東西」：分鏡、逐鏡腳本、對白時間碼、生成提示詞、驗收指標。
不是觀後感，也不是大綱——是能直接投喂給生成器、或直接交給剪輯師的東西。</blockquote>

<div class="kpi">
  <div><b>180</b><span>集（六篇）</span></div>
  <div><b>180 秒</b><span>單集硬時長</span></div>
  <div><b>9:16</b><span>豎屏畫幅</span></div>
  <div><b>40</b><span>第 1 集鏡頭數</span></div>
</div>

<h2>已完成</h2>
{ep_table}

<h2>六大篇結構</h2>
{act_table}

<h2>方法：先把節奏做出來，再花錢生成畫面</h2>
<p>每一集都走同一條流水線，順序不能顛倒：</p>
<ol>
<li><b>分段</b>——把 180 秒切成 12 個敘事單元（快慢有別，不是平均切）。</li>
<li><b>逐鏡</b>——每單元 1–3 個機位，全片約 40 個鏡頭，單鏡不超過 6 秒（超過 AI 會漂移變形）。</li>
<li><b>定妝</b>——角色先出四視定妝圖，之後所有鏡頭用圖生視頻，固定 seed，同一張臉。</li>
<li><b>合成</b>——AI 只生成畫面；所有文字、數字、K 線刻度、UI、字幕，全部後期合成。</li>
<li><b>驗收</b>——每集 12 條硬指標，過不了就重做，不修。</li>
</ol>

<h2>素材下載</h2>
<p class="dl">
<a href="src/ep01-shotlist.md">第 1 集逐鏡腳本（Markdown，22 KB）</a>　·　
<a href="src/ep01-storyboard.md">第 1 集分段分鏡（Markdown，18 KB）</a>　·　
</p>

<h2>為什麼不做「一句話生成 15 秒」</h2>
<ul>
<li><b>文字會爛掉。</b>生成模型畫出來的字是形狀不是字——盤口、金額、K 線刻度全部不可讀。所以文字必須後期疊。</li>
<li><b>臉會變。</b>180 集要同一張臉；每鏡重捏一次，2700 個鏡頭就是 2700 張不同的臉。</li>
<li><b>節奏會失控。</b>15 秒切 25 刀是把「鉤子」拉滿全片；180 秒要的是快慢有別，前面三秒狠，中間敢慢 40 秒。</li>
</ul>
<p>這三件事決定了 pipeline，而不是決定了畫質。</p>
</article>"""
    return page("《股路不歸》短劇改編 · 分鏡與逐鏡腳本", "《股路不歸》180 集豎屏短劇改編：六大篇結構、第 1 集 40 鏡逐鏡腳本、生成提示詞與驗收指標。", "index.html", body, "短劇改編")


def build_ep001() -> str:
    md = (SRC / "ep01-shotlist.md").read_text(encoding="utf-8")
    body_md = md_to_html(md)
    body = f"""<article>
<p class="dl"><a href="index.html">← 回短劇改編</a>　·　<a href="src/ep01-shotlist.md" download>下載 Markdown 原檔</a></p>
{body_md}
</article>"""
    return page("第 1 集〈刀已入手〉逐鏡拍攝腳本 · 《股路不歸》短劇改編",
                "第 1 集 40 鏡逐鏡腳本：時間碼、景別、運鏡、台詞、生成提示詞、後期合成層與 12 條驗收指標。",
                "ep001.html", body, "短劇改編")


def main() -> None:
    (OUT / "index.html").write_text(build_index(), encoding="utf-8")
    (OUT / "ep001.html").write_text(build_ep001(), encoding="utf-8")
    print("wrote drama/index.html, drama/ep001.html")


if __name__ == "__main__":
    main()