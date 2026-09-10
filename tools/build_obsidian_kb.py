#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_obsidian_kb.py — 把「一起讀紅樓白話」知識庫輸出為 Obsidian 兼容 Markdown。
產出:紅樓夢知識庫/（00-總覽 / 01-人物檔案 / 02-手法 / 03-世系與關係線 / 04-脂批 / 05-金句 / 逐回/第001-120回.md）
特性:YAML frontmatter + tags + [[wikilink]] + 可直接放入 Obsidian vault。
素材來源:honglou_characters.json / honglou_jinju.json / honglou_pingyu.json / honglou_poem.json /
        honglou_yuanwen.json + build_honglou_site.py 的 CH/CURATED。
"""
import json, os, re

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "紅樓夢知識庫")
CHP = os.path.join(ROOT, "build_honglou_site.py")

def load_ch():
    """从 build_honglou_site.py 提取 CH(回目/幕) 与 CURATED(解码)。"""
    import importlib.util
    spec = importlib.util.spec_from_file_location("bhs", CHP)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.CH, mod.CURATED, mod.LABEL_TXT

def rd(name):
    try:
        return json.load(open(os.path.join(ROOT, name), encoding="utf-8"))
    except Exception:
        return {}

CH, CURATED, LABEL_TXT = load_ch()
JINJU = rd("honglou_jinju.json")
PINGYU = rd("honglou_pingyu.json")
POEM = rd("honglou_poem.json")
CHAR = rd("honglou_characters.json")
ACT_NAMES = ["一","二","三","四","五","六","七","八","九"]

def w(rel, content):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "w", encoding="utf-8").write(content)

def fm(title, tags, **kv):
    lines = ["---", f"title: {title}", f"tags: [{', '.join(tags)}]"]
    for k, v in kv.items():
        lines.append(f"{k}: {v}")
    lines.append("---")
    return "\n".join(lines) + "\n\n"

# ---------- 總覽 ----------
def gen_overview():
    rows = "\n".join(
        f"- 第{n:03d}回　{up}　{low}｜幕{ACT_NAMES[act-1]}{'｜●已解碼' if n in CURATED or JINJU.get(str(n)) or PINGYU.get(str(n)) else ''}"
        for n, up, low, act in CH)
    body = fm("紅樓夢知識庫 · 總覽", ["紅樓","解碼","索引"])
    body += "# 紅樓夢知識庫 · 總覽\n\n"
    body += "「一起讀紅樓白話」解碼體系（提問者個人讀法，非紅學/史學共識）。\n\n"
    body += "## 120 回目錄\n\n" + rows + "\n\n"
    body += "## 快速入口\n\n"
    body += "## 體系定位\n\n"
    body += "**家國之書 · 理學之書**。中心思想（第76回妙玉續詩）：「贔屭朝光透，罘罳曉露屯」——朝光透＝朝廷失光走下坡；曉露屯＝閉門反思建設家園；根柢是君臣之道，接《大學》明明德·親民·止於至善。\n\n"
    body += "- [[01-人物檔案]] · [[02-手法]] · [[03-世系與關係線]] · [[04-脂批]] · [[05-金句]] · [[06-體系定位與中心思想]]\n"
    body += "- 逐回:[[第001回]]（每回一頁）\n\n"
    body += "## 關係線（按線判身分）\n\n"
    body += "1. 世系代際線:順治→康熙→胤礽\n2. 兩府矛盾線:胤褆 對 胤礽(兄弟)\n"
    body += "3. 父子線:康熙 對 胤礽/順治\n4. 場所切換:在家＝康熙、出外為官＝雍正\n"
    body += "5. 官場線:賈政提攜賈雨村＝胤礽提攜雍正\n\n"
    body += "> 三生萬物·立體交錯:身分由多重線決定，平面一對一必讀錯。\n"
    w("00-總覽.md", body)

# ---------- 人物檔案 ----------
def gen_char():
    body = fm("人物檔案", ["紅樓","人物","對位"])
    body += "# 人物檔案\n\n> 寧府世系（冷子興明說）為明線可考；榮府人物多為暗線交代。對位為提問者個人讀法。\n\n"
    body += "| 人物 | 歷史對位 | 書內 | 反寫/暗線 |\n|---|---|---|---|\n"
    for name, dd in CHAR.items():
        if name.startswith("_"):
            continue
        body += f"| {name} | {dd.get('qing','')} | {dd.get('book','')} | {dd.get('fanzhuan','')} |\n"
    body += "\n## 手法\n\n"
    for k, v in CHAR.get("_手法", {}).items():
        body += f"- **{k}**:{v}\n"
    w("01-人物檔案.md", body)

# ---------- 手法 ----------
def gen_shoufa():
    body = fm("手法總表", ["紅樓","手法","解碼方法"])
    body += "# 手法總表\n\n> 作者用以迷惑讀者、隱藏真相的寫作手法。\n\n"
    body += "| 手法 | 表面 | 實指 | 讀法 |\n|---|---|---|---|\n"
    for k, v in CHAR.get("_手法", {}).items():
        body += f"| **{k}** | — | {v} | — |\n"
    body += "\n## 五條關係線（按線判身分）\n\n"
    body += "1. **世系代際線**：順治→康熙→胤礽（冷子興演說標第二代/第三代）\n"
    body += "2. **兩府矛盾線**：胤褆 對 胤礽（兄弟；康熙是她們的父親）\n"
    body += "3. **父子線**：康熙 對 胤礽／順治（賈政 對 賈寶玉）\n"
    body += "4. **場所切換**：在家＝康熙、出外為官＝雍正\n"
    body += "5. **官場線**：賈政提攜賈雨村＝胤礽提攜雍正\n\n"
    body += "> ⚠ 三生萬物·立體交錯：身分由多重線決定，平面一對一必讀錯。\n"
    w("02-手法.md", body)

# ---------- 體系定位與中心思想 ----------
def gen_center():
    body = fm("體系定位與中心思想", ["紅樓","體系定位","中心思想","理學"])
    body += "# 【作者定位】閨閣之事（表） · 宮牆之內（裡）\n\n> **紅樓＝紫禁城外牆之紅色**——書名已指宮牆，非尋常人家之樓。表層寫**閨閣之事**（大旨談情，作者自掩之辭），裡層是**宮牆之內**的權力與對話。寫書者是**行走南書房的人**——近臣能入宮庭、聞核心對話；明末清初文人等外人，無從爆出紫禁城的核心對話內容。作者復借第1回石兄與空空道人的對話自述定稿方向：要把《石頭記》**修改為「理學之書」**。\n\n"
    body += "## 中心思想（第76回妙玉續詩）\n\n"
    body += "> **「贔屭朝光透，罘罳曉露屯」**\n\n"
    body += "**不在第1回、不在第5回**（第1回是開卷敘事總綱、第5回是判詞總綱）。\n\n"
    body += "| 層 | 內容 |\n|---|---|\n"
    body += "| **字面** | **上句「朝光透」寫國運之衰**——朝光漸透，朝廷光華將盡，國步已入頹途；**下句「曉露屯」寫救亡之志**——曉露方屯，閉門自省，思挽狂瀾於既倒，出灰暗而重築家園 |\n"
    body += "| **義理** | 化用《岳陽樓記》「先天下之憂而贔屭，後天下之樂而罘罳」——贔屭＝憂、罘罳＝樂 |\n"
    body += "| **根柢** | 非士大夫專屬之憂樂觀，乃**君臣之道**——歸於《大學》三綱，綱各領一義：**明明德**（朝光將晦，憂而思明其德）、**親民**（曉露方屯，閉門自省以安民興家）、**止於至善**（挽狂瀾於既倒，重築家園，終止於至善） |\n\n"
    body += "## 家國同構\n\n"
    body += "- **寧國府＝國**（世系＝清帝世系）\n- **榮國府＝家**（內外戚分列）\n"
    body += "- **大觀園三層**：①國家層面＝國家版圖 ②個人層面＝自己的花園 ③康熙層面＝康熙後來交給雍正的圓明園\n\n"
    body += "## 與紅學的分野\n\n"
    body += "**非謂紅學無功，乃所治者異**：彼問作者，本站問文本；彼以考據為徑，本站以方言為鑰——各有其明，亦各有其限；兩途不必相非，唯求於書有所得耳。\n\n"
    body += "| 　 | 紅學 | 本站 |\n|---|---|---|\n"
    body += "| **所問** | 誰寫的？曹家事（作者與家世） | **書中寫的是什麼**（文本義理與歷史對位） |\n"
    body += "| **作者** | 曹雪芹（江南織造家文人）——**外人，無從知宮中核心對話** | **行走南書房的人**（近臣）——書中能爆出紫禁城核心對話，正見作者身份 |\n"
    body += "| **所憑** | 考據：生平、家世、版本源流 | 版本對勘＋**方言** |\n"
    body += "| **所限** | 諸先生皆非廣府人，於廣府白話**未嘗深究**——加密之白話少所解 | 他方言能解多少，**不敢妄斷** |\n"
    body += "| **路徑** | 脂批**取以為證據**（指認作者與家世），**未循為路標**（問這一句在說什麼）——**路標在側而未由，讀者之路遂偏** | **以脂批為路標** |\n\n"
    body += "**白話＝方言**：白話是留存在各地的方言；**各方言區的讀者讀書中白話各有能解，所解各異**。廣府白話（含廣府地區農民的土話）比之他方言，**只是能解讀的字義多些**——非謂惟廣府可解。\n\n"
    body += "**路標之例**：「此玉非彼玉，代字有弓弦影」「再出一芹一脂」諸批，本是指人身分的密碼，卻多被讀成作者的簽名。\n\n"
    body += "## 文內鉤子\n\n"
    body += "第1回石兄與空空道人的對話（實係胤礽與順治的對話）即交代要把《石頭記》"
    body += "**修改為「理學之書」**——以風月小說的外殼包住君臣之道的義理。\n"
    w("06-體系定位與中心思想.md", body)

# ---------- 世系與關係線 ----------
def gen_shixi():
    body = fm("世系與關係線", ["紅樓","世系","關係線"])
    body += "# 世系與關係線\n\n"
    body += "## 寧國府世系 ＝ 清帝世系\n\n"
    body += "| 代 | 書中 | 歷史 |\n|---|---|---|\n"
    body += "| 1 | 賈演（寧國公） | 努爾哈赤 |\n| 2 | 賈代化 | 皇太極 |\n"
    body += "| 3 | 賈敬 | 順治 |\n| 4 | 賈珍 | 康熙 |\n| 5 | 賈蓉 | 胤礽（太子） |\n\n"
    body += "## 榮國府世系 · 內外戚分列\n\n"
    body += "### 內戚（賈家本支＝皇室正統，被刻意降為背景）\n"
    body += "- 賈源（榮國公）＝清開國一系 · 賈代善（第二代）＝實說皇太極\n"
    body += "- 賈母（太夫人）＝孝莊：「太夫人尚在」＝幼年胤礽被孝莊寵（書中用賈母寵寶玉交代）\n"
    body += "- 賈赦（長房）＝胤褆 · 賈政（二房）＝第三代此段＝順治\n"
    body += "- 賈珠＝康熙（年輕）· 賈寶玉＝胤礽（平時）/順治（出家）· 賈璉＝未廢胤礽 · 賈蘭＝胤礽\n\n"
    body += "### 外戚（外姓姻親＝雍正線/康熙後宮，被升格為主角）\n"
    body += "- 史家:史湘雲＝胤祥（蒙古血統）\n- 王家:王夫人＝康熙（慈母+狠心）、王熙鳳＝孝莊/康熙/老八複合\n"
    body += "- 薛家:薛姨媽＝康熙（雍正線）、薛寶釵＝雍正、薛蟠＝胤褆+胤礽\n"
    body += "- 林家:林如海＝康熙（不同身分）、林黛玉＝胤礽（早年）/胤祥雙魂\n\n"
    body += "## 判別線圖（按線判身分）\n\n"
    body += "| 線 | 書中表現 | 歷史對位 | 判別依據 |\n|---|---|---|---|\n"
    body += "| ①世系代際線 | 冷子興演說第二代/第三代 | 賈政＝順治 | 標代際時 |\n"
    body += "| ②兩府矛盾線 | 賈赦 對 賈政 | 胤褆 對 胤礽(兄弟) | 兄弟相爭時 |\n"
    body += "| ③父子線 | 賈政 對 寶玉 | 康熙 對 胤礽/順治 | 父子相對時 |\n"
    body += "| ④場所切換 | 在家/出外為官 | 康熙/雍正 | 外任時 |\n"
    body += "| ⑤官場線 | 賈政提攜賈雨村 | 胤礽提攜雍正 | 官場往來時 |\n"
    body += "\n> ⚠ 關係理解錯就讀錯史事：此線賈政≠康熙；只有賈政與寶玉相對時，賈政才是康熙。\n"
    w("03-世系與關係線.md", body)

# ---------- 脂批 ----------
def gen_pingyu():
    body = fm("脂批路標", ["紅樓","脂批","路標"])
    body += "# 脂批路標\n\n> 脂批是路標——只收真實批語引文（帶出處），絕不臆造。\n\n"
    for k in sorted(PINGYU, key=lambda x: int(x) if x != "_说明" else 0):
        if k == "_说明":
            continue
        body += f"\n## 第{k}回\n\n"
        for it in PINGYU[k]:
            t = it['text']
            src = it.get('src','')
            body += f"- {t}\n" if (src and src in t) else f"- {t}（{src}）\n"
    w("04-脂批.md", body)

# ---------- 金句 ----------
def gen_jinju():
    body = fm("每回金句", ["紅樓","金句"])
    body += "# 每回金句\n\n> 金句採通行本文字（本站原文為混合底本轉錄，不宜逐字抽取）。\n\n"
    for k in sorted(JINJU, key=lambda x: int(x) if x != "_说明" else 0):
        if k == "_说明":
            continue
        body += f"\n## 第{k}回\n\n"
        for q, note in JINJU[k]:
            body += f"- 「{q}」— {note}\n"
    w("05-金句.md", body)

# ---------- 逐回 ----------
def gen_hui():
    for n, up, low, act in CH:
        parts = []
        parts.append(fm(f"第{n}回　{up}　{low}", ["紅樓", "解碼"], hui=n, act=ACT_NAMES[act-1],
                        status="已解碼" if (n in CURATED or JINJU.get(str(n)) or PINGYU.get(str(n))) else "待解碼"))
        parts.append(f"# 第{n}回　{up}　{low}\n")
        parts.append(f"幕:{ACT_NAMES[act-1]} ｜ [[00-總覽|回總覽]]\n")
        # 中心思想所在回
        if n == 76:
            parts.append("> **本回妙玉續詩「贔屭朝光透，罘罳曉露屯」＝全書中心思想**（見 [[06-體系定位與中心思想]]）\n\n")
        # 金句
        if JINJU.get(str(n)):
            parts.append("## 本回金句\n")
            for q, note in JINJU[str(n)]:
                parts.append(f"- 「{q}」— {note}\n")
        # 解码
        dec = CURATED.get(n)
        if dec:
            parts.append("## 解碼軌\n")
            for t, x in dec:
                parts.append(f"- {LABEL_TXT.get(t, t)} {x}\n")
        # 脂批
        if PINGYU.get(str(n)):
            parts.append("## 脂批路標\n")
            for it in PINGYU[str(n)]:
                t = it['text']; src = it.get('src','')
                parts.append(f"- {t}\n" if (src and src in t) else f"- {t}（{src}）\n")
        # 诗词
        if POEM.get(str(n)):
            parts.append("## 詩詞解讀\n")
            for name_, txt in POEM[str(n)]:
                parts.append(f"- **{name_}** — {txt}\n")
        # 人物点评槽
        parts.append("## 人物點評\n【待填】\n")
        w(f"逐回/第{n:03d}回.md", "".join(parts))

def main():
    gen_overview(); gen_char(); gen_shoufa(); gen_shixi(); gen_center(); gen_pingyu(); gen_jinju(); gen_hui()
    files = sum(len(fs) for _, _, fs in os.walk(OUT))
    print(f"Obsidian 知識庫已生成: {OUT}")
    print(f"文件數: {files}（00-總覽/01-人物/02-手法/03-世系/04-脂批/05-金句 + 120 逐回）")

if __name__ == "__main__":
    main()
