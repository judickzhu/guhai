# -*- coding: utf-8 -*-
"""
跨語言等價驗證：Python 閘門 vs JS 閘門（同一 320 條語料）
基準：gate_js_rows.json（由 gate_dump.js 產生）
判定：逐行比對 rawHit / blockingHit / blocked / 違規序列(layer+term+severity) / 輸出文本
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import dc_safety_gate as G  # noqa: E402

js = json.load(open(os.path.join(HERE, "gate_js_rows.json"), encoding="utf-8"))
rows = js["rows"]

mismatch = []
for r in rows:
    py = G.run(r["answer"], user_input="", ctx=r["ctx"])
    py_v = [(v["layer"], v["term"], v["severity"]) for v in py["violations"]]
    js_v = [(v["layer"], v["term"], v["severity"]) for v in r["violations"]]
    diffs = []
    if bool(py["trace"]["metrics"].get("raw_hit")) != bool(r["rawHit"]):
        diffs.append("rawHit")
    if bool(py["trace"]["metrics"].get("blocking_hit")) != bool(r["blockingHit"]):
        diffs.append("blockingHit")
    if bool(py["blocked"]) != bool(r["blocked"]):
        diffs.append("blocked")
    if py_v != js_v:
        diffs.append("violations")
    if py["answer"] != r["out"]:
        diffs.append("out")
    if diffs:
        mismatch.append((r["tag"], diffs, js_v, py_v, r["out"], py["answer"]))

total = len(rows)
print("== 跨語言等價驗證 ==")
print("語料 %d 條 ｜ 不一致 %d 條" % (total, len(mismatch)))
py_metrics = G.metrics_from([G.run(r["answer"], ctx=r["ctx"]) for r in rows])
print("Python 端指標：RAW_leak %d ｜ needRepair %d ｜ BLOCK %d ｜ REPAIR %.3f"
      % (py_metrics["raw"], py_metrics["needRepair"], py_metrics["blocked"], py_metrics["REPAIR_SUCCESS_RATE"]))
print("JS 端指標：    rawHit %d ｜ blockingHit %d ｜ BLOCK %d"
      % (sum(1 for r in rows if r["rawHit"]), sum(1 for r in rows if r["blockingHit"]),
         sum(1 for r in rows if r["blocked"])))

if mismatch:
    print("\n--- 前 8 條不一致 ---")
    for tag, diffs, js_v, py_v, jo, po in mismatch[:8]:
        print("\n[%s] 差異欄位：%s" % (tag, ",".join(diffs)))
        if "violations" in diffs:
            print("  JS:", js_v)
            print("  PY:", py_v)
        if "out" in diffs:
            print("  JS out:", repr(jo[:120]))
            print("  PY out:", repr(po[:120]))
    sys.exit(1)
else:
    print("\n✅ 完全等價：Python 移植與 JS 閘門逐行一致")
    sys.exit(0)
