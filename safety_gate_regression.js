#!/usr/bin/env node
/**
 * DC姐姐 V10.7｜Safety Gate 回歸測試套件（CI 用，**離線確定性**，不需要 API）
 *
 * 語料：320 條真實回答
 *   ① 實驗語料 160 條（v96/v97/v98/v99 三次鎖定實驗，案例 GB001/GB003/GB019）
 *   ② 網頁盲測 100 條（5 個 prompt × 20 案例）
 *   ③ 引擎 GB60  60 條（v81 prompt × 60 案例）
 *
 * 斷言（hard = 擋 CI）：
 *   H1 閘門輸出不得含任何禁語（閘門不可以放錯）
 *   H2 閘門輸出不得殘留阻斷級違規
 *   H3 FINAL_BLOCK_RATE 不得上升超過基線 + 0
 *   H4 REPAIR_SUCCESS_RATE 不得低於基線
 *   H5 CONTENT_KEEP_RATIO 不得低於基線 − 0.05
 *   S1 閘門誤報數（評審未標但閘門阻斷）不得超過基線 + 1（soft，只警告）
 *
 * 用法：node safety_gate_regression.js [--update-baseline] [--json]
 * 退出碼：0 = 全通過；1 = 有 hard 斷言失敗
 */
'use strict';
const fs = require('fs');
const path = require('path');
const gate = require('./safety_gate');

const BASE = __dirname;
const BASELINE_FILE = path.join(BASE, 'safety_gate_baseline.json');
const UPDATE = process.argv.includes('--update-baseline');
const JSON_OUT = process.argv.includes('--json');

// ── 政策（與驗證器一致；由 Router 提供，閘門不自行猜）──
const WPOLICY = { GB002:'OFF',GB003:'OFF',GB007:'OFF',GB012:'OFF',GB013:'OFF',GB014:'OFF',GB017:'OFF',GB018:'OFF',GB019:'OFF',GB020:'OFF',
  GB001:'ONCE',GB004:'ONCE',GB005:'ONCE',GB006:'ONCE',GB008:'ONCE',GB009:'ONCE',GB010:'ONCE',GB011:'ONCE',GB015:'ONCE',GB016:'ONCE' };

function stopShapeOf(action, state) {
  const emo = /焦虑|崩潰|崩溃|攻击|恐慌/.test(state || '');
  if (emo || action.includes('A12')) return 'STRICT';
  if (action.includes('A10') || action.includes('A11')) return 'SOP';
  return 'NONE';
}

const WEB = JSON.parse(fs.readFileSync(path.join(BASE, 'DC姐姐V10.7_行為訓練集_网页版GB001-020.json'), 'utf8')).samples;
const WEBMAP = {}; for (const c of WEB) WEBMAP[c.sample_id] = c;
const G60 = JSON.parse(fs.readFileSync(path.join(BASE, 'DC姐姐V10.7_行為訓練集_GB60.json'), 'utf8')).samples;
const G60MAP = {}; for (const c of G60) G60MAP[c.sample_id] = c;

const items = [];   // { group, tag, caseId, answer, ctx, judge }

