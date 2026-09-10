#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen_yuanwen_json.py —— 從來源批量生成 / 修補 honglou_yuanwen.json
設計目標：繞開 dsh agent 的「think-but-don't-act」死循環。
  - 讀取失敗 → 立即 sys.exit(1)，不重試、不空轉。
  - 無來源的回 → 不碰、不等待、直接跳過。
  - 冪等：同內容不重寫；寫前自動備份。
  - 每回處理完立即打印一行狀態，全處理完打印總結後退出。

來源約定（預設目錄：網站/honglou/yuanwen_sources/）：
  每回一個檔，檔名 either 第N回.txt / 第N回.md / N.txt / NNN.txt
  檔內即該回「整回原文」（可帶標點與換行，腳本會清理成無標點無分段純漢字串）。

用法：
  python3 gen_yuanwen_json.py                      # 僅從 yuanwen_sources/ 補
  python3 gen_yuanwen_json.py --from-chapters      # 另從 chapters/NNN.html 的 <div class="yuanwen"> 補「空」回（楔子級兜底，不覆蓋已有）
  python3 gen_yuanwen_json.py --sources /path/to/dir
"""
import json, re, html, os, sys, shutil, argparse

# 清理：去 HTML 標籤 → unescape → 去所有空白 → 去標點，保留漢字與數字
_PUNCT = set("，。、；：！？「」『』“”（）《》〈〉—…·～—.!?,;: \u3000\t\n\r\x0b\x0c")

def clean(text: str) -> str:
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    text = "".join(text.split())          # 去所有空白（含換行）
    return "".join(ch for ch in text if ch not in _PUNCT)

def _read_source(p: str) -> str:
    try:
        return open(p, encoding="utf-8", errors="ignore").read()
    except Exception as e:
        # 不死循環核心：讀失敗立即退出，絕不重試
        print(f"[錯誤] 讀取失敗 {p}: {e}")
        sys.exit(1)

def from_sources(sources_dir: str, data: dict, report: list):
    if not os.path.isdir(sources_dir):
        print(f"[跳過] 來源目錄不存在: {sources_dir}")
        return
    files = sorted(os.listdir(sources_dir))
    hits = 0
    for fn in files:
        m = re.match(r"^第?0*(\d{1,3})回\.(txt|md|json)$", fn) or re.match(r"^0*(\d{1,3})\.(txt|md)$", fn)
        if not m:
            continue
        ch = int(m.group(1))
        if ch < 1 or ch > 120:
            continue
        hits += 1
        raw = _read_source(os.path.join(sources_dir, fn))
        new = clean(raw)
        if not new:
            print(f"[第{ch}回] 來源清理後為空，跳過")
            continue
        old = data.get(str(ch), "")
        if new == old:
            report.append((ch, "unchanged", len(old)))
            print(f"[第{ch}回] 不變 ({len(old)}字)")
        else:
            data[str(ch)] = new
            report.append((ch, "updated", len(old), len(new)))
            print(f"[第{ch}回] 更新 {len(old)}→{len(new)}字")
    if hits == 0:
        print(f"[跳過] 來源目錄無符合檔名(第N回.txt / NNN.txt): {sources_dir}")

def from_chapters(chapters_dir: str, data: dict, report: list):
    """兜底：僅補 json 為『空』且 chapters HTML 有 <div class=\"yuanwen\"> 的回（楔子級，不覆蓋已有）。"""
    for ch in range(1, 121):
        if data.get(str(ch)):
            continue
        p = os.path.join(chapters_dir, f"{ch:03d}.html")
        if not os.path.exists(p):
            continue
        t = open(p, encoding="utf-8", errors="ignore").read()
        m = re.search(r'<div class="yuanwen">(.*?)</div>', t, re.S)
        if not m:
            continue
        new = clean(m.group(1))
        if new:
            data[str(ch)] = new
            report.append((ch, "from-chapters", 0, len(new)))
            print(f"[第{ch}回] 從 chapters 補(楔子級) 0→{len(new)}字")

def main():
    ap = argparse.ArgumentParser()
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(here)                       # 網站/
    ap.add_argument("--sources", default=os.path.join(root, "honglou", "yuanwen_sources"))
    ap.add_argument("--json", default=os.path.join(os.path.dirname(root), "honglou_yuanwen.json"))
    ap.add_argument("--chapters", default=os.path.join(root, "honglou", "chapters"))
    ap.add_argument("--from-chapters", action="store_true")
    args = ap.parse_args()

    if not os.path.exists(args.json):
        print(f"[錯誤] json 不存在: {args.json}")
        sys.exit(1)
    bak = args.json + ".bak"
    if not os.path.exists(bak):
        shutil.copy(args.json, bak)
        print(f"[備份] {bak}")

    data = json.load(open(args.json, encoding="utf-8"))
    report = []
    if args.from_chapters:
        from_chapters(args.chapters, data, report)
    from_sources(args.sources, data, report)

    json.dump(data, open(args.json, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    filled = sum(1 for k in data if isinstance(data.get(k), str) and data[k])
    print(f"\n[完成] 本次處理 {len(report)} 回，已寫回 {args.json}")
    print(f"[狀態] json 已填回數: {filled}/120")

if __name__ == "__main__":
    main()
