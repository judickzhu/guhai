# 《DC姐姐 V10.7｜USER_STATE 代碼化重構·設計》

> 把 V10.5 的完整 USER_STATE 從「prompt 隱式」升級為「代碼顯式」——可觀測/可調試/可跨會話。
> 現狀：[COG] 標記未生效（LLM 不輸出），DC 靠 LLM 自然記憶——效果有但不可控。
> 目標：dc-sister.js 加完整狀態對象，每輪更新，可持久化。
> 版本：V10.7 · 2026-09

---

## 一、狀態對象（V10.5 USER_STATE 代碼化）

```js
// state.user（新增，替代/增強現有 state.cog）
user: {
  emotion: { curiosity:0, skepticism:0, anxiety:0, greed:0, defense:0, attack:0, decision:0 },
  intent: null,           // FACT/SOP/TECH/COGNITION/EMOTION/SKEPTICISM/COMPARISON/TRANSACTION
  current_node: null,     // CN01-CN20
  level: 0,               // L0-L5
  block: '',              // 認知卡點
  understood: [],         // 已懂節點
  rejected: [],           // 已拒節點
  regression: false,
  loop: { detected: false, group: null },
  decision_dependency: 'NONE',  // NONE/LOW/MEDIUM/HIGH/CRITICAL
  confirmation_loop: 0,
  user_has_solution: 'UNKNOWN', // NONE/PARTIAL/STRONG/UNKNOWN
  sales_impulse: 0,
  next_target: null,
  do_not_repeat: [],      // 記憶壓縮器四欄
  stop: false
}
```

## 二、更新時機

每輪 `handleUserMessage(text)` 處理後更新：
1. **輸入判**：detectEmotion(text) → emotion 向量；detectIntent(text) → intent
2. **匹配判**：matchBest → current_node（命中 CN 節點）；level 依命中度/歷史
3. **檢查**：regression（用戶回退）/loop（重複主題）/dependency（決策依賴）
4. **記憶壓縮**：understood/rejected/do_not_repeat 四欄更新
5. **輸出**：LLM 回答後，sales_impulse 估算（詞檢測）

## 三、與現有機制銜接

| 現有 | V10.7 替代/增強 |
|---|---|
| state.cog（pos/understood/next/engine）| state.user（完整字段）|
| [COG] 標記（未生效）| 改為代碼直接維護（不依賴 LLM 標記）|
| prompt 內化規則 | 保留（規則描述），狀態改代碼判斷 |

## 四、關鍵函數（新增）

```js
function detectEmotion(text) { /* 情緒詞表 → 向量 */ }
function detectIntent(text) { /* I01-I08 分類 */ }
function updateUserState(text, match) { /* 每輪更新 state.user */ }
function checkRegression(node) { /* understood 含 node 但用戶回到舊邏輯 */ }
function checkLoop(topic) { /* 同主題 ≥2 次 */ }
function checkDecisionDependency(text) { /* 你決定/你告訴我 → 升級 */ }
```

## 五、持久化（跨會話）

- localStorage 存 `dc_user_state`（session 級）
- 後台存儲（需求⑪ 對接後）：user_cognitive_state 表

## 六、驗收

1. 3 輪連續對話後，state.user 反映真實認知推進（node/level/understood 更新）
2. 回退檢測：用戶回舊邏輯 → regression=true → prompt 觸發 A08
3. 循環檢測：同主題≥2 → loop → 觸發 A09
4. 跨會話：隔天再來 → 從 next_target 續接

## 七、風險與控制

- **回歸風險**：重構 handleUserMessage 可能破壞現有行為 → 分步：先加 state.user（只記錄不干預）→ 驗證 → 再讓規則讀它
- **性能**：detectEmotion/Intent 用詞表（快，無 LLM）
- **不影響 prompt**：規則保留，狀態供調試/持久化

## 八、一句話

**V10.7 = 把 V10.5 的 USER_STATE 從 prompt 隱式變代碼顯式**——可觀測、可調試、可跨會話；分步重構（先記錄後干預）控制回歸風險。
