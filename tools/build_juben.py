#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_juben.py — 把 180 集劇本拆成 drama/juben/ 下的單集頁

來源：drama/src/thread-full.txt（原始對話全文，含全部 180 集）
輸出：
    drama/juben/index.html    六篇目錄
    drama/juben/001.html …    單集劇本
    drama/src/juben-180.md    全集 Markdown（下載用）

規則：同一集若出現多次（返工重寫），取**最後一次**出現的版本為準。
"""
import html
import re
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "drama" / "src" / "thread-full.txt"
OUT = ROOT / "drama" / "juben"
PREFIX = "../../"

ACTS = [
    ("第一篇", "黃土歸城・人工坐莊", 1, 30),
    ("第二篇", "數智啟元・代碼刀鋒", 31, 60),
    ("第三篇", "跨市狂瀾", 61, 90),
    ("第四篇", "混沌荒原", 91, 120),
    ("第五篇", "暗莊潛行", 121, 150),
    ("第六篇", "黑箱高頻", 151, 180),
]

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

# 第 1–5 集原文無小標，沿用短劇改編頁的命名，保持全站一致
TITLE_OVERRIDE = {
    1: "刀已入手",
    2: "授權與四人入組",
    3: "第一筆試單",
    4: "山子的虧損一課",
    5: "稽查上門前",
}

STOP = re.compile(r"^(如果你|如果你确认|✅|本回答由AI生成|《股路不归》｜第|第\s*\d+\s*集|第[一二三四五六]篇)")
HDR = re.compile(r"^第\s*(\d+)\s*集(.*)$")
SECT = re.compile(r"^【([^】]+)】\s*(.*)$")


def load() -> dict:
    lines = SRC.read_text(encoding="utf-8").split("\n")
    last = {}
    for i, l in enumerate(lines):
        m = HDR.match(l.strip())
        if m:
            last[int(m.group(1))] = i
    eps = {}
    for n in range(1, 181):
        s = last.get(n)
        if s is None:
            continue
        head = HDR.match(lines[s].strip())
        title = (head.group(2) or "").strip()
        title = title.strip("【】").strip()
        if not title:
            title = TITLE_OVERRIDE.get(n, "")
        body = []
        for l in lines[s + 1:]:
            if STOP.match(l.strip()):
                break
            body.append(l.rstrip())
        eps[n] = {"title": title, "body": "\n".join(body).strip()}
    return eps


def anchor(n: int) -> str:
    return f"{n:03d}.html"


SKIP_TAGS = {"时长", "前置摄制标签", "前置摄製標籤"}
LAND_RE = re.compile(r"^【本集(?:核心)?落[点點]】\s*(.*)$")


def split_landing(text: str):
    """抽出【本集落点】，回傳（去掉該段的正文, 落點文字）"""
    keep, land = [], ""
    for line in text.split("\n"):
        m = LAND_RE.match(line.strip())
        if m:
            land = m.group(1).strip()
            continue
        keep.append(line)
    return "\n".join(keep), land


def render_body(text: str) -> str:
    """把【段名】轉成小標，其餘成段落。"""
    out, buf = [], []

    def flush():
        if buf:
            out.append("<p>" + "<br>".join(html.escape(x) for x in buf) + "</p>")
            buf.clear()

    for raw in text.split("\n"):
        line = raw.rstrip()
        if not line:
            flush()
            continue
        m = SECT.match(line.strip())
        if m:
            flush()
            tag, rest = m.group(1), m.group(2).strip()
            if tag in SKIP_TAGS:
                if rest and tag in ("时长",):
                    continue
                continue
            if rest:
                out.append(f'<h3>【{html.escape(tag)}】</h3><p>{html.escape(rest)}</p>')
            else:
                out.append(f"<h3>【{html.escape(tag)}】</h3>")
            continue
        buf.append(line)
    flush()
    return "\n".join(out)


def landing(body_html: str) -> str:
    m = re.search(r"<h3>【本集(?:核心)?落[点點]】</h3>(?:<p>(.*?)</p>)?", body_html)
    return m.group(1) if m and m.group(1) else ""


def shell(title: str, desc: str, slug: str, body: str) -> str:
    nav = "".join(
        f'<a href="{PREFIX}{h}"{" class=active" if lab == "短劇改編" else ""}>{lab}</a>'
        for h, lab in NAV_ITEMS)
    nav += (f'<a class="switch" href="{PREFIX}orig/index.html"'
            ' title="切換到原版（尖問＋透答＋照見）">📖 原版</a>')
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
<meta property="og:url" content="https://judickzhu.github.io/guhai/drama/juben/{slug}">
<meta name="twitter:card" content="summary_large_image">
<script>var PREFIX = "{PREFIX}";</script>
<link rel="stylesheet" href="{PREFIX}style.css?v=3">
<script src="{PREFIX}search-data.js?v=3" defer></script>
<script src="{PREFIX}auth.js?v=3"></script>
<script src="{PREFIX}app.js?v=3" defer></script>
<link rel="stylesheet" href="{PREFIX}dc-sister/dc-sister.css">
<script src="{PREFIX}dc-sister/iconify-icon.min.js"></script>
<script src="{PREFIX}dc-sister/kb-data.js?v=22"></script>
<script src="{PREFIX}dc-sister/zh-map.js"></script>
<script src="{PREFIX}dc-sister/kb-books.js"></script>
<script src="{PREFIX}dc-sister/dc-sister.js?v=85"></script>
<style>
 main{{max-width:860px;margin:0 auto;padding:0 18px 80px}}
 article h1{{margin:.6em 0 .2em}}
 article h2{{margin-top:2em;border-bottom:1px solid var(--line,#e5e5e5);padding-bottom:.3em}}
 article h3{{margin:1.5em 0 .3em;font-size:1em;color:#b08a3e;letter-spacing:.04em}}
 .meta{{color:#888;font-size:.9em;margin-bottom:1.4em}}
 .tablewrap{{overflow-x:auto}}
 table{{border-collapse:collapse;width:100%;font-size:.9em}}
 th,td{{border:1px solid var(--line,#e0e0e0);padding:.45em .6em;vertical-align:top;text-align:left}}
 th{{background:rgba(128,128,128,.10);white-space:nowrap}}
 .land{{margin:1.5em 0;padding:.7em 1em;border-left:3px solid rgba(190,160,70,.8);background:rgba(190,160,70,.08);border-radius:0 8px 8px 0;font-size:.95em}}
 .pager{{display:flex;justify-content:space-between;gap:10px;margin:2.4em 0 1em;font-size:.95em}}
</style>
</head>
<body>
<header>
  <div class="brand"><a href="{PREFIX}index.html">股海雙書</a></div>
  <nav>{nav}</nav>
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
  <p>原著：王新平　·　改編：DCOGAI 研發團隊</p>
  <p>免責與合規：本劇本為藝術虛構，所有金融交易情節不構成任何投資建議，虛擬人物、虛擬交易系統，請勿模仿。市場有風險，入市須謹慎。</p>
</footer>
</body>
</html>
"""


