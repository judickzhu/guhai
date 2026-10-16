# -*- coding: utf-8 -*-
"""
DC姐姐 V10.7｜Behavior Safety Gate —— Python 移植（後台生成端用）

與 `safety_gate.js` **逐行等價**，經 320 條真實語料跨語言等價驗證（見 `gate_equiv_test.py`）。
詞表／模式／改寫表由 `gate_tables.json` 載入（單一真相來源，由 `gate_dump.js` 從 JS 端匯出）。

用法（後台 chat endpoint）：
    from dc_safety_gate import gate_reply
    gated = gate_reply(reply, ctx={"caseId": None, "productBudget": "OFF", "stopShape": "SOP"})
    reply = gated["answer"]
"""

import json
import os
import re

_HERE = os.path.dirname(os.path.abspath(__file__))
_T = json.load(open(os.path.join(_HERE, "gate_tables.json"), encoding="utf-8"))

L1_TERMS = _T["L1_TERMS"]
L2_PATTERNS = _T["L2_PATTERNS"]
L3_PATTERNS = _T["L3_PATTERNS"]
L4_PRODUCT_TERMS = _T["L4_PRODUCT_TERMS"]
L4_PUSHBACK = _T["L4_PUSHBACK"]
# 同組詞只計一次（避免 Telegram + 帳號被算成多次提及）
L4_MENTION_GROUP = _T.get("L4_MENTION_GROUP", [["Telegram", "t.me/DCOGAI", "DCOGAI877", "DCOGAI888"]])
L5_CASE_PATTERNS = _T["L5_CASE_PATTERNS"]
L6_ENGINE_PATTERNS = _T["L6_ENGINE_PATTERNS"]
PHRASE_TABLE = [(a, b) for a, b in _T["PHRASE_TABLE"]]
L3_REWRITE = [(a, b) for a, b in _T["L3_REWRITE"]]
TERM_FALLBACK = _T["TERM_FALLBACK"]
SAFE_FALLBACK = _T["SAFE_FALLBACK"]
LOCAL_REWRITE_MAX = _T.get("LOCAL_REWRITE_MAX", 1)
SAFE_REGEN_MAX = _T.get("SAFE_REGEN_MAX", 1)
T2S = _T["T2S"]

S2T = {}
for _t, _s in T2S.items():
    S2T.setdefault(_s, set()).add(_t)

CASE_TABLE = {**L5_CASE_PATTERNS, **L6_ENGINE_PATTERNS}

SEVERITY = {"L1": "HIGH", "L2": "HIGH", "L3": "CRITICAL", "L4": "HIGH",
            "L4b": "MEDIUM", "L5": "HIGH", "L5q": "MEDIUM", "L5m": "MEDIUM", "L7": "HIGH", "L2n": "MEDIUM"}
HF_REF = {"L1": "HF01", "L2": "HF01", "L3": "HF02", "L4": "HF07",
          "L4b": "HF10", "L5": "CASE", "L5q": "CASE", "L5m": "CASE", "L7": "HF07", "L2n": "HF01"}
REWRITE_TARGET = {"L1": "REMOVE_FORBIDDEN_TERM", "L2": "REMOVE_GUARANTEE_LANGUAGE",
                  "L3": "RESTORE_USER_AGENCY", "L4": "STRIP_PRODUCT_MENTION",
                  "L4b": "REDUCE_PRODUCT_MENTION", "L5": "REMOVE_CASE_FORBIDDEN",
                  "L5q": "LOG_ONLY", "L5m": "LOG_ONLY", "L7": "REMOVE_TRAILING_QUESTION", "L2n": "LOG_ONLY"}
CATEGORY = {"L1": "FORBIDDEN_TERM", "L2": "RETURN_GUARANTEE", "L3": "DECISION_SUBSTITUTION",
            "L4": "SALES_CONTAMINATION", "L4b": "PRODUCT_BUDGET_EXCEEDED",
            "L5": "CASE_FORBIDDEN", "L5q": "CASE_FORBIDDEN_QUOTED",
            "L5m": "CASE_FORBIDDEN_MINOR", "L7": "STOP_SHAPE", "L2n": "SEMANTIC_NEGATED"}
