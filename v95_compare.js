#!/usr/bin/env node
// v81 vs v95 盲測對比 → 對比卡（markdown）
const fs = require('fs');
const path = require('path');
const BASE = __dirname;

const A = JSON.parse(fs.readFileSync(path.join(BASE, 'v94_gb60_results.json'), 'utf8')).results;
const B = JSON.parse(fs.readFileSync(path.join(BASE, 'v95_gb60_results.json'), 'utf8')).results;
const bmap = {};
for (const r of B) bmap[r.no] = r;

const num = v => (typeof v === 'number' ? v : -1);
function stat(rs) {
  const sc = rs.filter(r => num(r.judge.score) >= 0);
  return {
    n: sc.length,
    avg: sc.length ? sc.reduce((s, r) => s + num(r.judge.score), 0) / sc.length : 0,
    low: rs.filter(r => num(r.judge.score) >= 0 && num(r.judge.score) < 7).length,
    forb: rs.filter(r => r.judge.forbidden_hit == 1).length,
    banned: rs.filter(r => (r.judge.banned_words || []).length).length,
    stop: rs.filter(r => r.judge.stop_ok == 0).length,
    one: rs.filter(r => r.judge.one_action == 0).length,
    prod: rs.filter(r => r.judge.product_mention == 1).length,
    golden: rs.filter(r => r.judge.golden_met == 0).length,
  };
}
function batch(rs, from, to) {
  const g = rs.filter(r => { const n = parseInt(r.no.replace(/\D/g, ''), 10); return n >= from && n <= to && num(r.judge.score) >= 0; });
  return g.length ? g.reduce((s, r) => s + num(r.judge.score), 0) / g.length : 0;
}

const sa = stat(A), sb = stat(B);
const d = (x, y, invert = false) => {
  const v = y - x;
  const good = invert ? v < 0 : v > 0;
  const s = (v > 0 ? '+' : '') + v.toFixed(2);
  return v === 0 ? '—' : (good ? `✅ ${s}` : `⚠️ ${s}`);
};
const di = (x, y) => { const v = y - x; return v === 0 ? '—' : (v < 0 ? `✅ ${v}` : `⚠️ +${v}`); };

let md = `# 《DC姐姐 V10.7 GB60 盲測對比卡：v81 → v95》

> 同一 60 條 Golden Behavior Case、同一 judge（deepseek-v4-flash）、同一參數——**只換 prompt**。
> v81 = V4.1 交付版（21228 字／105 節）；v95 = v81 ＋ 外科手術式 V10.7 硬規則（+835 字／+0.4%）。
> 生成：${new Date().toISOString().slice(0, 19)}

---

## 一、總體對比

| 指標 | v81 | v95 | 變化 |
|:--|:--:|:--:|:--:|
| 有效樣本 | ${sa.n} | ${sb.n} | ${sb.n - sa.n >= 0 ? '+' : ''}${sb.n - sa.n} |
| **均分** | **${sa.avg.toFixed(2)}** | **${sb.avg.toFixed(2)}** | ${d(sa.avg, sb.avg)} |
| <7 分（不合格）| ${sa.low} | ${sb.low} | ${di(sa.low, sb.low)} |
| FORBIDDEN 違規 | ${sa.forb} | ${sb.forb} | ${di(sa.forb, sb.forb)} |
| 禁語命中 | ${sa.banned} | ${sb.banned} | ${di(sa.banned, sb.banned)} |
| STOP 未達標 | ${sa.stop} | ${sb.stop} | ${di(sa.stop, sb.stop)} |
| 一動作未達標 | ${sa.one} | ${sb.one} | ${di(sa.one, sb.one)} |
| 產品名違規 | ${sa.prod} | ${sb.prod} | ${di(sa.prod, sb.prod)} |
| GOLDEN 未達成 | ${sa.golden} | ${sb.golden} | ${di(sa.golden, sb.golden)} |

### 分批均分

| 批次 | 主題 | v81 | v95 | 變化 |
|:--|:--|:--:|:--:|:--:|
| GB-01~20 | 認知基礎 | ${batch(A, 1, 20).toFixed(2)} | ${batch(B, 1, 20).toFixed(2)} | ${d(batch(A, 1, 20), batch(B, 1, 20))} |
| GB-21~40 | 衝突／價格／連續 | ${batch(A, 21, 40).toFixed(2)} | ${batch(B, 21, 40).toFixed(2)} | ${d(batch(A, 21, 40), batch(B, 21, 40))} |
| GB-41~60 | 高級 | ${batch(A, 41, 60).toFixed(2)} | ${batch(B, 41, 60).toFixed(2)} | ${d(batch(A, 41, 60), batch(B, 41, 60))} |

---

## 二、逐條對比（只列有變化）

| # | 節點 | v81 | v95 | 變化 | v95 失敗標記 |
|:--|:--|:--:|:--:|:--:|:--|
`;

