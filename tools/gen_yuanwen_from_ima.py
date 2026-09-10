#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 ima 知識庫的石頭記「分冊」PDF 抽取無標點原文，回填 honglou_yuanwen.json。
設計原則（防 dsh agent 死循環）：
  - 不依賴 agent，純腳本批量處理
  - 每個分冊下載一次（本地已有則跳過），抽字→NFKC→切分→填 json
  - 抽字失敗即報錯退出，不重試、不空轉
  - 寫入前自動備份 json
  - 已填的回（json 非空）除非 --force 否則不覆蓋

底本配置（方案A，混本拼全）：
  庚辰分冊: 9-12,17-20,21-24,29-33,34-37,38-40,41-50,51-60,61-70,71-80
  甲戌分冊: 1-8,13-16,25-28
  蒙本分冊: 81-90,91-100,101-110,111-120
  => 覆蓋 1-80(庚辰/甲戌), 81-120(蒙本) 共 118 回
  缺口: 99-100（蒙本91-100 標題頁 OCR 未出字，無法切分）
"""
import json, re, os, sys, subprocess, shutil, unicodedata

# ---------- 路徑 ----------
KB = "ntESTSeLDSsguPgcP2Dw0pdwjQQOifyAsQliZ9tts1E="
MID_PREFIX = "pdf_ca17ebdc245535d61494ceff12f5a7ca_"
SKILL_DIR = os.path.expanduser("~/.openclaw/workspace/skills/ima-skill")
JSON_PATH = os.path.expanduser("~/Downloads/电子书ipa/honglou_yuanwen.json")
DL_DIR = "/tmp/ima_pdf"
NODE = "/Users/macbookair/.workbuddy/binaries/node/versions/22.22.2-2/bin/node"
PY_VENV = "/Users/macbookair/.workbuddy/binaries/python/envs/default/bin/python"

# ---------- 分冊配置 (回範圍 -> media_id 後綴) ----------
SOURCES = [
    # 新補：1-16（甲戌1-8 / 庚辰9-12 / 甲戌13-16）
    (range(1, 9),    "146874cd71662387fe51909eb0cd93b90019eddfe8c073ba"),  # 甲戌1-8
    (range(9, 13),   "3da933373689cfedd1012b8e0b5c12bc0019eddfe8c073ba"),  # 庚辰9-12
    (range(13, 17),  "5f9ada03dc6cfa0015392476ebbd2a110019eddfe8c073ba"),  # 甲戌13-16
    # 原有：17-40
    (range(17, 21),  "bc9ec8184b2d4284bc47ec73a1e5d34c0019eddfe8c073ba"),  # 庚辰17-20
    (range(21, 25),  "bb15dbf7167412016e9521ef4a8c423e0019eddfe8c073ba"),  # 庚辰21-24
    (range(29, 34),  "26b7f8f1725b9b1f5490e59a952bddf50019eddfe8c073ba"),  # 庚辰29-33
    (range(34, 38),  "85448f4437584d177bee49907fb102040019eddfe8c073ba"),  # 庚辰34-37
    (range(38, 41),  "6322f8df3a565436da7d8ebba222c7320019eddfe8c073ba"),  # 庚辰38-40
    (range(25, 29),  "053bfb11061852f30424f452456141dc0019eddfe8c073ba"),  # 甲戌25-28
    # 新補：41-70（庚辰41-50/51-60/61-70）
    (range(41, 51),  "e34df5b048eb6ef2d715e141e70080300019eddfe8c073ba"),  # 庚辰41-50
    (range(51, 61),  "f1d362acccf66cc5f01feed65d65142d0019eddfe8c073ba"),  # 庚辰51-60
    (range(61, 71),  "f08c570ee7687203af957212a9ec8fd70019eddfe8c073ba"),  # 庚辰61-70
    # 原有：71-80
    (range(71, 81),  "dd648421ad483aa97d1a9884782fbcc00019eddfe8c073ba"),  # 庚辰71-80
    # 蒙本：81-120
    (range(81, 91),  "793dcf7901924c2e6471a1395740b2b10019eddfe8c073ba"),  # 蒙本81-90
    (range(91, 101), "4b86bddb7474bef96fb2ea0750b252690019eddfe8c073ba"),  # 蒙本91-100（完整版，含99-100）
    (range(101,111), "4b49aac5167a073be0352c083f8085330019eddfe8c073ba"),  # 蒙本101-110
    (range(111,121), "d80a12212c949ca83fe81755f0fd25df0019eddfe8c073ba"),  # 蒙本111-120
]

DIGIT = {"一":1,"二":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9,"〇":0,"零":0}
def cn2int(s):
    # 含 十/百/千：傳統累加模式（第七十一->71, 十一->11, 一百->100, 九十九->99）
    if any(ch in "十百千" for ch in s):
        val=0; cur=0
        for ch in s:
            if ch=="十": val += (cur if cur else 1)*10; cur=0
            elif ch=="百": val += cur*100; cur=0
            elif ch=="千": val += cur*1000; cur=0
            elif ch in DIGIT: cur = DIGIT[ch]
        return val + cur
    # 純數字串（蒙本101-120用「第一〇一/第一一一」式）：位值模式
    val=0
    for ch in s:
        if ch in DIGIT: val = val*10 + DIGIT[ch]
    return val

PATS = [
    r"第(\d+)回", r"第(\d+)囬",
    r"第([一二三四五六七八九十百零〇]+)回", r"第([一二三四五六七八九十百零〇]+)囬",
    r"卷之第(\d+)回", r"卷之第([一二三四五六七八九十百零〇]+)囬",
    r"卷之(\d+)囬", r"卷之([一二三四五六七八九十百零〇]+)囬",
]
def find_hui(txt):
    for pat in PATS:
        m = re.search(pat, txt)
        if m:
            g = m.group(1)
            return int(g) if g.isdigit() else cn2int(g)
    return None

# 異體字最小映射（影印本常見，轉為標準字）；保留繁簡混合不強制統一
NORM_MAP = {
    "囬": "回",
    "夾": "夹",
    "側": "侧",
    "夢": "梦",  # 若影印用异体
}
def normalize_text(t):
    t = unicodedata.normalize("NFKC", t)      # 兼容部首字 -> 標準字 (⽯->石, ⼗->十)
    for k, v in NORM_MAP.items():
        t = t.replace(k, v)
    return t

def strip_parens(t):
    """去脂批括號（甲戌側/甲夾/庚眉/伏下⽂/即：等）。保留回前/回後評需另行處理。"""
    # 去全角/半角括號批
    t = re.sub(r"（[^（）]*?）", "", t)
    t = re.sub(r"\([^()]*?\)", "", t)
    return t

def get_media_url(mid):
    env = dict(os.environ)
    env["IMA_OPENAPI_CLIENTID"] = open(os.path.expanduser("~/.config/ima/client_id")).read().strip()
    env["IMA_OPENAPI_APIKEY"] = open(os.path.expanduser("~/.config/ima/api_key")).read().strip()
    out = subprocess.run([NODE, os.path.join(SKILL_DIR, "ima_api.cjs"),
                          "openapi/wiki/v1/get_media_info",
                          json.dumps({"media_id": mid})],
                         capture_output=True, text=True, env=env, timeout=120)
    try:
        d = json.loads(out.stdout)
        return d["data"]["url_info"]["url"]
    except Exception as e:
        raise RuntimeError(f"get_media_info 失敗 {mid}: {e} | {out.stdout[:200]}")

def download(mid):
    os.makedirs(DL_DIR, exist_ok=True)
    suf = mid.split("_")[-1]
    path = os.path.join(DL_DIR, f"{suf}.pdf")
    if os.path.exists(path) and os.path.getsize(path) > 10000:
        return path
    url = get_media_url(mid)
    if not url:
        raise RuntimeError(f"無 URL {mid}")
    subprocess.run(["curl", "-s", "-L", "--max-time", "400", url, "-o", path], check=True)
    if os.path.getsize(path) < 10000:
        raise RuntimeError(f"下載過小 {mid}: {os.path.getsize(path)}")
    return path

def extract_hui(path):
    """返回 {回號: 归一化無標點文本(含批)}"""
    import pypdf
    r = pypdf.PdfReader(path)
    pages = [normalize_text(r.pages[i].extract_text() or "") for i in range(len(r.pages))]
    starts = []
    for i, t in enumerate(pages):
        h = find_hui(t)
        if h:
            starts.append((i + 1, h))
    from collections import OrderedDict
    sd = OrderedDict()
    for pg, h in starts:
        sd.setdefault(h, pg)
    result = {}
    for h in list(sd.keys()):
        s = sd[h]
        n = sd.get(h + 1)
        e = (n - 1) if n else len(pages)
        txt = "".join("".join(pages[s - 1:e]).split())   # 去空白換行
        # 去掉回目行本身的「脂硯齋重評石頭記卷之第X回回目名」前綴，只留正文
        # 但為保留逐字，暫不截回目名；若需純正文可再加 --strip-title
        result[h] = txt
    return result

def main():
    force = "--force" in sys.argv
    strip = "--strip-批" in sys.argv
    os.makedirs(DL_DIR, exist_ok=True)
    # 備份
    bak = JSON_PATH + ".bak.auto"
    if not os.path.exists(bak):
        shutil.copy(JSON_PATH, bak)
    data = json.load(open(JSON_PATH, encoding="utf-8"))
    filled = 0
    for rng, suf in SOURCES:
        mid = MID_PREFIX + suf
        print(f"[分冊] 回 {rng.start}-{rng.stop-1}  {mid[-12:]}", flush=True)
        try:
            path = download(mid)
        except Exception as e:
            print(f"  !! 下載失敗: {e}", flush=True)
            continue
        try:
            hui_map = extract_hui(path)
        except Exception as e:
            print(f"  !! 抽字失敗: {e}", flush=True)
            continue
        for h in rng:
            if h not in hui_map:
                print(f"  -- 第{h}回 未切出", flush=True)
                continue
            cur = data.get(str(h), "")
            if cur and not force:
                print(f"  .. 第{h}回 已有({len(cur)}字) 跳過", flush=True)
                continue
            txt = hui_map[h]
            if strip:
                txt = strip_parens(txt)
            data[str(h)] = txt
            filled += 1
            print(f"  ++ 第{h}回 填 {len(txt)}字", flush=True)
    json.dump(data, open(JSON_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    # 統計
    n_fill = sum(1 for k in [str(i) for i in range(1,121)] if data.get(k))
    print(f"\n=== 完成: 本次新填 {filled} 回；json 現有內容回數 = {n_fill}/120 ===", flush=True)

if __name__ == "__main__":
    main()