BUDGETS = ("OFF", "ONCE", "OPEN")

# 字間容忍：空白／零寬／引號／括號（與 JS 的 SEP 等價）
_SEP = r'(?:[\s\u200B-\u200D\uFEFF\u2060]|[「」『』（）()【】\[\]"\'])*'
_RE_CACHE = {}


def canonicalize(text):
    """長度不變的正規化：全形→半形、繁→簡（span 因此可直接對應原文）"""
    s = "" if text is None else str(text)
    out = []
    for ch in s:
        cp = ord(ch)
        if 0xFF01 <= cp <= 0xFF5E:
            ch = chr(cp - 0xFEE0)
        elif cp == 0x3000:
            ch = " "
        ch = T2S.get(ch, ch)
        out.append(ch)
    return "".join(out)


def _char_class(c):
    variants = {c} | S2T.get(c, set())
    return "[" + "".join(re.escape(v) for v in variants) + "]"


def flex_source(phrase):
    return _SEP.join(_char_class(c) for c in canonicalize(phrase))


def flex_re(phrase):
    r = _RE_CACHE.get(phrase)
    if r is None:
        r = re.compile(flex_source(phrase))
        _RE_CACHE[phrase] = r
    return r


def locate(text, phrase):
    hits = []
    for m in flex_re(phrase).finditer(text):
        hits.append({"start": m.start(), "end": m.end(), "matched": m.group(0)})
    return hits


def resolve_budget(ctx):
    ctx = ctx or {}
    b = ctx.get("productBudget")
    if isinstance(b, str) and b in BUDGETS:
        return b
    return "OPEN" if ctx.get("productAllowed") else "OFF"


def _mkmatch(term, layer, span, matched):
    return {"term": canonicalize(term), "layer": layer, "category": CATEGORY[layer],
            "severity": SEVERITY[layer], "rewrite_target": REWRITE_TARGET[layer],
            "hf_ref": HF_REF[layer], "span": span, "matched": matched,
            "preserve": ["original_intent", "cognitive_point", "tone"]}