// ① 實驗語料
for (const f of ['v96_banned_experiment.json', 'v97_shenzhuan_experiment.json', 'v99_noliteral_experiment.json']) {
  const p = path.join(BASE, f);
  if (!fs.existsSync(p)) continue;
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const r of d.records) {
    const c = WEBMAP[r.case_id] || {};
    items.push({
      group: 'exp', tag: `${f.replace(/\.json$/, '')}/${r.case_id}#${r.run}`, caseId: r.case_id, answer: r.answer || '',
      ctx: { productBudget: WPOLICY[r.case_id] || 'OFF', caseId: r.case_id, stopShape: stopShapeOf(c.expected_action, c.user_state) },
      judge: {},
    });
  }
}
// ② 網頁盲測
for (const f of ['v96_web20_v81_results.json','v96_web20_v95_results.json','v96_web20_v96_results.json','v96_web20_v97_results.json','v96_web20_v97b_results.json']) {
  const p = path.join(BASE, f);
  if (!fs.existsSync(p)) continue;
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const r of d.results) {
    const c = WEBMAP[r.no] || {};
    items.push({
      group: 'web20', tag: `${d.meta.prompt_v || '?'}/${r.no}`, caseId: r.no, answer: r.answer || '',
      ctx: { productBudget: WPOLICY[r.no] || 'OFF', caseId: r.no, stopShape: stopShapeOf(c.expected_action, c.user_state) },
      judge: r.judge || {},
    });
  }
}
// ③ 引擎 GB60
{
  const p = path.join(BASE, 'v94_gb60_results.json');
  if (fs.existsSync(p)) {
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const r of d.results || d) {
      const c = G60MAP[r.no] || {};
      const action = c.expected_action || '';
      const isSop = action.includes('A10') || action.includes('A11');
      items.push({
        group: 'gb60', tag: `gb60/${r.no}`, caseId: r.no, answer: r.answer || '',
        ctx: { productBudget: isSop ? 'OPEN' : 'ONCE', caseId: r.no, stopShape: stopShapeOf(action, c.user_state) },
        judge: r.judge || {},
      });
    }
  }
}

// ── 跑閘門（確定性模式）──
const BANNED = gate.L1_TERMS;
const rows = items.map(it => {
  const res = gate.run({ userInput: '', answer: it.answer, ctx: it.ctx });
  const outText = res.answer;
  const residual = gate.scan('', outText, it.ctx).filter(v => v.severity !== 'MEDIUM');
  const bannedInOut = [...new Set(BANNED.filter(w => gate.canonicalize(outText).includes(gate.canonicalize(w))))];
  const lenIn = it.answer.replace(/\s/g, '').length, lenOut = outText.replace(/\s/g, '').length;
  const jf = it.judge.forbidden_hit == 1 || (it.judge.banned_words || []).length > 0;
  const jt = !!String(it.judge.fail_tag || '').trim();
  return {
    ...it, out: outText,
    layers: res.violations.map(v => v.layer),
    blocking: res.violations.filter(v => v.severity !== 'MEDIUM'),
    rawHit: !!res.trace.metrics.raw_hit, blockingHit: !!res.trace.metrics.blocking_hit,
    repaired: !!res.trace.metrics.repair_ok, blocked: res.blocked,
    residual: residual.map(v => v.layer + ':' + v.term), bannedInOut,
    keep: lenIn ? lenOut / lenIn : 1,
    judgeAny: jf || jt, judgeForbidden: jf,
  };
});

const need = rows.filter(r => r.blockingHit);
const metrics = {
  corpus: rows.length,
  raw: rows.filter(r => r.rawHit).length,
  needRepair: need.length,
  repaired: rows.filter(r => r.repaired).length,
  blocked: rows.filter(r => r.blocked).length,
  keepRatio: need.length ? need.reduce((s, r) => s + r.keep, 0) / need.length : 1,
  residualViolations: rows.filter(r => r.residual.length).length,
  bannedInOutput: rows.filter(r => r.bannedInOut.length).length,
  falsePositives: rows.filter(r => r.blocking.length && !r.judgeAny && r.group !== 'exp').length, // 實驗語料無評審
  layerCount: rows.reduce((m, r) => { for (const l of r.layers) m[l] = (m[l] || 0) + 1; return m; }, {}),
  byGroup: ['exp', 'web20', 'gb60'].reduce((m, g) => {
    const rs = rows.filter(r => r.group === g);
    const nd = rs.filter(r => r.blockingHit);
    m[g] = { n: rs.length, raw: rs.filter(r => r.rawHit).length, blocked: rs.filter(r => r.blocked).length,
             keep: nd.length ? nd.reduce((s, r) => s + r.keep, 0) / nd.length : 1 };
    return m;
  }, {}),
};

