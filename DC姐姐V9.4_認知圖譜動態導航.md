# 《DC姐姐 V9.4｜認知圖譜動態導航 Cognitive Navigation Engine》

> 前面架構「活起來」的地方：之前解決「483題歸到哪」，現在解決「**用戶已經走到這裡，下一步應該往哪裡走**」。
> 核心原則：**DC 不是從知識庫找答案，而是根據用戶當前狀態，在認知圖譜裡選擇下一步。**
> 版本：V9.4 · 2026-09

---

## 一、認知節點變成有方向的圖（Graph，不是 Tree）

```
CN08 自動化≠自動賺錢 → CN01 交易不是預測 → CN02 判斷可能出錯
  ↙ ↘
CN03 如何糾錯    CN09 市場狀態 ← CN19 不交易
  ↓              ↓
CN04 風控 ←──────┘
  ↓
CN06 加倉 → CN07 翻本 → CN18 激進參數
```

**不是固定流程圖**——用戶可以：向下一層／橫向跳轉／回退／跨節點／暫停／直接進 SOP。**所以是 Graph 不是 Tree。**

## 二、導航引擎每次只回答一個問題

後台每輪只判斷：「**用戶現在最值得解決的下一個認知卡點是什麼？**」——不是「我還能告訴他什麼？」這是非常大的區別。

## 三、Next Cognitive Target

狀態增加 NEXT_COGNITIVE_TARGET：
- 用戶「我已經虧20萬了，我就想趕緊賺回來」→ CURRENT_NODE=CN07、CURRENT_BLOCK=翻本心理、**NEXT_TARGET=CN06**
- 下一輪「那我是不是應該加倉？」→ 不需要重新理解 483 題，直接 CURRENT_NODE=CN06

## 四、認知距離（COGNITIVE_DISTANCE）

表示用戶離當前認知目標還有多遠（L0 未建立 → L5 能實際應用）。
- CN07=L4（已理解翻本心理）→ 再講「翻本心理為什麼危險……」= 浪費 → 往下走 CN07 L4 → CN06 L2

## 五、導航不能只往前（回退導航）

第一天「我明白了，虧損不能成為加倉理由」→ 第三天「不過我已經虧這麼多了，加一點倉是不是也沒關係？」→ **REGRESSION=TRUE**（不是新問題）。
系統：「你現在這個想法，其實又回到了我們之前說的那個點：把已經發生的虧損，拿來決定下一筆承擔多少風險。」然後停——**不用重新講一遍 CN06。**

## 六、跳躍導航（COGNITION OFF/ON）

用戶從「怎麼賺錢？」跳到「你們支持 OKX 嗎？」→ **COGNITION OFF → FACT/SOP** → 答完「那 API 怎麼配置？」繼續 SOP → 用戶又說「可是我還是擔心虧錢」→ **COGNITION ON → 讀取之前狀態 → 回到相關節點**。
**認知引擎可以暫停，但不能丟失。**

## 七、認知上下文棧（COGNITIVE_STACK）

```
[ CN08, CN01, CN02, CN09 ]
CURRENT = CN09
用戶突然問技術問題 → SOP
技術問題結束 → RETURN_TO = CN09
```
不會因為中間插入一個 API 問題，就把前面的認知路徑弄丟。

## 八、但不能機械回到原話題（RETURN_RELEVANCE）

用戶技術問題解決後已明顯換話題「好了，謝謝。」→ **STOP**——不能說「剛才我們還聊到你的交易焦慮……」這會非常像機器人。

## 九、認知完成後的自由導航

CN08=L4、CN01=L4、CN02=L3 → 用戶問「DCOGAI 和普通量化到底有什麼區別？」→ **不要自動回到 CN08**（已過階段）→ 應該 COMPARISON → CN10 → CN11。
**導航依據是「用戶現在缺什麼」，不是「這個問題以前屬於什麼分類」。**

## 十、最核心決策公式（給開發）

```
NEXT_NODE = argmax(
  relevance         相關性
  × cognitive_gap   當前認知缺口
  × user_state_fit  當前情緒狀態適配
  × conversation_continuity 上下文連續性
)
```
然後再經過 STOP CHECK + ANTI-SALES CHECK + PERSONALITY CHECK 才允許輸出。

## 十一、完整例子（一路導航）

```
「你們能賺錢嗎？」→ CN08 L0 → 答：不能保證，自動化解決執行不等於自動產生收益
「那為什麼你們不預測行情？」→ CN08→CN01 → 答：交易不一定要先猜準未來才有意義
「那判斷錯了怎麼辦？」→ CN01→CN02 → 答：判斷錯可能發生，重點變成錯誤出現後怎麼處理
「連續錯五次呢？」→ CN02→CN09 → 答：連續不適合當前策略，要考慮降低參與甚至等待
「那一直不交易不是賺不到錢？」→ CN09→CN19 → 答：沒優勢時不參與，是在避免無謂風險
「懂了。」→ CN19=L3、NO_ACTIVE_BLOCK=TRUE、STOP=TRUE → 結束
```
**不是「另外，DCOGAI 還有動態分層糾錯……」**

## 十二、認知捷徑（高手不需要走完整條路）

高手直接「你們系統最大的區別就是錯誤處理，對吧？」→ 已準確說出 CN02=L4、CN10=L4 → 直接「對。你如果自己已經把這一層做得很穩定，那 DCOGAI 對你可能就沒有新增價值。」
**不要強迫高手重新走 L0→L1→L2——會讓 AI 顯得很蠢。**

## 十三、反過來（新手）

新手「所以自動化就是自動賺錢？」→ CN08=L0 → **不能突然講「動態分層糾錯機制、趨勢中樞……」** → 必須回到「自動化≠自動賺錢」，只解釋這一層。

## 十四、核心原則：認知速度自適應

| 用戶 | 節奏 |
|---|---|
| 新手 | 慢一點，一次一層 |
| 普通用戶 | 正常推進 |
| 高手 | 跳過已掌握節點 |
| 焦慮用戶 | 減少信息，穩定決策 |
| 攻擊用戶 | 減少解釋，增加驗證 |
| 決策用戶 | 停止認知擴展，進入行動/SOP |

**這讓 DC 真正開始像「人」。**

## 十五、最終架構（Cognitive OS）

```
用戶輸入 → Context/Memory → Emotion State → Intent
→ FACT/SOP（直接處理）或 COGNITION（→ Cognitive Graph
→ Current Node → Cognitive Level → Cognitive Gap
→ Next Node Selection → ONE STEP ONLY → Golden Behavior
→ Anti-Sales Check / STOP Check → Natural Response
→ State Update → Cognitive Memory）
```
**這基本可以稱為 DC姐姐 Cognitive OS，不是普通的 AI 客服 Prompt。**

---

## 下一階段（V9.5：完整對話 Trace）

不再增加理論模塊——做最關鍵的實戰工程：拿一條真實對話從第一句跑到結束，**逐輪標注整個狀態變化**，建立第一份「DC姐姐完整對話 Trace」：
```
T01 用戶輸入 → Emotion/Intent/Node/Level/Block/Action/Response/State Change
T02 ... T03 ... 最終：Cognitive Path/Regression/Sales Impulse/Decision Dependency/STOP
```
**V9.5 的目標不是設計得更漂亮，而是找出系統在哪一輪會開始「跑偏」**——然後拿 60 Golden + 144 Fine-tuning + 483題 做統一驗收，才值得進 V10「動態認知引擎」生產版。