const changed = [];
for (const a of A) {
  const b = bmap[a.no];
  if (!b) continue;
  const x = num(a.judge.score), y = num(b.judge.score);
  if (x === y) continue;
  changed.push({ no: a.no, node: a.node, x, y, tag: b.judge.fail_tag || '' });
}
changed.sort((p, q) => (q.y - q.x) - (p.y - p.x));
for (const c of changed) {
  const v = c.y - c.x;
  md += `| ${c.no} | ${c.node} | ${c.x < 0 ? '?' : c.x} | ${c.y < 0 ? '?' : c.y} | ${v > 0 ? '✅ +' : '⚠️ '}${v} | ${(c.tag || '').slice(0, 50)} |\n`;
}

const up = changed.filter(c => c.y > c.x).length;
const down = changed.filter(c => c.y < c.x).length;
const same = A.length - changed.length;

md += `
**變化統計**：上升 ${up} 條／下降 ${down} 條／持平 ${same} 條（共 ${A.length}）。

---

## 三、四項硬規則達標率對比（v95 目標）

| 硬規則 | v81 達標率 | v95 達標率 | 目標 |
|:--|:--:|:--:|:--:|
| STOP 收尾達標 | ${((sa.n - sa.stop) / sa.n * 100).toFixed(1)}% | ${((sb.n - sb.stop) / sb.n * 100).toFixed(1)}% | 提升 |
| 禁語零命中 | ${((sa.n - sa.banned) / sa.n * 100).toFixed(1)}% | ${((sb.n - sb.banned) / sb.n * 100).toFixed(1)}% | 100% |
| 產品名合規 | ${((sa.n - sa.prod) / sa.n * 100).toFixed(1)}% | ${((sb.n - sb.prod) / sb.n * 100).toFixed(1)}% | 提升 |
| 一動作達標 | ${((sa.n - sa.one) / sa.n * 100).toFixed(1)}% | ${((sb.n - sb.one) / sb.n * 100).toFixed(1)}% | 提升 |

---

## 四、結論與後續

`;

if (sb.avg > sa.avg) {
  md += `**v95 均分提升 ${(sb.avg - sa.avg).toFixed(2)}**（${sa.avg.toFixed(2)} → ${sb.avg.toFixed(2)}）——外科手術式併入 V10.7 硬規則有效。\n\n`;
} else if (sb.avg === sa.avg) {
  md += `**v95 均分持平**（${sb.avg.toFixed(2)}）——需檢視硬規則位置/措辭是否被長 prompt 稀釋。\n\n`;
} else {
  md += `**v95 均分下降 ${(sa.avg - sb.avg).toFixed(2)}**——符合 AGENTS.md 告誡（規則堆疊會過載），需回退或改寫硬規則塊。\n\n`;
}
md += `後續：依本卡結果決定（①保留 v95 ②調整硬規則措辭再測 ③回退 v81）。`;

fs.writeFileSync(path.join(BASE, 'V10.7_GB60盲測對比卡_v81_vs_v95.md'), md);
console.log('對比卡已生成。');
console.log('v81 均分:', sa.avg.toFixed(2), '→ v95 均分:', sb.avg.toFixed(2), '| 升', up, '降', down, '平', same);
console.log('STOP 未達標:', sa.stop, '→', sb.stop, '| 禁語:', sa.banned, '→', sb.banned, '| 產品名:', sa.prod, '→', sb.prod);
