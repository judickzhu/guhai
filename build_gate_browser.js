#!/usr/bin/env node
/**
 * 由 safety_gate.js 產生兩個前端產物（與 Node 版、Python 版同源）：
 *   1) safety_gate_browser.js  —— <script> 引入，掛 window.DCSafetyGate
 *   2) safety_gate_embed.js    —— IIFE 內嵌版，可直接 splice 進 dc-sister.js（零 HTML 改動）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = __dirname;

let src = fs.readFileSync(path.join(BASE, 'safety_gate.js'), 'utf8');

// 0) 去 shebang、CLI 自測塊、CommonJS 匯出
src = src.replace(/^#![^\n]*\n/, '');
src = src.replace(/\nif \(require\.main === module\) \{[\s\S]*?\n\}\s*$/, '\n');
const exportRe = /module\.exports = \{[\s\S]*?\n\};/;
if (!exportRe.test(src)) { console.error('找不到 module.exports'); process.exit(1); }
src = src.replace(exportRe, '');

// 共用前端層（deriveCtx / gateText / _api）
const FRONT = `
// ─────────────────────────────────────────────────────────────
// 前端便利層（V10.7）
// ─────────────────────────────────────────────────────────────

/** 前端 Router（簡化版，與後台 derive_ctx 規則一致） */
function deriveCtx(message, lang) {
  const L = String(lang || '').toLowerCase();
  if (L === 'en' || L === 'english') {
    return { caseId: null, productBudget: 'OPEN', stopShape: 'NONE', lang: 'english' };
  }
  const msg = String(message || '');
  const TXN = /(怎麼裝|怎么装|安裝|安装|綁定|绑定|權限|权限|API|價格|价格|多少錢|多少钱|退款|分期|客服|下載|下载|開通|开通|試用|试用)/;
  const EMO = /(虧|亏|怕|崩潰|崩溃|焦慮|焦虑|睡不著|睡不着|翻本|騙|骗|割韭菜|垃圾|沒用|没用|後悔|后悔|不敢|完了)/;
  if (TXN.test(msg)) return { caseId: null, productBudget: 'OPEN', stopShape: 'SOP' };
  if (EMO.test(msg)) return { caseId: null, productBudget: 'OFF', stopShape: 'STRICT' };
  return { caseId: null, productBudget: 'ONCE', stopShape: 'NONE' };
}

/** 一行接入：gateText(reply, 用戶原話, lang) → { answer, blocked, violations, trace }（fail-safe） */
function gateText(reply, userInput, lang) {
  const text = reply == null ? '' : String(reply);
  try {
    const ctx = deriveCtx(userInput, lang);
    return run({ userInput: userInput || '', answer: text, ctx: ctx });
  } catch (e) {
    let banned = [];
    try { banned = L1_TERMS.filter(function (w) { return canonicalize(text).indexOf(canonicalize(w)) >= 0; }); } catch (_) {}
    if (!banned.length) return { answer: text, violations: [], blocked: false, degraded: true, trace: { metrics: { gate_error: 1 } } };
    return { answer: SAFE_FALLBACK, violations: [], blocked: true, degraded: true, trace: { metrics: { gate_error: 1 } } };
  }
}

const _api = {
  canonicalize: canonicalize, stripNoise: stripNoise, locate: locate, scan: scan, run: run,
  metricsFrom: metricsFrom, applyTable: applyTable, rewriteTerms: rewriteTerms,
  dropViolatingSentences: dropViolatingSentences,
  L1_TERMS: L1_TERMS, L2_PATTERNS: L2_PATTERNS, L3_PATTERNS: L3_PATTERNS,
  L4_PRODUCT_TERMS: L4_PRODUCT_TERMS, L4_PUSHBACK: L4_PUSHBACK,
  PHRASE_TABLE: PHRASE_TABLE, L3_REWRITE: L3_REWRITE, TERM_FALLBACK: TERM_FALLBACK,
  L5_CASE_PATTERNS: L5_CASE_PATTERNS, L6_ENGINE_PATTERNS: L6_ENGINE_PATTERNS,
  LOCAL_REWRITE_MAX: LOCAL_REWRITE_MAX, SAFE_REGEN_MAX: SAFE_REGEN_MAX,
  SAFE_FALLBACK: SAFE_FALLBACK, BUDGETS: BUDGETS, resolveBudget: resolveBudget,
  deriveCtx: deriveCtx, gateText: gateText, version: 'V10.7'
};
`;

const HEAD_BROWSER = `/* DC姐姐 V10.7｜Behavior Safety Gate（瀏覽器版，由 build_gate_browser.js 生成，請勿手改）
 * 來源：safety_gate.js（同一份詞表與邏輯）
 * 用法：<script src="dc-sister/safety_gate_browser.js"></script>
 *       var r = window.DCSafetyGate.gateText(reply, userQuery, state.lang); reply = r.answer;
 */
`;
const browser = HEAD_BROWSER + "'use strict';\n" + src + FRONT +
  "\nif (typeof window !== 'undefined') { window.DCSafetyGate = _api; }\n" +
  "if (typeof module !== 'undefined' && module.exports) { module.exports = _api; }\n";
fs.writeFileSync(path.join(BASE, 'safety_gate_browser.js'), browser);

const embed = [
  '/* ===== V10.7 Behavior Safety Gate（內嵌版，由 build_gate_browser.js 生成，請勿手改） ===== */',
  '(function () {',
  "'use strict';",
  src,
  FRONT,
  '  if (typeof window !== "undefined") { window.DCSafetyGate = _api; }',
  '})();',
  '/* ===== /V10.7 Safety Gate ===== */',
].join('\n');
fs.writeFileSync(path.join(BASE, 'safety_gate_embed.js'), embed);

console.log('已產出 safety_gate_browser.js |', browser.length, 'chars');
console.log('已產出 safety_gate_embed.js   |', embed.length, 'chars');
