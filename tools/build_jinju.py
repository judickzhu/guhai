#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_jinju.py — 生成「金句庫 → 劇本」對照頁（drama/jinju.html）

來源：drama/src/jinju.json（由 chapters/*.html 的「原文名句」「心理學錨點」抽出）
用途：把原著金句接進 180 集劇本，並標明「誰來說」。

原則（本頁核心）：
    原著是第一人稱莊家自白，語氣是「我操控你」。
    劇本主角是有底線的機構操盤手，直接引用會把主角寫成原著那個惡莊。
    所以金句只有三種合法用法：反用（交給反派）／判詞（作者視角）／證詞（交給被收割者）。
"""
import html
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "drama" / "src" / "jinju.json"
OUT = ROOT / "drama" / "jinju.html"
PREFIX = "../"

NAV = [
    ("index.html", "首頁"), ("chapters/000.html", "股路不归問答"), ("phenomena.html", "現象索引"),
    ("checklist.html", "自檢表"), ("framework.html", "框架"), ("mapping.html", "三層映射"),
    ("acts.html", "六幕"), ("gudao/000.html", "股道問答"), ("drama/index.html", "短劇改編"),
    ("dc-kb.html", "DC知識庫"), ("kb.html", "知識庫檢索"),
]

# ---------- 12 條人物判詞（改寫自原文金句，附來源回次）----------
PANCI = [
    ("王红军", "機構操盤手・雙面人格",
     "刀在手中，義在錢前。\n殺得盡對手，殺不盡自己的心。",
     "001・014", "1、2、9、11、36、180"),
    ("王老实", "父親・道義基石",
     "一袋錢搭在肩膀上，人長錢短。\n他這輩子沒碰過股票，卻看懂了全部。",
     "005", "3、13、56、87"),
    ("王秀蓮", "二姐・情感錨點",
     "她不懂 K 線，只記得正月初五。\n一碗麵兩個蛋，是她能給的全部戰場。",
     "014（生日台詞）", "4、14、38、56、87"),
    ("小周", "技術創世・術的一端",
     "他能剝離所有噪聲，\n唯獨剝不掉自己寫的那把刀。",
     "000・014", "29–31、36、40、165"),
    ("老胡", "首席風控・壓艙石",
     "他守住每一條線，\n卻守不住人心往貪裡走。",
     "048・118", "12、23、33、55、88"),
    ("山子", "主力交易員・尖刀",
     "他信盤感勝過規則，\n市場只用一次回撤，就教會他什麼叫怕。",
     "033", "4、12、23、34、44"),
    ("小马", "輿情操盤手",
     "他知道故事能拉動行情，\n也知道故事最後會吃掉講故事的人。",
     "000・096", "7、19、52–53、58"),
    ("阿凯", "助理・內鬼",
     "第一筆錢到手那天，他已經不是自己了。\n他賣的不是情報，是回家的路。",
     "118・094", "11、18、28、41、46–51"),
    ("林知秋", "稽查・法理線",
     "她手裡的尺量得出違規，量不出人心。\n她追得上證據，追不上貪婪。",
     "041・094", "5、9、20、35、45、71"),
    ("凯恩", "跨境資本・終極反派",
     "他不恐懼，因為他製造恐懼。\n他不貪婪，因為他收割貪婪。",
     "000", "5、25、39、52、78、178"),
    ("陈老太", "散戶錨點",
     "她把養老的錢交給了故事，\n故事沒有還她。",
     "019", "1、8、21、65、75–77"),
    ("陈默", "量化外包工程師・證人",
     "他只寫了一段套利代碼，\n卻在裡面看見了自己的指紋。",
     "014", "151、155、160、164、175"),
]

# ---------- 六篇讖語（原文直引）----------
CHEN = [
    ("第一篇", "黃土歸城・人工坐莊", "1–30",
     "「我有个习惯，每次大战结束，我总是想去散户最多的证券大厅转转，我不知道为什么，但是我有这个习惯。」",
     "007", "—— 王红军隔著玻璃看散戶大廳，出處就在這裡。這句是全劇的方法論。"),
    ("第二篇", "數智啟元・代碼刀鋒", "31–60",
     "「我们就是操纵市场价格的人，我们的资金进出是发生在技术指标之前。」",
     "014", "—— 給凱恩說；或讓王红军在深夜獨白時說半句，然後自己否掉。"),
    ("第三篇", "跨市狂瀾", "61–90",
     "「这样没有命的往下跌，带来的不是机会而是恐惧，你能不能把握一下那些要被你害死的人的心理反应啊。」",
     "024", "—— 陳老太爆倉後，王红军對著盤面說。這是全劇唯一一次他情緒失控。"),
    ("第四篇", "混沌荒原", "91–120",
     "「从心理上的攻击一直到情绪上的操纵，直至在你的灵魂深处造成刻骨铭心地打击。」",
     "094", "—— 荒原段落的核心；加密市場就是把這句話工業化。"),
    ("第五篇", "暗莊潛行", "121–150",
     "「这些可爱的经济学家和股评人士，正好用他们善良的良心，为我当了一次非常合格的帮凶。」",
     "077", "—— 偽市值管理的全部邏輯，一句話說完。給凱恩。"),
    ("第六篇", "黑箱高頻", "151–180",
     "「股市上人们追求的是群体安全感，而不是独立自主的见解。」",
     "122", "—— 終章判詞。ETF 與量化的群體安全感，正是黑箱的溫床。"),
]

# ---------- 場景對照：金句怎麼用、誰來說 ----------
SCENES = [
    ("開場・K 線即血", "「我站在 K 線圖面前的時候，我看到不是紅色顏料，而是一滴滴紅色血液。」", "000",
     "畫外音（王红军，第 1 集鉤子之後）", "反用：他先說出這句話，再用行動否定它"),
    ("洗盤・震出浮籌", "「散户恐慌性抛盘一出来，就像山洪暴发一样。」", "003",
     "山子（興奮）", "反派腔調交給隊友，觀眾才知道這行多冷"),
    ("派發・留逃生口", "「善良的人们永远也不会明白，最后的这种上涨就是为了刺激他们那种欲望而设的陷阱。」", "019",
     "王红军（低聲，對著空盤面）", "判詞：他知道陷阱，卻只能放慢派發"),
    ("看散戶大廳", "「我有个习惯，每次大战结束，我总是想去散户最多的证券大厅转转。」", "007",
     "王红军（對林知秋解釋自己的習慣）", "這句讓「隔玻璃看人」有了出處"),
    ("稽查上門", "「你要是劝他们注意风险，他们就会教育你：你懂什么？」", "048",
     "林知秋（苦笑）", "證詞：連稽查都勸不動，法理線的無力感"),
    ("內鬼第一次收錢", "「这好比一个小偷，你要偷偷摸摸地离开，很容易被人抓住。」", "118",
     "阿凯（心裡）", "證詞：他自己知道回不去了"),
    ("輿情造勢", "「人们的热情一旦消退，整个操纵计划就很容易失败，热点越是明显的时候越要速战速决。」", "096",
     "小马（覆述凱恩的話）", "反用：把敵人的方法論念出來"),
    ("資方逼槓桿", "「谁坚持到最后谁就是赢家，这是心理的较量。」", "006",
     "出資方（談判桌）", "反用：同一句話，甲方說出來就是催命"),
    ("陳老太爆倉", "「这样没有命的往下跌，带来的不是机会而是恐惧。」", "024",
     "陳老太（對著手機）", "證詞：她複述的是自己的葬禮"),
    ("風控會議", "「化繁為簡，安全賺錢！」", "001",
     "老胡（白板前，第 24 集理念課）", "全劇唯一的「正」金句，且極短——適合做片頭字幕"),
    ("凱恩登場", "「他们深知恐惧对人的影响力是巨大的，所以最喜欢干的就是沽空。」", "000",
     "凱恩（英文，字幕）", "反派判詞，一次講完他的商業模式"),
    ("終章", "「市场永不落幕。」（原文改寫自 133・134 之價值投資與趨勢投機並行）", "133",
     "王红军（最終台詞，接「股路，不歸」）", "收於空：他沒有贏，只是還在"),
]

THEMES = [
    ("道與術", ["工具", "算法", "技术", "武器", "刀", "术", "道", "软"]),
    ("親情與鄉土", ["父亲", "姐姐", "家", "窑洞", "煤油灯", "生日", "母亲", "娘"]),
    ("恐懼", ["恐惧", "害怕", "恐慌"]),
    ("貪婪", ["贪婪", "贪", "欲望", "利欲"]),
    ("消息與輿論", ["消息", "谣言", "股评", "故事", "新闻", "媒体"]),
    ("莊家與操縱", ["庄家", "主力", "坐庄", "操纵", "控盘"]),
    ("紀律與風控", ["止损", "纪律", "风险", "仓位", "安全"]),
    ("散戶與虧損", ["散户", "老百姓", "养老", "韭菜", "亏损"]),
    ("法與稽查", ["监管", "违规", "违法", "查处", "调查", "证据"]),
    ("終局與輪迴", ["归", "空", "宿命", "轮回", "永远", "命"]),
]


def clean(t: str) -> str:
    return re.sub(r"\s+", "", t)


def shell(title: str, desc: str, body: str) -> str:
    nav = "".join(
        f'<a href="{PREFIX}{h}"{" class=active" if lab == "短劇改編" else ""}>{lab}</a>'
        for h, lab in NAV)
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
<meta property="og:url" content="https://judickzhu.github.io/guhai/drama/jinju.html">
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
 main{{max-width:900px;margin:0 auto;padding:0 18px 80px}}
 h2{{margin-top:2.2em;border-bottom:1px solid var(--line,#e5e5e5);padding-bottom:.3em}}
 .pc{{border:1px solid var(--line,#e3e3e3);border-left:4px solid #b08a3e;border-radius:0 10px 10px 0;
      padding:.9em 1.1em;margin:1em 0;background:rgba(190,160,70,.05)}}
 .pc b{{font-size:1.05em}}
 .pc .ver{{white-space:pre-line;font-size:1.02em;line-height:1.85;margin:.45em 0 .5em;color:#333}}
 .pc .src{{color:#999;font-size:.82em}}
 .tablewrap{{overflow-x:auto}}
 table{{border-collapse:collapse;width:100%;font-size:.9em}}
 th,td{{border:1px solid var(--line,#e0e0e0);padding:.5em .6em;vertical-align:top;text-align:left}}
 th{{background:rgba(128,128,128,.10);white-space:nowrap}}
 q{{quotes:"「" "」"}}
 details{{margin:.8em 0;border:1px solid var(--line,#e3e3e3);border-radius:8px;padding:.5em .9em}}
 summary{{cursor:pointer;font-weight:600}}
 .cnt{{color:#888;font-weight:400;font-size:.88em}}
 .q{{padding:.35em 0;border-bottom:1px dashed rgba(128,128,128,.18);font-size:.93em;line-height:1.6}}
 .q i{{color:#999;font-style:normal;font-size:.85em;margin-right:.5em}}
 .rule{{padding:.8em 1.1em;border-radius:10px;background:rgba(128,128,128,.08);margin:1.2em 0;font-size:.95em;line-height:1.8}}
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
  <p>免責與合規：本頁金句引自《股路不归》原文，僅供劇本改編與風險教育使用；劇本情節為藝術虛構，不構成任何投資建議。投資有風險，入市須謹慎。</p>
</footer>
</body>
</html>
"""


def main() -> None:
    rows = json.load(open(DATA, encoding="utf-8"))
    quotes = [r for r in rows if r["kind"] == "quote"]

    # 判詞
    panci_html = "".join(
        f'<div class="pc"><b>{html.escape(w)}</b>　<span class="cnt">{html.escape(role)}</span>'
        f'<div class="ver">{html.escape(ver)}</div>'
        f'<div class="src">原文來源：第 {html.escape(src)} 回　·　建議出現集數：{html.escape(eps)}</div></div>'
        for w, role, ver, src, eps in PANCI)

    # 讖語
    chen_rows = "".join(
        f'<tr><td>{a}<br><span class="cnt">{b}</span></td><td>{c}</td>'
        f'<td><q>{html.escape(q.strip("「」"))}</q><br><span class="cnt">第 {src} 回</span></td>'
        f'<td class="cnt">{html.escape(note)}</td></tr>'
        for a, b, c, q, src, note in CHEN)

    # 場景
    scene_rows = "".join(
        f'<tr><td>{html.escape(sc)}</td>'
        f'<td><q>{html.escape(q.strip("「」"))}</q><br><span class="cnt">第 {src} 回</span></td>'
        f'<td>{html.escape(who)}</td><td class="cnt">{html.escape(note)}</td></tr>'
        for sc, q, src, who, note in SCENES)

    # 金句庫（去重後按主題分組，可重複歸類）
    seen, uniq = set(), []
    for r in quotes:
        k = clean(r["text"])
        if k in seen:
            continue
        seen.add(k)
        uniq.append(r)
    grouped, used = {}, set()
    for name, kws in THEMES:
        hit = [r for r in uniq if any(k in r["text"] for k in kws)]
        grouped[name] = hit
        used |= {id(r) for r in hit}
    rest = [r for r in uniq if id(r) not in used]
    grouped["其他"] = rest

    lib = []
    for name, _ in THEMES + [("其他", [])]:
        items = grouped.get(name, [])
        if not items:
            continue
        body = "".join(
            f'<div class="q"><i>第 {r["chap"]} 回</i>{html.escape(clean(r["text"]))}</div>'
            for r in items)
        lib.append(f'<details><summary>{name} <span class="cnt">（{len(items)} 條）</span></summary>{body}</details>')

    body = f"""<article>
<h1>金句庫 → 劇本用法</h1>
<p class="meta" style="color:#888">原著：王新平　·　改編：DCOGAI 研發團隊　·　來源：本站「股路不归問答」136 回之原文名句（{len(uniq)} 條去重）</p>

<div class="rule">
<b>先說一個陷阱：原著金句不能直接塞進主角嘴裡。</b><br>
原著是第一人稱莊家自白——「我操控你」「我最喜歡聽哀樂」「講故事就能收割」。
劇本的主角卻是一個有底線的機構操盤手。直接引用，等於把他寫成原著裡那個惡莊，人物就塌了。<br><br>
所以金句只有三種合法用法：<br>
① <b>反用</b>　—— 交給反派（凱恩）或隊友的「反派腔」，讓觀眾聽見這個行業的冷。<br>
② <b>判詞</b>　—— 作者視角，做成片頭／片尾字幕卡，不是任何角色在說話。<br>
③ <b>證詞</b>　—— 交給被收割的人（陳老太、阿凱、陳默），金句變成他們的語言，而不是加害者的台詞。
</div>

<h2>一、十二條人物判詞</h2>
<p class="cnt">每一條都改寫自原文，不是原句直引；改寫是為了讓它從「莊家自白」變成「命運預言」。</p>
{panci_html}

<h2>二、六篇讖語（原文直引）</h2>
<p class="cnt">每篇開頭 10 秒用，字幕卡形式，作者視角。這是把「理念」從說教變成讖語的最低成本做法。</p>
<div class=tablewrap><table>
<thead><tr><th>篇</th><th>集數</th><th>原文金句</th><th>用法</th></tr></thead>
<tbody>{chen_rows}</tbody></table></div>

<h2>三、場景對照：哪一句、給誰說</h2>
<div class=tablewrap><table>
<thead><tr><th>場景</th><th>建議金句</th><th>誰說</th><th>用法</th></tr></thead>
<tbody>{scene_rows}</tbody></table></div>

<h2>四、全部金句（{len(uniq)} 條，按主題摺疊）</h2>
<p class="cnt">同一句可能歸入多個主題；「第 N 回」可點回對應問答頁查上下文。</p>
{''.join(lib)}

<h2>五、怎麼把金句變成台詞（三個操作）</h2>
<ol>
<li><b>砍到 20 字以內。</b>原文多是 40–80 字的長句，直接念會像旁白。只留最鋒利的那一個分句。</li>
<li><b>加一個動作。</b>金句不能空口說。讓說話的人同時在做某件事（收盤、關燈、數錢、簽字），話才有重量。</li>
<li><b>每集最多一句。</b>180 集就是 180 句，已經足夠。多用一句，這部劇就從「電影」變成「金句集」。 </li>
</ol>
</article>"""

    OUT.write_text(shell("金句庫 → 劇本用法 · 《股路不歸》短劇改編",
                         "把《股路不归》136 回原文名句接進 180 集劇本：12 條人物判詞、六篇讖語、場景對照，與全部金句檢索。",
                         body), encoding="utf-8")
    print(f"wrote drama/jinju.html（金句 {len(uniq)} 條，判詞 {len(PANCI)}，場景 {len(SCENES)}）")


if __name__ == "__main__":
    main()