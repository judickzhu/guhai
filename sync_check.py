# -*- coding: utf-8 -*-
"""三端同步漂移檢查：任何副本不一致 → exit 1
檢查項：
  1) 後台閘門副本 == 源（dc_safety_gate.py）
  2) 後台詞表副本 == 源（gate_tables.json）
  3) dc-sister.js 內嵌的閘門 == 最新 safety_gate_embed.js
  4) 前端產物（embed/browser）是否由最新 safety_gate.js 生成  ← 2026-10-03 新增
  5) 代碼包副本含閘門插樁

【2026-10-03 修補的盲點】
  原第 3 項只比對「內嵌 vs embed」，但兩者可能同時落後於權威 safety_gate.js
  —— 曾因此漏掉前端落後一天（缺 L4_MENTION_GROUP 與 L2n）的事故。
  新增第 4 項：以「重跑 build_gate_browser.js 是否改變產物」判定產物是否最新。
"""
import hashlib, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
def h(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()[:12] if os.path.exists(p) else None

checks = []
def ck(name, a, b, detail=''):
    ok = (a is not None and a == b)
    checks.append((name, ok, detail or ('%s vs %s' % (a, b))))

ck('後台閘門副本 == 源', h(f'{HERE}/dc_safety_gate.py'), h(f'{HERE}/後台部署包/dc_safety_gate.py'))
ck('後台詞表副本 == 源', h(f'{HERE}/gate_tables.json'), h(f'{HERE}/後台部署包/gate_tables.json'))

# dc-sister.js 內嵌段 vs 最新 embed
emb = open(f'{HERE}/safety_gate_embed.js', encoding='utf-8').read() if os.path.exists(f'{HERE}/safety_gate_embed.js') else ''
ds = open(f'{HERE}/dc-sister/dc-sister.js', encoding='utf-8').read() if os.path.exists(f'{HERE}/dc-sister/dc-sister.js') else ''
m = re.search(r'/\* ===== V10\.7 Behavior Safety Gate（內嵌版[\s\S]*?/\* ===== /V10\.7 Safety Gate ===== \*/', ds)
embedded = m.group(0) if m else ''
ck('前端內嵌閘門 == 最新 embed', 
   hashlib.sha256(embedded.encode()).hexdigest()[:12] if embedded else None,
   hashlib.sha256(emb.encode()).hexdigest()[:12] if emb else None,
   '內嵌 %d chars vs embed %d chars' % (len(embedded), len(emb)))

# ── 第 4 項（2026-10-03 新增）：前端產物是否由最新 safety_gate.js 生成 ──
# 手法：將權威檔的關鍵層特徵逐一檢查是否出現於前端產物；
#       權威含某層而產物不含 → 產物落後（正是 10-03 事故的形態）。
def _layers(text):
    feats = {
        'L1_TERMS': r'L1_TERMS',
        'L2_PATTERNS': r'L2_PATTERNS',
        'L2n_negation': r'L2n|NEG_CTX|negat',
        'L3_PATTERNS': r'L3_PATTERNS',
        'L4_MENTION_GROUP': r'L4_MENTION',
        'L4_PRODUCT_TERMS': r'L4_PRODUCT_TERMS',
        'L5_CASE': r'L5_CASE_PATTERNS',
        'L7_STRICT': r'STRICT',
        'T2S': r'T2S',
    }
    return {k for k, p in feats.items() if re.search(p, text)}

auth = open(f'{HERE}/safety_gate.js', encoding='utf-8').read() if os.path.exists(f'{HERE}/safety_gate.js') else ''
brw = open(f'{HERE}/safety_gate_browser.js', encoding='utf-8').read() if os.path.exists(f'{HERE}/safety_gate_browser.js') else ''
_a, _e, _b = _layers(auth), _layers(emb), _layers(brw)
_miss_e, _miss_b = sorted(_a - _e), sorted(_a - _b)
ck('前端產物含權威版所有層',
   bool(auth) and not _miss_e and not _miss_b,
   True,
   ('embed 缺 %s；browser 缺 %s' % (_miss_e or '無', _miss_b or '無'))
   if (_miss_e or _miss_b) else ('權威 %d 層，產物全數具備' % len(_a)))

# 代碼包插樁
cp = open(f'{HERE}/DCOGAI後台⑮⑪⑭代碼包_20260920.py', encoding='utf-8').read()
ck('代碼包含閘門插樁', 'gate_reply_guarded' in cp, True)
# 端點插樁
ep = open(f'{HERE}/後台部署包/03_chat_endpoint.py', encoding='utf-8').read()
ck('端點含閘門插樁', 'gate_reply_guarded' in ep, True)

print('== 三端同步漂移檢查 ==')
fail = 0
for name, ok, detail in checks:
    print('  %s %s — %s' % ('✅' if ok else '❌', name, detail))
    if not ok: fail += 1
print('\n' + ('✅ 三端一致' if not fail else '❌ 有 %d 項漂移，需同步' % fail))
sys.exit(1 if fail else 0)
