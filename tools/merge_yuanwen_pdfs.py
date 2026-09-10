#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
merge_yuanwen_pdfs.py — 把 ima 知识库那套庚辰/甲戌/蒙本 分册 PDF
按回序合成一套连续《红楼梦》底本合集（1–120 回），并加每册书签。

用法：
    python3 tools/merge_yuanwen_pdfs.py
输出：<电子书ipa>/红楼梦底本合集_120回.pdf
"""
import os, glob
from pypdf import PdfWriter, PdfReader

CACHE = "/tmp/ima_pdf"
OUT = "/Users/macbookair/Downloads/电子书ipa/红楼梦底本合集_120回.pdf"

# (回起, 回止(不含), media_id 后缀, 底本标注) —— 按回序
SOURCES = [
    (1,   9,  "146874cd71662387fe51909eb0cd93b90019eddfe8c073ba", "甲戌 1–8"),
    (9,   13, "3da933373689cfedd1012b8e0b5c12bc0019eddfe8c073ba", "庚辰 9–12"),
    (13,  17, "5f9ada03dc6cfa0015392476ebbd2a110019eddfe8c073ba", "甲戌 13–16"),
    (17,  21, "bc9ec8184b2d4284bc47ec73a1e5d34c0019eddfe8c073ba", "庚辰 17–20"),
    (21,  25, "bb15dbf7167412016e9521ef4a8c423e0019eddfe8c073ba", "庚辰 21–24"),
    (25,  29, "053bfb11061852f30424f452456141dc0019eddfe8c073ba", "甲戌 25–28"),
    (29,  34, "26b7f8f1725b9b1f5490e59a952bddf50019eddfe8c073ba", "庚辰 29–33"),
    (34,  38, "85448f4437584d177bee49907fb102040019eddfe8c073ba", "庚辰 34–37"),
    (38,  41, "6322f8df3a565436da7d8ebba222c7320019eddfe8c073ba", "庚辰 38–40"),
    (41,  51, "e34df5b048eb6ef2d715e141e70080300019eddfe8c073ba", "庚辰 41–50"),
    (51,  61, "f1d362acccf66cc5f01feed65d65142d0019eddfe8c073ba", "庚辰 51–60"),
    (61,  71, "f08c570ee7687203af957212a9ec8fd70019eddfe8c073ba", "庚辰 61–70"),
    (71,  81, "dd648421ad483aa97d1a9884782fbcc00019eddfe8c073ba", "庚辰 71–80"),
    (81,  91, "793dcf7901924c2e6471a1395740b2b10019eddfe8c073ba", "蒙本 81–90"),
    (91,  101, "4b86bddb7474bef96fb2ea0750b252690019eddfe8c073ba", "蒙本 91–100"),
    (101, 111, "4b49aac5167a073be0352c083f8085330019eddfe8c073ba", "蒙本 101–110"),
    (111, 121, "d80a12212c949ca83fe81755f0fd25df0019eddfe8c073ba", "蒙本 111–120"),
]

def find_pdf(suf):
    hits = glob.glob(os.path.join(CACHE, f"*{suf}.pdf"))
    if not hits:
        raise FileNotFoundError(f"缓存缺 {suf}")
    if len(hits) > 1:
        hits.sort(key=lambda p: -os.path.getsize(p))
    return hits[0]

def main():
    w = PdfWriter()
    total = 0
    for a, b, suf, label in SOURCES:
        p = find_pdf(suf)
        sz = os.path.getsize(p) // 1024
        bm = f"第{a}–{b-1}回 · {label}"
        w.append(p, outline_item=bm)
        rdr = PdfReader(p)
        print(f"  + {bm:22s} pages={len(rdr.pages):3d}  {sz}KB")
        total += len(rdr.pages)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    w.write(OUT)
    print(f"\nok: {OUT}")
    print(f"总页数 ≈ {total}（各册页数求和；书签 {len(SOURCES)} 条，覆盖 1–120 回）")
    print(f"大小 {os.path.getsize(OUT)//1024//1024}MB")

if __name__ == "__main__":
    main()