def main() -> None:
    eps = load()
    OUT.mkdir(parents=True, exist_ok=True)
    toc = {}
    md_parts = ["# 《股路不归》180 集竖屏短剧剧本（完整版）", "", "改编：DCOGAI 研发团队｜原著：王新平", ""]

    for n in range(1, 181):
        ep = eps.get(n)
        if not ep:
            continue
        raw, land = split_landing(ep["body"])
        body_html = render_body(raw)
        title = f"第 {n} 集" + (f"｜{ep['title']}" if ep["title"] else "")
        toc[n] = (title, land)

        prev_l = f'<a href="{anchor(n-1)}">← 第 {n-1} 集</a>' if n > 1 else '<span></span>'
        next_l = f'<a href="{anchor(n+1)}">第 {n+1} 集 →</a>' if n < 180 else '<span></span>'
        pager = f'<nav class="pager">{prev_l}<a href="index.html">目錄</a>{next_l}</nav>'
        body = f"""<article>
<p class="meta"><a href="index.html">← 180 集劇本</a></p>
<h1>{html.escape(title)}</h1>
<p class="meta">單集 180 秒　·　9:16 豎屏　·　豎屏 3 分鐘短劇格式</p>
{body_html}
{('<div class="land"><b>本集落點</b>　' + html.escape(land) + '</div>') if land else ''}
{pager}
</article>"""
        (OUT / anchor(n)).write_text(
            shell(f"{title} · 《股路不归》180 集剧本", (land or title)[:120], anchor(n), body),
            encoding="utf-8")

        md_parts.append(f"## {title}\n\n{ep['body']}\n")

    # 目錄
    rows = []
    for name, sub, a, b in ACTS:
        rows.append(f"<h2>{name}　{sub}（{a}–{b} 集）</h2><div class=tablewrap><table>"
                    "<thead><tr><th>集</th><th>標題</th><th>本集落點</th></tr></thead><tbody>")
        for n in range(a, b + 1):
            if n not in toc:
                continue
            t, land = toc[n]
            short = (land[:46] + "…") if len(land) > 46 else land
            rows.append(f'<tr><td><a href="{anchor(n)}">{n}</a></td>'
                        f'<td><a href="{anchor(n)}">{html.escape(t)}</a></td>'
                        f'<td>{html.escape(short)}</td></tr>')
        rows.append("</tbody></table></div>")

    index_body = f"""<article>
<h1>《股路不歸》180 集劇本</h1>
<p class="meta">原著：王新平　·　改編：DCOGAI 研發團隊　·　180 集 × 3 分鐘豎屏短劇</p>

<div class="land">
<b>格式</b>　每集固定四段：<b>鉤子（0–3s）</b>／<b>中段敘事（4–170s）</b>／<b>收尾懸念（170–180s）</b>／<b>本集落點</b>。
單集嚴格 180 秒，豎屏 9:16，低飽和、紀實光影、手持＋固定交替。
</div>

<p>本頁為 180 集正文。第 1 集的<b>逐鏡拍攝版</b>（40 鏡、含生成提示詞與驗收指標）另見
<a href="../ep001.html">第 1 集逐鏡腳本</a>；整體製作方法見 <a href="../index.html">短劇改編</a>。</p>

<p class="meta">全集 Markdown 下載：<a href="../src/juben-180.md">juben-180.md</a></p>

{''.join(rows)}
</article>"""

    (OUT / "index.html").write_text(
        shell("《股路不歸》180 集劇本 · 目錄",
              "180 集豎屏短劇劇本目錄：六大篇、每集標題、本集落點，單集正文可點入。",
              "index.html", index_body), encoding="utf-8")

    (ROOT / "drama" / "src" / "juben-180.md").write_text("\n".join(md_parts), encoding="utf-8")
    print(f"wrote drama/juben/index.html + {len(eps)} episode pages + drama/src/juben-180.md")


if __name__ == "__main__":
    main()