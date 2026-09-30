#!/usr/bin/env node
// V10.7 GB60 盲測結果分析 → 評分卡（markdown）
const fs = require('fs');
const path = require('path');
const BASE = __dirname;

const raw = JSON.parse(fs.readFileSync(path.join(BASE, 'v94_gb60_results.json'), 'utf8'));
const R = raw.results;

const num = v => (typeof v === 'number' ? v : -1);
const scored = R.filter(r => num(r.judge.score) >= 0);
const avg = scored.length ? scored.reduce((s, r) => s + num(r.judge.score), 0) / scored.length : 0;

const forb = R.filter(r => r.judge.forbidden_hit == 1);
const banned = R.filter(r => (r.judge.banned_words || []).length);
const stopFail = R.filter(r => r.judge.stop_ok == 0);
const oneFail = R.filter(r => r.judge.one_action == 0);
const prodFail = R.filter(r => r.judge.product_mention == 1);
const goldenFail = R.filter(r => r.judge.golden_met == 0);
const low = R.filter(r => num(r.judge.score) >= 0 && num(r.judge.score) < 7);

// 分組（依 CASE 批次：01-20 認知基礎 / 21-40 衝突價格連續 / 41-60 高級）
function batchAvg(from, to) {
  const g = R.filter(r => { const n = parseInt(r.no.replace(/\D/g, ''), 10); return n >= from && n <= to && num(r.judge.score) >= 0; });
  return g.length ? (g.reduce((s, r) => s + num(r.judge.score), 0) / g.length) : 0;
}

let md = `# 《DC姐姐 V10.7 Golden Behavior 60 條盲測評分卡》

> 測試對象：**v81 prompt（V4.1 版）** × **V10.7 Golden Behavior 60 條行為契約**
> 目的：量出「現行 prompt」與「V10.7 行為契約」的**落差**——v81 prompt 完全不含 V10.6/V10.7 規則（A00／認知距離／產品名禁用／ONE PRIMARY 皆 0 命中）。
> 生成：${new Date().toISOString().slice(0, 19)}｜檔案：\`v94_gb60_results.json\`

---

## 一、總體成績

| 指標 | 數值 |
|:--|:--|
| 有效樣本 | ${scored.length} / ${R.length} |
| **均分** | **${avg.toFixed(2)}** |
| FORBIDDEN 違規 | ${forb.length} 條（${forb.map(r => r.no).join(', ') || '無'}）|
| 禁語命中 | ${banned.length} 條（${banned.map(r => r.no + ':' + (r.judge.banned_words || []).join('/')).join(', ') || '無'}）|
| STOP 未達標 | ${stopFail.length} 條 |
| 一動作未達標 | ${oneFail.length} 條 |
| 產品名違規 | ${prodFail.length} 條 |
| GOLDEN 未達成 | ${goldenFail.length} 條 |
| **<7 分（不合格）** | **${low.length} 條** |

### 分批均分

| 批次 | 主題 | 均分 |
|:--|:--|:--:|
| GB-01~20 | 認知基礎 | ${batchAvg(1, 20).toFixed(2)} |
| GB-21~40 | 衝突／價格／連續對話 | ${batchAvg(21, 40).toFixed(2)} |
| GB-41~60 | 高級（回退／循環／決策／跨天／人格）| ${batchAvg(41, 60).toFixed(2)} |

---

## 二、逐條成績

| # | 節點 | 分數 | FORBID | 禁語 | STOP | 一動作 | 產品名 | 失敗標記 |
|:--|:--|:--:|:--:|:--|:--:|:--:|:--:|:--|
`;

for (const r of R) {
  const j = r.judge;
  const s = num(j.score);
  md += `| ${r.no} | ${r.node} | ${s < 0 ? '?' : s} | ${j.forbidden_hit == 1 ? '❌' : ''} | ${(j.banned_words || []).join('/') || ''} | ${j.stop_ok == 0 ? '❌' : ''} | ${j.one_action == 0 ? '❌' : ''} | ${j.product_mention == 1 ? '❌' : ''} | ${(j.fail_tag || '').slice(0, 60)} |\n`;
}