def scan(user_input, answer, ctx=None):
    ctx = ctx or {}
    text = "" if answer is None else str(answer)
    out = []

    for t in L1_TERMS:
        for h in locate(text, t):
            out.append(_mkmatch(t, "L1", [h["start"], h["end"]], h["matched"]))
    # S2：否定語境降級（與 JS 等價）
    for p in L2_PATTERNS:
        for h in locate(text, p):
            pre = text[max(0, h["start"] - 10):h["start"]]
            post = text[h["end"]:h["end"] + 8]
            neg_before = bool(re.search(r"(不由|不保證|不保证|不承諾|不承诺|并非|並非|不是|不能|取決於你|取决于你|看你自己)", pre))
            neg_after = bool(re.search(r"^(取決於|取决于|看你自己|不由|並非|并非|不保證|不保证)", post))
            if neg_before or neg_after:
                out.append(_mkmatch(p, "L2n", [h["start"], h["end"]], h["matched"]))
            else:
                out.append(_mkmatch(p, "L2", [h["start"], h["end"]], h["matched"]))
    for p in L3_PATTERNS:
        for h in locate(text, p):
            out.append(_mkmatch(p, "L3", [h["start"], h["end"]], h["matched"]))

    # L4：產品提及（依預算）
    budget = resolve_budget(ctx)
    product_count = {}
    if budget != "OPEN":
        for t in L4_PRODUCT_TERMS:
            hits = locate(text, t)
            if hits:
                k = canonicalize(t)
                product_count[k] = product_count.get(k, 0) + len(hits)
            if budget == "OFF":
                for h in hits:
                    out.append(_mkmatch(t, "L4", [h["start"], h["end"]], h["matched"]))
    if budget == "ONCE":
        # 合併同組提及（聯繫方式整體算 1 次）——與 JS 等價
        total = 0
        for grp in L4_MENTION_GROUP:
            grp_count = 0
            for raw in grp:
                k = canonicalize(raw)
                for key, n in product_count.items():
                    if key.find(k) >= 0 or k.find(key) >= 0:
                        grp_count += n
            if grp_count > 0:
                total += 1
        for key, n in product_count.items():
            in_group = any(
                (key.find(canonicalize(raw)) >= 0 or canonicalize(raw).find(key) >= 0)
                for grp in L4_MENTION_GROUP for raw in grp
            )
            if not in_group:
                total += n
        if total > 1:
            out.append({"term": "+".join(product_count.keys()), "layer": "L4b",
                        "category": CATEGORY["L4b"], "severity": SEVERITY["L4b"],
                        "rewrite_target": REWRITE_TARGET["L4b"], "hf_ref": HF_REF["L4b"],
                        "span": None, "matched": "%d 次產品提及" % total,
                        "preserve": ["original_intent", "cognitive_point", "tone"]})
    for p in L4_PUSHBACK:
        for h in locate(text, p):
            out.append(_mkmatch(p, "L4", [h["start"], h["end"]], h["matched"]))

    # L5/L6：案例級禁令（含元語言引號降級）
    case_id = ctx.get("caseId")
    if case_id:
        for phrase, cfg in CASE_TABLE.items():
            scope = cfg.get("scope", [])
            if not ("*" in scope or case_id in scope):
                continue
            for h in locate(text, phrase):
                prev = text[h["start"] - 1] if h["start"] > 0 else ""
                nxt = text[h["end"]] if h["end"] < len(text) else ""
                quoted = bool(re.match(r'[「"\'“]', prev)) or bool(re.match(r'[」"\'”]', nxt))
                layer = "L5q" if quoted else ("L5m" if cfg.get("sev") == "MEDIUM" else "L5")
                out.append(_mkmatch(phrase, layer, [h["start"], h["end"]], h["matched"]))

    # L7：結構檢查（收尾形狀）
    stop_shape = ctx.get("stopShape")
    if stop_shape in ("STRICT", "SOP"):
        sents = [x.strip() for x in re.split(r'(?<=[。！？!?；;\n])', text) if x.strip()]
        last = sents[-1] if sents else ""
        is_q = bool(re.search(r'[？?]\s*$', last))
        is_rev = bool(REVERSE_Q.search(last))
        bad = is_q and (True if stop_shape == "STRICT" else is_rev)
        if bad:
            start = text.rfind(last)
            out.append(_mkmatch("反問收尾", "L7", [0 if start < 0 else start, len(last)], last[:40]))

    # 去重（同層同詞同位置）
    seen = set()
    deduped = []
    for v in out:
        k = "%s|%s|%s" % (v["layer"], v["term"],
                          ("%d,%d" % (v["span"][0], v["span"][1])) if v["span"] else "n")
        if k in seen:
            continue
        seen.add(k)
        deduped.append(v)
    return deduped


REVERSE_Q = re.compile(r'(你係咪|你是不是|你有冇|你有没有|你係唔係|係驚|係怕|你覺得|你認為|你真正|你其實|捨唔捨得|捨不捨得)')


def blocking_of(vs):
    return [v for v in vs if v["severity"] != "MEDIUM"]


def split_sentences(text):
    return re.split(r'(?<=[。！？!?；;\n])', str(text))


def apply_table(text, table):
    s, n = text, 0
    for bad, good in table:
        r = flex_re(bad)
        if r.search(s):
            s = r.sub(good, s)
            n += 1
    return {"text": s, "applied": n}


def rewrite_terms(text, violations):
    s, n, seen = text, 0, set()
    for v in violations:
        if v["layer"] != "L1" or v["term"] in seen:
            continue
        seen.add(v["term"])
        good = TERM_FALLBACK.get(v["term"])
        if not good:
            continue
        r = flex_re(v["term"])
        if r.search(s):
            s = r.sub(good, s)
            n += 1
    return {"text": s, "applied": n}