const base = fs.existsSync(BASELINE_FILE) ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) : null;
const checks = [];
const add = (id, desc, ok, detail, soft) => checks.push({ id, desc, ok, detail, soft: !!soft });

add('H1', '閘門輸出不得含禁語', metrics.bannedInOutput === 0, `含禁語的輸出 ${metrics.bannedInOutput} 條`);
add('H2', '閘門輸出不得殘留阻斷級違規', metrics.residualViolations === 0, `殘留 ${metrics.residualViolations} 條`);
if (base) {
  add('H3', 'FINAL_BLOCK 不得上升', metrics.blocked <= (base.metrics.blocked ?? 0), `基線 ${base.metrics.blocked} → 現在 ${metrics.blocked}`);
  add('H4', 'REPAIR_SUCCESS_RATE 不得下降',
    (metrics.needRepair ? metrics.repaired / metrics.needRepair : 1) >= (base.metrics.needRepair ? base.metrics.repaired / base.metrics.needRepair : 1) - 1e-9,
    `基線 ${(base.metrics.repaired / (base.metrics.needRepair || 1)).toFixed(3)} → 現在 ${(metrics.repaired / (metrics.needRepair || 1)).toFixed(3)}`);
  add('H5', 'CONTENT_KEEP_RATIO 不得低於基線−0.05', metrics.keepRatio >= (base.metrics.keepRatio ?? 1) - 0.05,
    `基線 ${(base.metrics.keepRatio ?? 0).toFixed(3)} → 現在 ${metrics.keepRatio.toFixed(3)}`);
  add('S1', '閘門誤報不得超過基線+1', metrics.falsePositives <= (base.metrics.falsePositives ?? 0) + 1,
    `基線 ${base.metrics.falsePositives} → 現在 ${metrics.falsePositives}`, true);
} else {
  add('B0', '（首次執行）建立基線', true, '尚未有基線，本次結果將寫入 safety_gate_baseline.json');
}

const hardFail = checks.filter(c => !c.ok && !c.soft);

if (!JSON_OUT) {
  console.log(`== DC姐姐 Safety Gate 回歸測試 ==`);
  console.log(`語料 ${metrics.corpus} 條 ｜ RAW ${metrics.raw} ｜ 需修復 ${metrics.needRepair} ｜ BLOCK ${metrics.blocked}`);
  console.log(`分層命中 ${JSON.stringify(metrics.layerCount)}`);
  console.log(`CONTENT_KEEP_RATIO ${(metrics.keepRatio * 100).toFixed(1)}% ｜ 輸出含禁語 ${metrics.bannedInOutput} ｜ 殘留違規 ${metrics.residualViolations}`);
  console.log(`分組：` + Object.entries(metrics.byGroup).map(([g, v]) => `${g} n=${v.n} raw=${v.raw} keep=${(v.keep * 100).toFixed(1)}%`).join(' | '));
  console.log('');
  for (const c of checks) console.log(`  ${c.ok ? '✅' : (c.soft ? '⚠️ ' : '❌')} [${c.id}] ${c.desc} — ${c.detail}`);
  console.log(`\n${hardFail.length ? '❌ 失敗 ' + hardFail.length + ' 項' : '✅ 全部 hard 斷言通過'}`);
}

const result = { meta: { ts: new Date().toISOString(), corpus: metrics.corpus, groups: ['exp', 'web20', 'gb60'] }, metrics, checks };
fs.writeFileSync(path.join(BASE, 'safety_gate_regression_result.json'), JSON.stringify(result, null, 1));

if (UPDATE || !base) {
  fs.writeFileSync(BASELINE_FILE, JSON.stringify({ meta: { ts: new Date().toISOString(), note: '回歸基線（--update-baseline 更新）' }, metrics }, null, 1));
  if (!JSON_OUT) console.log(`\n已寫入基線：${path.basename(BASELINE_FILE)}`);
}

process.exit(hardFail.length ? 1 : 0);