md += `
---

## 三、失敗案例分析（<7 分）

`;
for (const r of low) {
  md += `### ${r.no}（${num(r.judge.score)} 分）｜${r.node}\n\n`;
  md += `- **用戶**：${r.input}\n`;
  md += `- **失敗標記**：${r.judge.fail_tag || '—'}\n`;
  md += `- **禁語**：${(r.judge.banned_words || []).join('、') || '無'}\n`;
  md += `- **DC 回答（前 300 字）**：\n\n> ${(r.answer || '').slice(0, 300).replace(/\n/g, '\n> ')}\n\n`;
}

md += `---

## 四、系統性缺陷歸因（跨案例模式）

`;

// 模式統計
const tags = {};
for (const r of R) {
  const t = (r.judge.fail_tag || '').trim();
  if (!t) continue;
  const key =
    /回問|反問|問句/.test(t) ? '結尾反問（STOP 未停）' :
    /延伸|說教|说教|尾巴|多餘|多余/.test(t) ? '多餘延伸／說教尾巴' :
    /禁語/.test(t) ? '禁語命中' :
    /產品|推銷|试用|試用/.test(t) ? '產品名違規' :
    /回層|重講|重讲/.test(t) ? '回層復讀' :
    /認知|教育/.test(t) ? '跳層／教育' : '其他';
  tags[key] = (tags[key] || 0) + 1;
}
const sorted = Object.entries(tags).sort((a, b) => b[1] - a[1]);
md += `| 模式 | 條數 |\n|:--|:--:|\n`;
for (const [k, v] of sorted) md += `| ${k} | ${v} |\n`;

md += `
**結論**：v81 prompt（V4.1）面對 V10.7 行為契約的主要落差集中在三處——
1. **STOP 收尾**：事務／價格／認知題答完後仍加反問或說教尾巴（V10.6 STOP Gate 未入 prompt）。
2. **禁語硬檢**：少數案例仍出現禁語（回本／穩賺），且伴隨計算回本、虧損對比逼單（V10.6 FORBIDDEN 未硬檢）。
3. **一動作／回層**：部分題目一次講多層或重講已懂認知（V10.6 ONE PRIMARY ACTION／禁止回層未入 prompt）。

---

## 五、v95 prompt 合併建議（外科手術式）

> 約束：v81 prompt 已 105 節／60165 bytes；AGENTS.md 告誡「規則堆到九式會過載（G4 8.9→7.2）」——**只補盲測證明缺失的硬規則，不整包併入 V10.6/V10.7**。

| 優先 | 補入規則 | 理由（盲測證據）|
|:--:|:--|:--|
| P0 | STOP Gate 硬規則：事務/價格/SOP 題答完即停，禁反問尾巴 | 本次 STOP 未達標 ${stopFail.length} 條 |
| P0 | 禁語硬檢（十詞）＋禁「計算回本」「虧損對比逼單」 | 禁語命中 ${banned.length} 條；GB03/GB11/GB21 |
| P1 | 產品名禁用區（PRODUCT_MENTION 預設 OFF） | 產品名違規 ${prodFail.length} 條 |
| P1 | 一輪一主要動作（ONE PRIMARY ACTION） | 一動作未達標 ${oneFail.length} 條 |
| P2 | 禁止回層（已懂不重講） | GB38 回層重講 |

**驗證方式**：合併後以同一 60 條 + 同一 judge 再跑一次（v95），對比均分與各項達標率提升。

---

## 六、誠實保留

1. 本輪量的是 **v81 prompt** 對 V10.7 契約的落差，**不是 V10.7 本身的成績**（V10.6/V10.7 是規格文檔，尚未併入 prompt）。
2. Judge 為 LLM 評審（deepseek-v4-flash），存在主觀性；禁語為程式化雙重檢查（較可靠）。
3. 情境依賴 CASE（GB19/41-47/50-54）以模擬前置對話補context，與真實長對話仍有差距。
`;

fs.writeFileSync(path.join(BASE, 'V10.7_GB60盲測評分卡.md'), md);
console.log('評分卡已生成: V10.7_GB60盲測評分卡.md');
console.log('均分:', avg.toFixed(2), '| 有效:', scored.length, '| 禁語:', banned.length, '| FORBIDDEN:', forb.length, '| <7分:', low.length);