def drop_violating_sentences(text, user_input, ctx):
    kept, dropped = [], []
    for sen in split_sentences(text):
        if not sen.strip():
            kept.append(sen)
            continue
        v = blocking_of(scan(user_input, sen, ctx))
        if v:
            dropped.append({"sentence": sen, "violations": [x["term"] for x in v]})
        else:
            kept.append(sen)
    return {"text": "".join(kept).strip(), "dropped": dropped}


def run(answer, user_input="", ctx=None, regen=None):
    """與 JS run() 等價：確定性修復 → 刪句兜底 → 安全模板"""
    ctx = ctx or {}
    answer = "" if answer is None else str(answer)
    trace = {"generation": {"raw_answer": answer, "violations": []}, "repair": None,
             "validation": {"pass_1": False, "pass_2": None},
             "metrics": {"raw_hit": 0, "repair_ok": 0, "blocked": 0}, "latency_ms": 0}

    v = scan(user_input, answer, ctx)
    trace["generation"]["violations"] = v
    trace["validation"]["pass_1"] = len(v) == 0
    if not v:
        return {"answer": answer, "violations": [], "trace": trace, "blocked": False}

    trace["metrics"]["raw_hit"] = 1
    blocking = blocking_of(v)
    trace["metrics"]["blocking_hit"] = 1 if blocking else 0

    # 語言守門：中文模式閘門不得改寫英文文本（避免往英文句裡塞中文＝製造新違規）
    # 英文回覆只做「偵測 + 記日誌」，修復屬於英文 prompt 層的責任。
    if str((ctx or {}).get("lang", "zh")).lower() == "english":
        trace["metrics"]["english_log_only"] = 1
        return {"answer": answer, "violations": v, "trace": trace, "blocked": False,
                "note": "ENGLISH_LOG_ONLY"}

    if not blocking:
        trace["validation"]["pass_1"] = True
        trace["metrics"]["medium_only"] = 1
        return {"answer": answer, "violations": v, "trace": trace, "blocked": False, "note": "MEDIUM_ONLY"}

    current, attempts = answer, 0
    while attempts < LOCAL_REWRITE_MAX and blocking:
        attempts += 1
        current = apply_table(current, PHRASE_TABLE)["text"]
        current = rewrite_terms(current, blocking)["text"]
        current = apply_table(current, L3_REWRITE)["text"]

        v2 = blocking_of(scan(user_input, current, ctx))
        strategy = "PHRASE_TABLE+TERM_FALLBACK+L3_RESTORE"
        if v2:
            drop = drop_violating_sentences(current, user_input, ctx)
            current = drop["text"]
            v2 = blocking_of(scan(user_input, current, ctx))
            strategy += "+SENTENCE_DROP"
            trace["repair"] = {"action": "LOCAL_REWRITE", "strategy": strategy,
                               "result": current, "dropped": drop["dropped"]}
        else:
            trace["repair"] = {"action": "LOCAL_REWRITE", "strategy": strategy, "result": current}

        too_short = len(re.sub(r'\s', '', current)) < max(6, int(len(re.sub(r'\s', '', answer)) * 0.30))
        if not v2 and not too_short:
            trace["validation"]["pass_2"] = True
            trace["metrics"]["repair_ok"] = 1
            return {"answer": current, "violations": v, "trace": trace, "blocked": False}
        if not v2 and too_short:
            trace["repair"]["too_short"] = True
            trace["validation"]["pass_2"] = False
            break
        trace["validation"]["pass_2"] = False
        blocking = v2

    if callable(regen):
        try:
            safe = regen(user_input, v)
            if safe and not blocking_of(scan(user_input, safe, ctx)):
                trace["repair"] = {"action": "SAFE_REGEN", "result": safe}
                trace["validation"]["pass_2"] = True
                trace["metrics"]["repair_ok"] = 1
                return {"answer": safe, "violations": v, "trace": trace, "blocked": False}
        except Exception:
            pass

    trace["repair"] = {"action": "FALLBACK", "result": SAFE_FALLBACK}
    trace["metrics"]["blocked"] = 1
    trace["validation"]["blocked"] = True
    return {"answer": SAFE_FALLBACK, "violations": v, "trace": trace, "blocked": True}


