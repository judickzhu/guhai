#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_honglou_site.py — 《红楼梦》逐回解读网站生成器
參照 https://judickzhu.github.io/guhai/ 的站形（header 導航/檢索/字號/夜間、逐回獨立頁、搜索數據）。
讀 tools/honglou_mentions.json（總綱逐回素材）→ 生成 ../honglou/ 靜態站（repo 根下）。

用法（在本檔所在 tools/ 目錄外任何位置皆可）：
    python3 tools/build_honglou_site.py
依賴：opencc-python-reimplemented（pip install opencc-python-reimplemented）；未裝則不轉繁、原樣輸出。

自填槽位（提問者填，AI 不代筆）：
    tools/honglou_char_review.json  人物點評
    tools/honglou_poem_review.json  詩詞解讀（120 回已預開空槽）
填完重跑本檔即入卡。
结构：index / framework / characters / chapters/000 + 001..120 / search-data.js / style.css / app.js
内容纪律：解码轨素材逐条标注【用户原话】或【AI 扩展·待核】；无素材回显示【待解码】占位，不硬编。
"""
import json, os, re, html, shutil

# ---------------- 繁體統轉：全站以繁體為唯一底色（古籍白話文需要繁體支撐）----------------
try:
    import opencc as _opencc
    _CC = _opencc.OpenCC("s2t")
except Exception:
    _CC = None

# 保護字：古籍／人名專用，一律不轉
_PROTECT = ["占", "致", "蒙", "週"]   # 占(占旺相/神簽占)、致(致禍/景致)、蒙(蒙蔽/蒙恩)、週(賈存周)
_PH = {c: "\uE000%03d" % i for i, c in enumerate(_PROTECT)}

# 後校正：OpenCC 誤轉／異體統一
_FIX = [
    ("待覈", "待核"), ("覈", "核"),
    ("太後", "太后"), ("剋制", "克制"), ("剋", "克"),
    ("矇", "蒙"),
    ("存週", "存周"), ("週", "周"),
    ("佔", "占"),
    ("胤礽係", "胤礽系"), ("雍正係", "雍正系"), ("實係", "實系"),
    ("爲", "為"), ("羣", "群"), ("峯", "峰"), ("脣", "唇"), ("迴", "回"),
    ("裏", "裡"), ("着", "著"),
]

def T(x):
    """簡→繁統轉（古籍保護字 + 後校正）。未裝 opencc 則原樣返回。"""
    if not _CC or not x:
        return x
    for c, ph in _PH.items():
        x = x.replace(c, ph)
    x = _CC.convert(x)
    for c, ph in _PH.items():
        x = x.replace(ph, c)
    for a, b in _FIX:
        if a in x:
            x = x.replace(a, b)
    return x

ROOT = os.path.dirname(os.path.abspath(__file__))   # 本檔所在 tools/
REPO = os.path.dirname(ROOT)                        # repo 根（guhai/，即站點根）
OUT  = os.path.join(REPO, "honglou")                # 輸出：站點 honglou/

def _f(name):
    """數據檔定位：先 tools/（權威），再 repo 根（兼容舊位置）。"""
    for d in (ROOT, REPO):
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    return os.path.join(ROOT, name)

MEN  = _f("honglou_mentions.json")
DLG  = _f("honglou_dialogue_clean.json")
CHR  = _f("honglou_char_review.json")   # 人物點評（提問者自填位）
POEM = _f("honglou_poem_review.json")   # 詩詞解讀（提問者自填位）

# ---------------- 120 回数据：回目（程乙本通行）+ 幕 ----------------
# 幕：1-5 一 · 6-18 二 · 19-36 三 · 37-54 四 · 55-69 五 · 70-80 六 · 81-98 七 · 99-110 八 · 111-120 九
CH = [
 (1,"甄士隐梦幻识通灵","贾雨村风尘怀闺秀",1),(2,"贾夫人仙逝扬州城","冷子兴演说荣国府",1),
 (3,"托内兄如海荐西宾","接外孙贾母惜孤女",1),(4,"薄命女偏逢薄命郎","葫芦僧乱判葫芦案",1),
 (5,"贾宝玉神游太虚境","警幻仙曲演红楼梦",1),(6,"贾宝玉初试云雨情","刘姥姥一进荣国府",2),
 (7,"送宫花贾琏戏熙凤","宴宁府宝玉会秦钟",2),(8,"贾宝玉奇缘识金锁","薛宝钗巧合认通灵",2),
 (9,"恋风流情友入家塾","起嫌疑顽童闹学堂",2),(10,"金寡妇贪利权受辱","张太医论病细穷源",2),
 (11,"庆寿辰宁府排家宴","见熙凤贾瑞起淫心",2),(12,"王熙凤毒设相思局","贾天祥正照风月鉴",2),
 (13,"秦可卿死封龙禁尉","王熙凤协理宁国府",2),(14,"林如海灵返苏州郡","贾宝玉路谒北静王",2),
 (15,"王凤姐弄权铁槛寺","秦鲸卿得趣馒头庵",2),(16,"贾元春才选凤藻宫","秦鲸卿夭逝黄泉路",2),
 (17,"大观园试才题对额","荣国府归省庆元宵",2),(18,"皇恩重元妃省父母","天伦乐宝玉呈才藻",2),
 (19,"情切切良宵花解语","意绵绵静日玉生香",3),(20,"王熙凤正言弹妒意","林黛玉俏语谑娇音",3),
 (21,"贤袭人娇嗔箴宝玉","俏平儿软语救贾琏",3),(22,"听曲文宝玉悟禅机","制灯谜贾政悲谶语",3),
 (23,"西厢记妙词通戏语","牡丹亭艳曲警芳心",3),(24,"醉金刚轻财尚义侠","痴女儿遗帕惹相思",3),
 (25,"魇魔法叔嫂逢五鬼","通灵玉蒙蔽遇双真",3),(26,"蜂腰桥设言传心事","潇湘馆春困发幽情",3),
 (27,"滴翠亭杨妃戏彩蝶","埋香冢飞燕泣残红",3),(28,"蒋玉菡情赠茜香罗","薛宝钗羞笼红麝串",3),
 (29,"享福人福深还祷福","多情女情重愈斟情",3),(30,"宝钗借扇机带双敲","龄官画蔷痴及局外",3),
 (31,"撕扇子作千金一笑","因麒麟伏白首双星",3),(32,"诉肺腑心迷活宝玉","含耻辱情烈死金钏",3),
 (33,"手足耽耽小动唇舌","不肖种种大承笞挞",3),(34,"情中情因情感妹妹","错里错以错劝哥哥",3),
 (35,"白玉钏亲尝莲叶羹","黄金莺巧结梅花络",3),(36,"绣鸳鸯梦兆绛芸轩","识分定情悟梨香院",3),
 (37,"秋爽斋偶结海棠社","蘅芜苑夜拟菊花题",4),(38,"林潇湘魁夺菊花诗","薛蘅芜讽和螃蟹咏",4),
 (39,"村姥姥是信口开河","情哥哥偏寻根究底",4),(40,"史太君两宴大观园","金鸳鸯三宣牙牌令",4),
 (41,"贾宝玉品茶栊翠庵","刘姥姥醉卧怡红院",4),(42,"蘅芜君兰言解疑癖","潇湘子雅谑补余香",4),
 (43,"闲取乐偶攒金庆寿","不了情暂撮土为香",4),(44,"变生不测凤姐泼醋","喜出望外平儿理妆",4),
 (45,"金兰契互剖金兰语","风雨夕闷制风雨词",4),(46,"尴尬人难免尴尬事","鸳鸯女誓绝鸳鸯偶",4),
 (47,"呆霸王调情遭苦打","冷郎君惧祸走他乡",4),(48,"滥情人情误思游艺","慕雅女雅集苦吟诗",4),
 (49,"琉璃世界白雪红梅","脂粉香娃割腥啖膻",4),(50,"芦雪庵争联即景诗","暖香坞雅制春灯谜",4),
 (51,"薛小妹新编怀古诗","胡庸医乱用虎狼药",4),(52,"俏平儿情掩虾须镯","勇晴雯病补雀金裘",4),
 (53,"宁国府除夕祭宗祠","荣国府元宵开夜宴",4),(54,"史太君破陈腐旧套","王熙凤效戏彩斑衣",4),
 (55,"辱亲女愚妾争闲气","欺幼主刁奴蓄险心",5),(56,"敏探春兴利除宿弊","贤宝钗小惠全大体",5),
 (57,"慧紫鹃情辞试忙玉","慈姨妈爱语慰痴颦",5),(58,"杏子阴假凤泣虚凰","茜纱窗真情揆痴理",5),
 (59,"柳叶渚边嗔莺咤燕","绛芸轩里召将飞符",5),(60,"茉莉粉替去蔷薇硝","玫瑰露引来茯苓霜",5),
 (61,"投鼠忌器宝玉瞒赃","判冤决狱平儿行权",5),(62,"憨湘云醉眠芍药裀","呆香菱情解石榴裙",5),
 (63,"寿怡红群芳开夜宴","死金丹独艳理亲丧",5),(64,"幽淑女悲题五美吟","浪荡子情遗九龙佩",5),
 (65,"贾二舍偷娶尤二姨","尤三姐思嫁柳二郎",5),(66,"情小妹耻情归地府","冷二郎一冷入空门",5),
 (67,"见土仪颦卿思故里","闻秘事凤姐讯家童",5),(68,"苦尤娘赚入大观园","酸凤姐大闹宁国府",5),
 (69,"弄小巧用借剑杀人","觉大限吞生金自逝",5),(70,"林黛玉重建桃花社","史湘云偶填柳絮词",6),
 (71,"嫌隙人有心生嫌隙","鸳鸯女无意遇鸳鸯",6),(72,"王熙凤恃强羞说病","来旺妇倚势霸成亲",6),
 (73,"痴丫头误拾绣春囊","懦小姐不问累金凤",6),(74,"惑奸谗抄检大观园","矢孤介杜绝宁国府",6),
 (75,"开夜宴异兆发悲音","赏中秋新词得佳谶",6),(76,"凸碧堂品笛感凄清","凹晶馆联诗悲寂寞",6),
 (77,"俏丫鬟抱屈夭风流","美优伶斩情归水月",6),(78,"老学士闲征姽婳词","痴公子杜撰芙蓉诔",6),
 (79,"薛文龙悔娶河东狮","贾迎春误嫁中山狼",6),(80,"美香菱屈受贪夫棒","王道士胡诌妒妇方",6),
 (81,"占旺相四美钓游鱼","奉严词两番入家塾",7),(82,"老学究讲义警顽心","病潇湘痴魂惊恶梦",7),
 (83,"省宫闱贾元妃染恙","闹闺阃薛宝钗吞声",7),(84,"试文字宝玉始提亲","探惊风贾环重结怨",7),
 (85,"贾存周报升郎中任","薛文起复惹放流刑",7),(86,"受私贿老官翻案牍","寄闲情淑女解琴书",7),
 (87,"感秋声抚琴悲往事","坐禅寂走火入邪魔",7),(88,"博庭欢宝玉赞孤儿","正家法贾珍鞭悍仆",7),
 (89,"人亡物在公子填词","蛇影杯弓颦卿绝粒",7),(90,"失绵衣贫女耐嗷嘈","送果品小郎惊叵测",7),
 (91,"纵淫心宝蟾工设计","布疑阵宝玉妄谈禅",7),(92,"评女传巧姐慕贤良","玩母珠贾政参聚散",7),
 (93,"甄家仆投靠贾家门","水月庵掀翻风月案",7),(94,"宴海棠贾母赏花妖","失宝玉通灵知奇祸",7),
 (95,"因讹成实元妃薨逝","以假混真宝玉疯颠",7),(96,"瞒消息凤姐设奇谋","泄机关颦儿迷本性",7),
 (97,"林黛玉焚稿断痴情","薛宝钗出闺成大礼",7),(98,"苦绛珠魂归离恨天","病神瑛泪洒相思地",7),
 (99,"守官箴恶奴同破例","阅邸报老舅自担惊",8),(100,"破好事香菱结深怨","悲远嫁宝玉感离情",8),
 (101,"大观园月夜警幽魂","散花寺神签占异兆",8),(102,"宁国府骨肉病灾祲","大观园符水驱妖孽",8),
 (103,"施毒计金桂自焚身","昧真禅雨村空遇旧",8),(104,"醉金刚小鳅生大浪","痴公子余痛触前情",8),
 (105,"锦衣军查抄宁国府","骢马使弹劾平安州",8),(106,"王熙凤致祸抱羞惭","贾太君祷天消祸患",8),
 (107,"散余资贾母明大义","复世职政老沐天恩",8),(108,"强欢笑蘅芜庆生辰","死缠绵潇湘闻鬼哭",8),
 (109,"候芳魂五儿承错爱","还孽债迎女返真元",8),(110,"史太君寿终归地府","王凤姐力诎失人心",8),
 (111,"鸳鸯女殉主登太虚","狗彘奴欺天招伙盗",9),(112,"活冤孽妙尼遭大劫","死雠仇赵妾赴冥曹",9),
 (113,"忏宿冤凤姐托村妪","释旧憾情婢感痴郎",9),(114,"王熙凤历幻返金陵","甄应嘉蒙恩还玉阙",9),
 (115,"惑偏私惜春矢素志","证同类宝玉失相知",9),(116,"得通灵幻境悟仙缘","送慈柩故乡全孝道",9),
 (117,"阻超凡佳人双护玉","欣聚党恶子独承家",9),(118,"记微嫌舅兄欺弱女","惊谜语妻妾谏痴人",9),
 (119,"中乡魁宝玉却尘缘","沐皇恩贾家延世泽",9),(120,"甄士隐详说太虚情","贾雨村归结红楼梦",9),
]
CN = "一二三四五六七八九"

def cn_hui(n):
    """1..120 → 中文数字（用于「第X回」检索变体）。"""
    d0 = "零一二三四五六七八九"
    if n <= 10:
        return d0[n] if n != 10 else "十"
    if n < 20:
        return "十" + (d0[n-10] if n % 10 else "")
    if n < 100:
        tens, ones = n // 10, n % 10
        return d0[tens] + "十" + (d0[ones] if ones else "")
    if n == 100: return "一百"
    if n < 110: return "一百" + d0[n-100]
    if n < 120: return "一百" + d0[(n-100)//10] + "十" + (d0[n%10] if n%10 else "")
    return "一百二十"
ACT_TITLES = {
 1:("總綱：神話框架 · 護官符 · 太虛幻境","通靈上位總宣示：甄士隱=順治/胤礽、賈雨村=康熙/雍正"),
 2:("鼎盛鋪陳：劉姥姥進府 · 可卿之喪 · 省親","奪嫡前夜：可卿病重=太子瀕廢、協理寧國府=胤禩上位"),
 3:("情竇深化：花解語 · 葬花 · 挨打","奪嫡混戰：學堂=上書房、金麒麟=太子信物"),
 4:("群芳鼎盛：詩社 · 兩宴大觀園 · 元宵夜宴","表面最盛=權力制衡期（37/38 回詩詞有史評密碼）"),
 5:("內囊漸起：理家 · 尤氏姐妹悲劇","改革條款=財政血書、尤二姐吞金=廢太子結局"),
 6:("敗象顯露：抄檢 · 晴雯夭亡 · 芙蓉誄","中秋聯詩（76 回）=全書解碼樞紐、寒塘渡鶴影=胤祥"),
 7:("後四十回上：黛死釵嫁 · 元妃薨","登基後補錄段（胤祥病逝致後 40 回不完整）"),
 8:("查抄敗落 · 賈母歸天","參與者後人修改補錄段"),
 9:("散場：寶玉卻塵緣 · 歸結紅樓夢","甄士隱詳說太虛情=順治佛眼觀紅樓"),
}

# ---------------- 精选解码轨（手工,标注来源） ----------------
# 每条 (label, text)：label ∈ U=用户原话 / A=AI 扩展·待核 / B=总纲语料转述
CURATED = {
1:[("U","回目即解密標籤：「甄士隱」=禛事隱（雍正胤禛之事被隱去），「夢幻通靈上位」暗喻順治出家與康熙即位；全回以「假語村言」回顧康熙從順治朝接掌權柄的上位經歷。"),
    ("U","甄士隱雙身分：出家時=順治、見雨村時=胤礽（拉雍正入太子黨之因由）；不辭而別時雨村=雍正（脫離太子黨另有企圖）。"),
    ("U","〈好了歌〉=順治對紅塵的迷戀放不下。"),
    ("U","甄士隱稟性恬淡、不以功名為念（「自是羲皇上人，便可作是書之朝代年紀矣」）——這是交代出家的順治寫自傳。"),
    ("U","第一回空空道人問石兄，即妙玉問黛玉：是黛玉幫妙玉不合情理的初稿修改，曹雪芹增刪十載；石兄與空空道人的對話實系交代胤礽與順治的對話。")],
2:[("U","「賈夫人」三字分拆理解，與林如海皆用不同身分交代實說康熙；「敏」借用了胤祥之母名。"),
    ("U","地理密碼：揚州城=勝利者的紫禁城；金陵城=失敗者。府邸密碼：榮國府=家族這邊，寧國府=繼承皇權那邊。"),
    ("U","冷子興演說榮國府=交代康熙上至努爾哈赤、下至太子胤礽的關係圖。"),
    ("U","嬌杏四步政治隱線：回看＝胤礽與雍正少年有結合／拉攏；下訂＝康熙最終選擇雍正線，廢胤礽，權力改向；娶＝雍正與胤祥組成核心政治組合；發跡＝賈雨村入仕得勢，雍正由隱位入局，最終成帝。"),
    ("U","拆字：嬌＝胤礽（柔弱、克制、唔肯政變）；杏＝胤祥（退讓、奉獻、唔再相鬥）；嬌杏＝兩種「唔狠」的歷史命運。"),
    ("U","解讀重點唔係「嬌杏等於邊個」，而係作者借嬌杏、雨村、下訂、娶呢一組情節，交代皇權組合嘅組成；一句總結：嬌杏回看是開始、雨村下訂是康熙廢太子、雨村娶杏是雍正胤祥組合；分工：嬌杏負責「交代」（點），英蓮／香菱負責「貫穿」（線），唔可以混為一談。")],
3:[("U","胤礽拉雍正入局（奪嫡）；收養黛玉的結局大概訴說胤礽與雍正主僕位置互換了。"),
    ("U","黛玉進京實是交代順治進京（終極解碼框架）；賈雨村教黛玉讀書，是指雍正小時候教過胤祥的事——這些隱藏鏈是十年增刪的結果。"),
    ("U","第三回入府代表太子入局：賈政=康熙（望子成龍、教子無方），賈母=孝莊太后。"),
    ("A","甲戌本第三回「代玉」眉批「此玉非彼玉」與胤祥「不是太子卻行太子之權」的史實契合度，屬待驗證技術層面。")],
4:[("U","薄命女遇薄命郎=胤礽胤祥關係拉近；葫蘆僧判葫蘆案=順治建議康熙廢胤礽。"),
    ("A","以一場地方官司的「小葫蘆案」模擬並控訴決定帝國命運的「大葫蘆案」——康熙晚年的繼統危機。")],
5:[("U","寶玉遊太虛幻境=孝莊選了康熙接班順治及登基的事。"),
    ("A","警幻仙子（及金陵十二釵冊籍）代表孝莊太后的意志與政治布局。"),
    ("U","王熙鳳判詞（第五回）整體定位：實是說康熙晚年的繼位問題，不是鳳姐個人命運；王熙鳳身分多重正好承載此主題——弄權鐵檻寺／管家病倒＝康熙；鳳姐兒（同輩）、璉二奶奶（上位後）＝胤禩；對賈瑞時的長輩身分＝孝莊；第四十四回潑醋主場＝胤礽（被廢者）。"),
    ("U","判詞逐句：「凡鳥偏從末世來」凡鳥合起來是「鳳」，鳳指孝莊，凡鳥說順治出家；「末世來」末世＝明朝末年，來＝大清入關。次句「都知愛慕此生才」＝諸皇子皆覬覦大位。第三句「一從二令三人木」＝一順治出家、二康熙二次廢太子、三九子奪嫡兄弟相殘。末句「哭向金陵事更哀」＝九子奪嫡斷了清朝龍脈。"),
    ("U","金陵是指清金陵，不是南京（當事人的圈子）。"),
    ("U","斷龍脈實是說從此走向衰敗，最終走向滅亡。"),
    ("U","結論：乾隆鋪張浪費，所以清朝走向失敗是必然的。（判詞「一從」提問者作「一徔」。）")],
6:[("U","雲雨情=康熙與胤礽的母親；一進大觀園=通過劉姥姥視角目睹胤礽的榮華富貴。"),
    ("A","「鳳哥」此段暗寫皇太極後期的孝莊（海蘭珠是姐姐，王的夫人是姑姑）；後文王熙鳳更多分身為康熙或毒辣的老八。")],
7:[("U","送宮花解九連環；秦鍾與寶玉實說是胤礽與康熙（此處寶玉也是康熙分身）。"),
    ("A","「送宮花」=後宮勢力的分配與博弈；「解九連環」=破解複雜政治困局的象徵。")],
8:[("U","寶釵是雍正，賈寶玉是胤礽——核心人物歷史指向在本回定標。"),
    ("A","金鎖與通靈玉的「金玉良緣」並提=雍正與胤礽既關聯又競爭的政治關係；本回是太子黨內部結構演變的關鍵節點。")],
9:[("B","胤礽與胤褆的矛盾由小時候學堂開始——家塾即上書房的微型權力場。")],
10:[("B","金寡婦貪利=說胤褆這邊；秦可卿病重=胤礽被廢前。張友士論病細窮源，病在可卿亦病在寧府。")],
11:[("B","鳳姐兒欣賞園中景致=胤禩看中太子之位；賈瑞起淫心=胤褆的躁動。")],
12:[("B","風月寶鑑正反兩面=「假作真」主題的照妖鏡；賈瑞（胤褆向）正照貪念而亡。")],
13:[("U","秦可卿死封龍禁尉=胤礽被廢、鬱死於「龍」的禁忌；王熙鳳協理寧國府=老八上位協助康熙。"),
    ("A","北靜王路祭可卿恰合胤祥十三阿哥身份——「十三」即怡親王行次。")],
19:[("U","林子洞小耗子偷香芋故事——權力盜竊本質的終極揭露。"),
    ("A","「黛山林子洞」：黛山明指黛玉，林子洞諧「臨淄洞」——齊以盜聞名（莊子·胠篋），借地名暗示黛玉所代表的「盜」本質。")],
26:[("A","第二十六回「金如鐵、鐵血奪權」：馮紫英帶青傷登場，說「三月二十八日跟著父親去鐵網山打圍去了」——滿洲皇室塞外打圍=最高級權力博弈，鐵網山=前太子（義忠親王）命運終結的墳場、又係奪嫡集團磨刀霍霍的戰場；暗藏廢太子的血色倒計時。")],
27:[("A","庚辰本第二十七回「黛玉」：「黛」藏「代」（篆書）+「黑」=胤礽被污「黑心狂疾」。")],
28:[("U","寶玉藥方文字考據：以葠音苫（甲戌本同苫、白話粵語非參）、龜讀鳩、三百六十兩不足龜大何首烏=一廢再立 360（兩廢兩立胤礽）。"),
    ("A","「毒死書」諧音「讀死書」——AI 不可偽造脂批、改標點過度解讀。")],
31:[("U","鳳姐不是胤礽，璉二奶奶是；金麒麟相當於太子、未來的主人。"),
    ("A","「因麒麟伏白首雙星」：湘雲撿到寶玉的金麒麟；麒麟作為祥瑞既預示湘雲姻緣，又暗伏怡親王金印麒麟鈕。")],
37:[("A","海棠社=胤禩倒台（1715）至胤祥主政（1722）七年過渡期的文學造影。"),
    ("A","湘雲詠白海棠「自是霜娥偏愛冷」：「霜娥」拆字「雨單我」=胤祥號孤臣；黛玉「偷來梨蕊三分白」：「梨蕊」諧「離瑞」。")],
38:[("A","第三十八回「林瀟湘魁奪菊花詩」明寫重陽節（九月九日）詠菊；菊花詩/螃蟹詠帶史評密碼。")],
45:[("A","金蘭契互剖衷腸=胤祥密告雍正、助其穩固地位的「隱性支持」；表面閨閣閒談，實則主僕同心。")],
48:[("A","香菱苦吟學詩=恰合胤祥文史造詣——雍正敕令其編《古今圖書集成》卻嘔血猝死；香菱學詩實為胤祥理政的變形記。")],
55:[("A","探春理家=胤祥代理戶部試水（康熙 61 年）；賈璉稱「三姑娘歷練」。"),
    ("A","「吳新登」諧「無新凳」（再無新主登基）；趙國基之死=八爺黨（阿其那）的政治屍斑；改革三策 vs 胤祥財政革命（攤丁入畝、耗羨歸公）。"),
    ("A","寶釵蘅蕪苑監察=雍正密建監控體系；「蘅蕪」藏「橫錮」（鉗制）；「年終散錢給媽媽們」=耗羨銀養廉制度收買耳目。")],
56:[("A","「敏探春興利除宿弊」與「賢寶釵小惠全大體」=胤祥財政改革與雍正監察的一體兩面；竹園承包/稻田分產對應整頓鹽課、免賦稅，皆有死亡代價。")],
63:[("A","湘雲「英豪闊大寬宏量」=胤祥「性行賢良」「忠誠體國」的陽剛政治人格；醉眠芍藥裀的灑脫=胤祥以實幹著稱。")],
62:[("A","第六十二回湘雲醉眠芍藥裀側寫其「英豪闊大，磊落風流」；「乜斜著眼」與第二十八回馮紫英唱曲時「乜斜」對讀——或非醉態而是戲謔挑眉動作，字音字形層的待核線索。")],
74:[("A","抄檢大觀園=雍正五年織造虧空案（曹頫革職抄家）雛形；「繡春囊」=私調兵符的鐵證（康熙五十年帳殿夜警）。"),
    ("A","司棋姓秦（第七十四回），秦可卿亦姓秦——太虛幻境「主淫」寓太子淫亂案；「司棋死棋音同，作者血淚」。")],
76:[("U","碾毒骨為墨，修補第七十六回蛀洞——文字考據級投入。"),
    ("U","第七十六回交代了修改者是誰：石兄與空空道人對話告知修改的因；黛玉湘雲與妙玉三十五韻聯詩——石兄黛玉=胤礽、空空道人妙玉=順治、湘雲=胤祥。"),
    ("U","第76回黛玉湘雲與妙玉的對話，早就告訴你作者是誰：方言是流落民間的白話文，廣州話裏贔屭=香港人說的閉翳；拋開方言解釋，三個貝=狠有錢，加尸字頭=一個死人給你有錢才叫人贔屭；不思加网=教人如何反思。"),
    ("A","凹晶館聯詩至「寒塘渡鶴影，冷月葬花魂」時妙玉出現續貂十三韻——妙玉（空空道人/情僧/順治）象徵性地對全書最終命運與意旨作「裁定」與「升華」。"),
    ("A","第十三元韻與女媧煉石音義相關——總綱第十七部分主軸（妙玉十三韻=順治定評）。")],
97:[("A","黛玉焚稿=雍正元年銷毀胤礽手稿；「寶玉你好…」暗斥雍正偽善；絳珠還淚=胤礽兩立兩廢的政淚血債。")],
98:[("A","苦絳珠魂歸離恨天=胤礽幽死；病神瑛淚灑相思地=胤祥累死——「權力絞肉機吞噬雙生魂」。")],
105:[("B","「錦衣軍查抄寧國府」=雍正對胤禩、胤禟集團及其黨羽殘酷抄家、圈禁的直接映射；查抄賈府對應雍正六年曹頫抄家清單。")],
113:[("A","劉姥姥（佟佳氏勢力）最終「救」了巧姐（胤礽血脈/皇統）=隆科多家族支持雍正勝出的文學反照。")],
119:[("A","寶玉出家=「雙重奏鳴」：順治對孝莊的政治決裂（出世原型）+ 胤礽對康熙的還淚絕望（入世幻滅）。")],
120:[("A","妙玉（順治）佛眼觀紅樓：大荒山無稽崖=五台山行宮、通靈寶玉=順治留給康熙的傳國璽、絳珠還淚=董鄂妃轉世報恩。"),
    ("A","甄士隱詳說太虛情=順治以妙玉之身寫就的「愛新覺羅罪己錄」歸結。")],
}
LABEL_TXT = {"U":"【用户原话】","A":"【AI 扩展·待核】","B":"【总纲语料转述】"}

def cn(n):
    return CN[n-1]

# ---------------- 读取逐回素材 ----------------
def load_mentions():
    if not os.path.exists(MEN): return {}
    d = json.load(open(MEN, encoding="utf-8"))
    return d  # {回号str: [ {text, user, ...} ]}

MENT = load_mentions()
try:
    DLG_DATA = json.load(open(DLG, encoding="utf-8"))["data"]
except Exception:
    DLG_DATA = {}
try:
    CHAR_REVIEW = json.load(open(CHR, encoding="utf-8"))
except Exception:
    CHAR_REVIEW = {}
try:
    POEM_REVIEW = json.load(open(POEM, encoding="utf-8"))
except Exception:
    POEM_REVIEW = {}

def has_material(n):
    if n in CURATED: return True
    if str(n) in DLG_DATA and (DLG_DATA[str(n)]["user"] or DLG_DATA[str(n)]["ai"]): return True
    return str(n) in MENT and len(MENT[str(n)]) > 0

def auto_snippets(n, limit=3, maxlen=120):
    """无精选时从对话素材(用户原话优先) + 总纲 mentions 取素材。"""
    out = []
    seen = set()
    d = DLG_DATA.get(str(n))
    if d:
        for t in d["user"] + d["ai"]:
            t = re.sub(r"\s+", " ", t).strip()
            t = re.split(r" --- |\n\||\| ", t)[0]  # 剥 markdown 表格/分隔碎片
            key = re.sub(r"[\s，。！？、；：]","",t)[:40]
            if not t or key in seen: continue
            seen.add(key)
            if len(t) > maxlen: t = t[:maxlen] + "…"
            out.append(("U" if t in d["user"] else "A", t))
            if len(out) >= limit: break
    if len(out) < limit:
        items = MENT.get(str(n), [])
        items = sorted(items, key=lambda s: (0 if s.get("user") else 1))
        for it in items:
            if len(out) >= limit: break
            t = re.sub(r"\s+", " ", it.get("text", "")).strip()
            key = re.sub(r"[\s，。！？、；：]","",t)[:40]
            if not t or key in seen: continue
            seen.add(key)
            if len(t) > maxlen: t = t[:maxlen] + "…"
            out.append(("U" if it.get("user") else "A", t))
    return out

# ---------------- 页面框架（参照 guhai：header 导航/检索/字号/主题） ----------------
NAV = [("index.html","首頁"),("chapters/000.html","逐回目錄"),("framework.html","解讀框架"),
       ("characters.html","人物對標"),("index.html#acts","九幕")]
def nav_html(active, sub):
    pre = "../" if sub else ""
    items = []
    for href, label in NAV:
        if label == active: items.append(f'<a class="act" href="{href}">{label}</a>')
        else: items.append(f'<a href="{pre}{href}">{label}</a>')
    return (
      f'<header><div class="bar"><a class="brand" href="{pre}index.html">紅樓解讀</a>'
      f'<nav>{"".join(items)}</nav></div>'
      f'<div class="tools"><input id="q" placeholder="檢索全部回目…" onkeyup="if(event.key==\'Enter\')searchSite()">'
      f'<button onclick="searchSite()">檢索</button>'
      f'<span class="spacer"></span>'
      f'<button class="tbtn" onclick="setSize(\'s\')" title="小字">A</button>'
      f'<button class="tbtn" onclick="setSize(\'m\')" title="中字">A</button>'
      f'<button class="tbtn" onclick="setSize(\'l\')" title="大字">A</button>'
      f'<button class="tbtn" onclick="toggleTheme()" id="themeBtn">◐</button></div>'
      f'<div id="sr" class="sr hidden"></div></header>')

FOOT = ('<footer><p>紅樓解讀 · 索隱解碼體系整理站。站內「歷史對位/字音字形」均為<strong>提問者個人讀法</strong>，'
        '非紅學或史學界共識；【用户原话】保留原話、【AI 扩展·待核】為 AI 引申待查證。'
        '回目引文依原書通行本（程乙本），不作學術定本之爭。</p></footer>')

def page(title, desc, body, active="", sub=False, prefix=""):
    pre = "../" if sub else ""
    return f'''<!DOCTYPE html>
<html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}｜紅樓解讀</title>
<meta name="description" content="{html.escape(desc)}">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(desc)}">
<meta property="og:type" content="website">
<link rel="stylesheet" href="{pre}style.css">
<script>var PREFIX="{prefix}";</script>
</head><body>
{nav_html(active, sub)}
<main>
{body}
</main>
{FOOT}
<script src="{pre}app.js"></script>
<script src="{pre}search-data.js"></script>
<script src="{pre}zi-hao-data.js"></script>
<script src="{pre}zi-hao.js"></script>
</body></html>'''

def esc(s): return html.escape(s, quote=False)

# ---------------- 逐回卡片 ----------------
def hui_card(n):
    num, up, low, act = CH[n-1]
    status = "has" if has_material(n) else "none"
    rows = []
    # 回目定位行
    rows.append(f'<p class="crumbs">第 {CN[act-1]} 幕（{ACT_TITLES[act][0]}）'
                f' · <span class="st st-{status}">{"● 已有解碼素材" if status=="has" else "○ 待解碼"}</span></p>')
    rows.append(f'<h1>第{n}回</h1><p class="subtitle">{esc(up)}　{esc(low)}</p>')
    # 解码轨素材
    dec = CURATED.get(n) or auto_snippets(n)
    if dec:
        items = "".join(f'<li><span class="tag">{LABEL_TXT.get(t,t)}</span> {esc(x)}</li>' for t, x in dec)
        rows.append(f'<section><h2>解碼軌 · 歷史對位與字音字形</h2><ul class="dec">{items}</ul>'
                    '<p class="note">素材出自《紅樓夢解讀總綱·整理版》與 DeepSeek 對話記錄（deepseek_對話提取）對應回目段；'
                    '【用户原话】為提問者親授、【AI 扩展·待核】為引申待查證。</p></section>')
    else:
        rows.append('<section><h2>解碼軌 · 歷史對位與字音字形</h2>'
                    '<p class="placeholder">【待解碼】總綱尚未覆蓋本回；框架已就位，內容後續填補。'
                    '占位期間不硬編任何歷史對標。</p></section>')
    # 人物点评（提问者自填位）
    chrs = CHAR_REVIEW.get(str(n))
    if chrs:
        items = "".join(f'<li><b>{esc(p)}</b> — {esc(c)}</li>' for p, c in chrs)
        rows.append(f'<section><h2>人物點評</h2><ul class="chars">{items}</ul>'
                    '<p class="note">點評為提問者自填（honglou_char_review.json），非 AI 代筆。</p></section>')
    else:
        rows.append('<section class="fillme"><h2>人物點評</h2>'
                    '<p class="placeholder">【待填】此槽位留給提問者逐人點評本回出場人物——'
                    '在 honglou_char_review.json 填寫後重跑生成即入卡；未填不代筆。</p></section>')
    # 詩詞解讀（提問者自填位）
    pms = POEM_REVIEW.get(str(n))
    if pms:
        pitems = "".join(f'<li><b>{esc(a)}</b> — {esc(b)}</li>' for a, b in pms)
        rows.append(f'<section><h2>詩詞解讀</h2><ul class="poems">{pitems}</ul>'
                    '<p class="note">解讀為提問者自填（honglou_poem_review.json），非 AI 代筆。</p></section>')
    else:
        rows.append('<section class="fillme"><h2>詩詞解讀</h2>'
                    '<p class="placeholder">【待填】此槽位留給提問者解讀本回詩詞——'
                    '在 honglou_poem_review.json 填寫後重跑生成即入卡；未填不代筆。</p></section>')
    # 待填字段骨架（文学轨等,后续增量）
    rows.append('<section class="fillme"><h2>文學軌與其餘字段（待填）</h2>'
                '<p class="placeholder">逐回卡九字段：一句定位／情節提要／出場人物／關鍵細節與伏筆／'
                '歷史解碼層／詩詞金句／存疑與版本／前後勾連／一句話結論——'
                '此骨架先立結構，內容逐回後補。</p></section>')
    # 前后翻页
    prev, nxt = "", ""
    if n > 1: prev = f'<a href="{n-1:03d}.html">← 第{n-1}回</a>'
    if n < 120: nxt = f'<a href="{n+1:03d}.html">第{n+1}回 →</a>'
    rows.append(f'<nav class="pn">{prev}<a href="000.html">目錄</a>{nxt}</nav>')
    return "\n".join(rows)

def ch_body(n):
    num, up, low, act = CH[n-1]
    return hui_card(n)

# ---------------- 首页 ----------------
def index_body():
    has_cnt = sum(1 for n, *_ in CH if has_material(n))
    act_links = []
    for a in range(1, 10):
        lo, hi = 1 if a==1 else (6 if a==2 else (19 if a==3 else (37 if a==4 else (55 if a==5 else (70 if a==6 else (81 if a==7 else (99 if a==8 else 111))))))), (5 if a==1 else (18 if a==2 else (36 if a==3 else (54 if a==4 else (69 if a==5 else (80 if a==6 else (98 if a==7 else (110 if a==8 else 120))))))))
        lit, dec = ACT_TITLES[a]
        act_links.append(f'<a class="actcard" href="chapters/000.html#a{a}"><b>第 {CN[a-1]} 幕</b>'
                         f'<span class="r">{lo}–{hi} 回</span><i>{esc(lit)}</i><em>{esc(dec)}</em></a>')
    recent_covered = [n for n,*_ in CH if has_material(n)]
    covered_chips = "".join(f'<a href="chapters/{n:03d}.html">{n}</a>' for n in recent_covered)
    return f'''
<section class="hero">
<h1>紅樓夢 · 逐回解讀</h1>
<p class="lead">以「一回一卡、雙軌並行、九幕定位」為秩序，把《紅樓夢解讀總綱》的索隱解碼體系，
逐回落進固定框架——先有結構，內容漸次填補，不再零散。</p>
<div class="cards">
  <a class="card" href="framework.html"><b>解讀框架</b><i>四條秩序規則 · 每回九字段模板 · 120 回進度表</i></a>
  <a class="card" href="chapters/000.html"><b>逐回目錄</b><i>120 回總表：幕／素材狀態／成卡進度（{has_cnt}/120 已有素材）</i></a>
  <a class="card" href="characters.html"><b>人物對標</b><i>九子奪嫡對標速查：寶玉／黛玉／寶釵／湘雲／鳳姐／妙玉…</i></a>
</div>
<div class="stat"><b>{has_cnt}</b> 回已有解碼素材 · <b>{120-has_cnt}</b> 回待解碼（占位不硬編） · 全站可檢索</div>
</section>
<section id="acts"><h2>全書九幕（總坐標）</h2><div class="actgrid">{"".join(act_links)}</div></section>
<section><h2>已解碼回目（素材入口）</h2><p class="chips">{covered_chips}</p>
<p class="note">章回後期（81–120 回）素材稀少，屬正常——總綱原以「前 80 回解碼」為重，後 40 回多為補錄段，待後續對話增補。</p></section>
'''

# ---------------- 框架页 ----------------
def framework_body():
    tpl = ["一句定位（本回在九幕中的功能）","情節提要（3–5 句，通識可讀）","出場人物（主要出場＋關係變化）",
           "關鍵細節與伏筆（草蛇灰線）","解碼軌 · 歷史對位（逐條標【用户原话】/【AI 扩展·待核】）",
           "解碼軌 · 字音字形（諧音／拆字／粵語考據）","詩詞金句（含讖語燈謎聯句）",
           "存疑與版本（版本差異／證據缺口／不過度解讀）","一句話結論（文學軌＋解碼軌各一句）"]
    lis = "".join(f'<li><b>{i+1}.</b> {t}</li>' for i, t in enumerate(tpl))
    rules = ["一回一卡：字段順序固定，新發現寫進對應字段，不另起爐灶",
             "雙軌並行：文學軌（通識）與解碼軌（索隱）分列，不混寫",
             "全書定位：每回標註所屬幕，不脫離總坐標",
             "誠實邊界：來源必標；無素材回目寫「待解碼」，不硬編"]
    rul = "".join(f"<li>{r}</li>" for r in rules)
    acts = "".join(f'<tr><td>第 {CN[a-1]} 幕</td><td class="r">{lo}–{hi}</td><td>{esc(lit)}</td><td>{esc(dec)}</td></tr>'
                   for a,(lo,hi,lit,dec) in [
        (1,(1,5)+ACT_TITLES[1]), (2,(6,18)+ACT_TITLES[2]), (3,(19,36)+ACT_TITLES[3]), (4,(37,54)+ACT_TITLES[4]),
        (5,(55,69)+ACT_TITLES[5]), (6,(70,80)+ACT_TITLES[6]), (7,(81,98)+ACT_TITLES[7]), (8,(99,110)+ACT_TITLES[8]), (9,(111,120)+ACT_TITLES[9])])
    # 全書總綱 · 凹晶館聯詩：全詩居中，每聯（兩句）一行
    _zg = ["香篆鎖金鼎，脂冰腻玉盆。", "簫憎婺婦泣，衾倩待儿温。", "空賬悬文鳳，間屏掩彩鸳。",
           "露濃臺更滑，霜重竹難捫。", "猶步螢行沼，還等寂厲原。", "石奇神鬼搏，木怪虎狼蹲。",
           "贔屭 朝 光透，罘罳 曉露 屯。", "振林千樹鳥，啼玉一聲猿。", "岐熟寕忘徃，泉知不問原。",
           "鐘鸣櫳翠寺，鷄唱稻香村。", "有興悲何继，無愁意豈烦。", "芳情只自遣，雅趣向誰言。",
           "徹旦休雲倦，烹茶更細論。"]
    _coup = "\n".join(_zg)
    return f'''
<h1>逐回解讀框架</h1>
<section><h2>全書總綱 · 中秋夜大觀園即景聯句（凹晶館聯詩）</h2>
<p class="lead">提問者按：此詩為<strong>全書總綱</strong>——全書歷史密碼之濃縮，非第 76 回回內詩，亦非第一幕框架（神話框架 · 護官符 · 太虛幻境）。全詩為黛玉、湘雲中秋凹晶館聯句，妙玉補筆續成並抄錄。</p>
<div class="zonggang-poem">{_coup}</div>
<p class="dim">（原詩逐字保留；解讀為提問者自填，非 AI 代筆。解密詞「贔屭」「罘罳」連空格原貌保留。）</p>
</section>
<section><h2>四條秩序規則</h2><ul class="plain">{rul}</ul></section>
<section><h2>每回卡片模板（九字段固定）</h2><ol class="plain tpl">{lis}</ol></section>
<section><h2>全書九幕分期</h2><table class="acts"><tr><th>幕</th><th>回目</th><th>文學軌主題</th><th>解碼軌主題（提問者體系）</th></tr>{acts}</table></section>
<section><h2>與總綱的對接</h2><p>總綱 23 個「部分」＝論據庫（按主題）；本站 120 卡＝索引層（按回）。
卡片解碼軌末尾可註「總綱第 X 部分」以便回查。新對話產生的新解碼，落進對應回卡並更新素材／完成度。</p></section>
'''

# ---------------- 人物对标页 ----------------
CHAR_ROWS = [
 ("賈寶玉（通靈玉）","胤礽為主；兼順治／康熙／雍正分身","「假作真時真亦假」：一人多身是常態"),
 ("林黛玉","胤礽（早年）；與胤祥「絳珠雙生魂」複合","淚盡=政治生命枯竭；焚稿=雍正銷毀胤礽手稿"),
 ("薛寶釵","雍正（胤禛）","金鎖對通靈=金玉良緣並提"),
 ("史湘雲","胤祥（怡親王）","金麒麟=太子信物；寒塘渡鶴影=胤祥"),
 ("王熙鳳","孝莊＋康熙＋毒辣老八（複合）","璉二奶奶=胤礽（用户原話：鳳姐不是胤礽，璉二奶奶是）"),
 ("秦可卿","胤礽（瀕廢/被廢前）","死封龍禁尉=鬱死於「龍」的禁忌"),
 ("香菱（英蓮）","胤礽×胤祥 雙魂","眉心痣=胤礽、學詩癡態=胤祥"),
 ("晴雯","康熙亡（角色退場）／胤礽分身","芙蓉誄=胤礽哀悼康熙；80 回前停筆"),
 ("妙玉／空空道人／癩頭和尚","順治","妙玉十三韻=順治定評全書"),
 ("北靜王","胤祥（十三阿哥）","路祭可卿恰合十三行次"),
 ("賈瑞／金寡婦","胤褆（大阿哥）","正照風月鑑=貪念；金寡婦貪利=胤褆那邊"),
 ("賈母（史太君）","孝莊（象徵性權威源頭）","喜惡即風向標，不直接行政"),
 ("探春","胤祥（代理戶部/理家）","興利除弊=財政改革"),
 ("巧姐","胤礽血脈／皇統","劉姥姥（佟佳氏勢力）相救=隆科多支持雍正之反照"),
 ("甄士隱","順治（出家時）／胤礽（見雨村時）","「禛事隱」雙身分"),
 ("賈雨村","康熙／雍正","「假語村言」回顧上位經歷"),
 ("吳新登／趙國基","八爺黨殘餘（胤禩舊部）","「無新凳」=再無新主登基；趙國基=阿其那"),
]
def characters_body():
    trs = "".join(f'<tr><td>{esc(a)}</td><td>{esc(b)}</td><td class="dim">{esc(c)}</td></tr>' for a,b,c in CHAR_ROWS)
    return f'''
<h1>人物對標速查</h1>
<p class="lead">下表為提問者索隱體系的人物─歷史對位（<strong>個人讀法，非共識</strong>）。
紅樓人物「一人多身、一字多音、真相唯一」，同一角色可有多個歷史投影，隨情節階段切換。</p>
<table class="chars"><tr><th>書中人物</th><th>歷史對位（提問者讀法）</th><th>備註</th></tr>{trs}</table>
<section><h2>核心口訣</h2><ul class="plain">
<li>寶玉／黛玉／可卿／香菱／晴雯＝胤礽系（太子）</li>
<li>寶釵／雨村／鶴＝雍正系（胤禛）</li>
<li>湘雲／北靜王＝胤祥系（怡親王）</li>
<li>鳳姐＝孝莊／康熙／老八 複合體</li>
<li>妙玉／空空道人＝順治（過來人／局外高人）</li>
</ul></section>
'''

# ---------------- 目录页（000） ----------------
def catalog_body():
    sections = []
    for a in range(1, 10):
        nums = [c for c in CH if c[3] == a]
        rows = []
        for n, up, low, act in nums:
            st = "●" if has_material(n) else "○"
            rows.append(f'<a class="crow st-{"has" if has_material(n) else "none"}" href="{n:03d}.html">'
                        f'<b>{n:03d}</b><span>{esc(up)}　{esc(low)}</span><i>{st}</i></a>')
        lo, hi = nums[0][0], nums[-1][0]
        lit, dec = ACT_TITLES[a]
        sections.append(f'<section id="a{a}"><h2>第 {CN[a-1]} 幕 · {lo}–{hi} 回</h2>'
                        f'<p class="dim">{esc(lit)}</p><div class="clist">{"".join(rows)}</div></section>')
    return f'''<h1>逐回目錄</h1>
<p class="lead">● = 總綱已有解碼素材（點入見卡）　○ = 待解碼（框架占位，不硬編）。每回獨立成卡，字段固定。</p>
{"".join(sections)}'''

# ---------------- 子嗥知识库（zi-hao-data.js） ----------------
def zi_hao_data():
    """生成 window.ZiHaoKB 红楼梦知识库：人物对标/判词/九幕/每回解码 + 手工规则问答。"""
    cats = []
    # 1) 每回解码条目
    hui_qa = []
    for n, up, low, act in CH:
        dec = CURATED.get(n) or auto_snippets(n, limit=2)
        if dec:
            a = "；".join(x for _, x in dec)[:420]
            kws = []
            for w in re.findall(r"[一-龥]{2,6}", up + low):
                if len(w) >= 2 and w not in kws: kws.append(w)
                if len(kws) >= 6: break
            hui_qa.append({
                "q": f"第{n}回 講咩",
                "a": f"第{n}回《{up}　{low}》：{a}",
                "keywords": [f"第{n}回", f"第{cn_hui(n)}回"] + kws,
                "ref": f"chapters/{n:03d}.html",
            })
    cats.append({"id": "hui", "title": "逐回解碼", "qa": hui_qa})

    # 2) 人物对标条目（从 characters_body 的 CHAR_ROWS）
    char_qa = []
    for a, b, c in CHAR_ROWS:
        name = re.sub(r"（.*?）", "", a)
        kws = [name]
        if len(name) >= 3:
            kws.append(name[-2:])
        kws.append(b.split("／")[0][:4])
        char_qa.append({"q": f"{name} 係邊個",
                        "a": f"{a}：歷史對位＝{b}。{c}。（提問者個人讀法，非共識）",
                        "keywords": kws,
                        "ref": "characters.html"})
    cats.append({"id": "char", "title": "人物對標", "qa": char_qa})

    # 3) 判词/九幕/心法手工条目
    manual = [
        {"id": "poem", "title": "判詞與謎語", "qa": [
            {"q": "王熙鳳判詞點解", "a": "王熙鳳判詞：「凡鳥偏從末世來，都知愛慕此生才。一從二令三人木，哭向金陵事更哀。」提問者解：凡鳥=鳳=孝莊（凡鳥指順治出家）；末世=明末清初；一從二令三人木=順治出家→康熙二廢太子→九子奪嫡；哭向金陵=斷了清朝龍脈。整體係講康熙晚年繼位問題，唔係鳳姐個人命運。（個人讀法，非共識）",
             "keywords": ["王熙鳳判詞", "凡鳥", "一從二令三人木", "哭向金陵"], "ref": "chapters/005.html"},
            {"q": "一從二令三人木", "a": "提問者解：一＝順治出家；二＝康熙二次廢太子；三＝九子奪嫡兄弟相殘。末句「哭向金陵事更哀」＝九子奪嫡斷了清朝龍脈。（判詞「一從」提問者作「一徔」）",
             "keywords": ["一從二令三人木", "一徔"], "ref": "chapters/005.html"},
            {"q": "金陵十二釵判詞", "a": "第五回太虛幻境簿冊即十二釵判詞，提問者體系視之為「天命預設」——孝莊選康熙接班順治及登基嘅政治布局。", "keywords": ["金陵十二釵", "判詞", "太虛幻境"], "ref": "chapters/005.html"},
        ]},
        {"id": "glyph", "title": "字音字形", "qa": [
            {"q": "贔屭咩意思", "a": "贔屭＝被棄（粵語閉翳）——提問者親授嘅全書核心密碼：呢兩個字唔係龍生九子，而係胤礽命運嘅核心密碼，全書由始至終寫一個「棄」字。拆字：三個貝＝有錢，加尸字頭＝一個死人畀你有錢，先叫人贔屭。",
             "keywords": ["贔屭", "閉翳", "被棄"], "ref": "framework.html"},
            {"q": "罘罳", "a": "罘罳＝防盜網／復思——與贔屭並列嘅字音字形密碼（「不思加個网，教人如何反思贔屭」）。", "keywords": ["罘罳"], "ref": "framework.html"},
            {"q": "甄士隱 賈雨村", "a": "甄士隱＝真事隱／禛事隱（雍正胤禛之事被隱去）；賈雨村＝假語村言（回顧上位經歷）——全書諧音總綱。", "keywords": ["甄士隱", "賈雨村", "真事隱", "假語存"], "ref": "chapters/001.html"},
        ]},
        {"id": "mind", "title": "心法與框架", "qa": [
            {"q": "子嗥 你係邊個", "a": "我係子嗥——紅樓解碼嘅案頭搭檔，負責將《紅樓夢解讀總綱》同 DeepSeek 對話記錄按回目整理成「一回一卡」嘅秩序。", "keywords": ["子嗥", "你係邊個", "邊個"], "ref": "index.html"},
            {"q": "九幕係咩", "a": "全書九幕分期：一(1-5)總綱、二(6-18)鼎盛鋪陳、三(19-36)情竇深化、四(37-54)群芳鼎盛、五(55-69)內囊漸起、六(70-80)敗象顯露、七(81-98)後四十回上、八(99-110)查抄敗落、九(111-120)散場。每回卡都標所屬幕。", "keywords": ["九幕", "分期", "幕"], "ref": "framework.html"},
            {"q": "解讀框架", "a": "四條秩序：一回一卡、雙軌並行（文學軌/解碼軌）、全書定位（標幕）、誠實邊界（來源必標、無素材寫待解碼不硬編）。每回九字段固定。", "keywords": ["框架", "一回一卡", "雙軌"], "ref": "framework.html"},
            {"q": "全書總綱係咩", "a": "提問者定位：第七十六回「中秋夜大觀園即景聯句」（凹晶館聯詩）為全書總綱——全書歷史密碼之濃縮，非第76回回內詩，亦非第一幕框架（神話框架·護官符·太虛幻境）。原詩收錄於「解讀框架」頁；解密詞「贔屭」（被棄）、「罘罳」（復思）貫穿全書。", "keywords": ["全書總綱", "總綱", "凹晶館聯詩", "中秋夜聯句"], "ref": "framework.html"},
        ]},
    ]
    for m in manual:
        cats.append(m)

    # 免责与问候
    meta = {
        "assistantName": "子嗥",
        "assistantRole": "紅樓解碼案頭搭檔",
        "greeting": "嗨，我係子嗥——紅樓解碼嘅案頭搭檔。你可以問我：「第一回講咩」「寶釵係邊個」「贔屭咩意思」「九幕係咩」；問人物點評就講「第X回人物點評」……亦可以直接講某回號。",
        "fallback": "總綱素材暫未覆蓋呢個問題；可以換個問法，或者問「人物對標」「判詞」「字音字形」「九幕」「第X回人物點評」呢啲方向。",
    }
    review = {}
    for k, v in CHAR_REVIEW.items():
        if k == "_说明": continue
        if v:
            review[k] = v
    poem = {}
    for k, v in POEM_REVIEW.items():
        if k == "_说明": continue
        if v:
            poem[k] = v
    return {"meta": meta, "categories": cats, "charReview": review, "poemReview": poem}

# ---------------- search-data ----------------
def search_entries():
    ents = [{"url":"index.html","title":"紅樓解讀 · 首頁","text":"紅樓夢逐回解讀 索隱解碼 九幕 框架 人物對標"}]
    for n, up, low, act in CH:
        text = f"第{n}回 {up} {low}"
        if n in CURATED:
            text += " " + " ".join(x for _, x in CURATED[n])
        else:
            for _, x in auto_snippets(n): text += " " + x
        ents.append({"url": f"chapters/{n:03d}.html", "title": f"第{n}回　{up}　{low}", "text": text[:600]})
    ents.append({"url":"framework.html","title":"解讀框架","text":"一回一卡 雙軌並行 九字段 四條秩序規則 九幕分期"})
    ents.append({"url":"characters.html","title":"人物對標速查","text":"胤礽 雍正 胤祥 順治 孝莊 胤褆 人物對標"})
    return ents

def main():
    os.makedirs(os.path.join(OUT, "chapters"), exist_ok=True)
    # index
    def w(rel, txt):
        fp = os.path.join(OUT, rel)
        os.makedirs(os.path.dirname(fp), exist_ok=True)
        open(fp, "w", encoding="utf-8").write(T(txt))

    # 靜態資產：原樣複製，不過 T()（JS/CSS 內的簡繁觸發詞須保留簡體，否則簡體輸入匹配唔到）
    ASSETS = os.path.join(ROOT, "assets")
    if os.path.isdir(ASSETS):
        for fn in sorted(os.listdir(ASSETS)):
            if fn.startswith("."):
                continue
            shutil.copyfile(os.path.join(ASSETS, fn), os.path.join(OUT, fn))

    w("index.html", page("紅樓解讀 · 首頁", "紅樓夢逐回解讀框架與索隱解碼目錄", index_body(), "首頁"))
    w("framework.html", page("解讀框架", "四條秩序規則與每回九字段模板", framework_body(), "解讀框架"))
    w("characters.html", page("人物對標速查", "紅樓人物─九子奪嫡歷史對位", characters_body(), "人物對標"))
    w("chapters/000.html", page("逐回目錄", "120 回總表", catalog_body(), "逐回目錄", sub=True))
    for n, *_ in CH:
        w(f"chapters/{n:03d}.html",
          page(f"第{n}回　{CH[n-1][1]}　{CH[n-1][2]}", f"第{n}回解讀卡", ch_body(n), sub=True))
    # search data
    w("search-data.js", "window.SEARCH_DATA=" + json.dumps(search_entries(), ensure_ascii=False) + ";")
    # 子嗥知识库
    w("zi-hao-data.js", "window.ZiHaoKB=" + json.dumps(zi_hao_data(), ensure_ascii=False) + ";")
    print(f"ok: {OUT}")
    print(f"pages: 1 index + 1 framework + 1 characters + 121 chapter (000-120) + search-data + zi-hao-data")

if __name__ == "__main__":
    main()