def gate_reply(reply, ctx=None, user_input=""):
    """後台一行接入：回傳 dict(answer/blocked/violations/trace)"""
    return run(reply, user_input=user_input, ctx=ctx)


def gate_reply_guarded(reply, ctx=None, user_input="", on_error=None):
    """熔斷兜底：閘門自身異常時，仍跑一次輕量禁語掃描（絕不放行已知違規）"""
    try:
        return run(reply, user_input=user_input, ctx=ctx)
    except Exception as e:  # noqa: BLE001
        if callable(on_error):
            try:
                on_error({"severity": "CRITICAL", "type": "GATE_ERROR", "error": str(e)})
            except Exception:
                pass
        text = "" if reply is None else str(reply)
        canon = canonicalize(text)
        banned = [w for w in L1_TERMS if canonicalize(w) in canon]
        if not banned:
            return {"answer": text, "violations": [], "blocked": False, "degraded": True,
                    "trace": {"metrics": {"gate_error": 1}}}
        return {"answer": SAFE_FALLBACK, "violations": [], "blocked": True, "degraded": True,
                "trace": {"metrics": {"gate_error": 1}}}


def derive_ctx(message, script="zh"):
    """簡化版 Router（正式應由 Router 提供並可審計）
    回傳 {caseId, productBudget, stopShape}
    規則順序（見《產品提及預算判定規則》）：
      1. 事務階段（試用/安裝/綁定/權限/價格/退款/分期/客服）→ OPEN
      2. 情緒／攻擊 → OFF + STRICT
      3. 其餘（知識型問答）→ ONCE
    English 回覆：產品詞一律放行（閘門為中文模式閘門，不評英文表達）
    """
    msg = message or ""
    if script == "english":
        return {"caseId": None, "productBudget": "OPEN", "stopShape": "NONE", "lang": "english"}

    txn = r"(怎麼裝|怎么装|安裝|安装|綁定|绑定|權限|权限|API|價格|价格|多少錢|多少钱|退款|分期|客服|下載|下载|開通|开通|試用|试用)"
    emo = r"(虧|亏|怕|崩潰|崩溃|焦慮|焦虑|睡不著|睡不着|翻本|騙|骗|割韭菜|垃圾|沒用|没用|後悔|后悔|不敢|完了)"
    if re.search(txn, msg):
        return {"caseId": None, "productBudget": "OPEN", "stopShape": "SOP"}
    if re.search(emo, msg):
        return {"caseId": None, "productBudget": "OFF", "stopShape": "STRICT"}
    return {"caseId": None, "productBudget": "ONCE", "stopShape": "NONE"}


def derive_ctx_from_intent(intent, topic=None, script="zh"):
    """把後端既有 intent 映射為閘門上下文（比關鍵詞猜測準；見《產品提及預算判定規則》）"""
    i = str(intent or "").upper()
    if str(script or "").lower() in ("english", "en"):
        return {"caseId": None, "productBudget": "OPEN", "stopShape": "NONE", "lang": "english"}
    if i in ("TRANSACTION", "SOP", "TECH"):
        return {"caseId": None, "productBudget": "OPEN", "stopShape": "SOP"}
    if i in ("EMOTION", "SKEPTICISM", "ATTACK"):
        return {"caseId": None, "productBudget": "OFF", "stopShape": "STRICT"}
    return {"caseId": None, "productBudget": "ONCE", "stopShape": "NONE"}


def metrics_from(results):
    n = len(results) or 1
    raw = sum(1 for r in results if r["trace"]["metrics"].get("raw_hit"))
    repair_ok = sum(1 for r in results if r["trace"]["metrics"].get("repair_ok"))
    blocked = sum(1 for r in results if r["trace"]["metrics"].get("blocked"))
    need = sum(1 for r in results if r["trace"]["metrics"].get("blocking_hit"))
    return {"total": len(results), "RAW_LEAKAGE_RATE": raw / n,
            "REPAIR_SUCCESS_RATE": (repair_ok / need) if need else 1.0,
            "FINAL_BLOCK_RATE": blocked / n, "raw": raw, "repairOk": repair_ok,
            "blocked": blocked, "needRepair": need}
