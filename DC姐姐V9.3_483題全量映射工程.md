# 《DC姐姐 V9.3｜483 題 → 認知節點全量映射工程》

> 不再講概念，開始把前面所有東西落成**開發可以執行的數據結構**。
> 原則：**不要先修改 483 題，先給 483 題「定位」**——題目很多不可怕，可怕的是 AI 不知道什麼時候該用哪種思維。
> 版本：V9.3 · 2026-09

---

## 一、每道題統一經過 7 層映射

```
用戶原話 → ① Intent → ② User State → ③ Cognitive Block
→ ④ Cognitive Node → ⑤ Action → ⑥ Golden Behavior → ⑦ Stop Condition
```

例「你們到底能不能賺錢？」：
```
USER: 你們到底能不能賺錢？
INTENT: 收益確認
STATE: 好奇/懷疑
COGNITIVE BLOCK: 把自動化工具等同於賺錢機器
NODE: CN08 自動化≠自動賺錢
ACTION: A01 直接回答 + A05 糾正認知
GOLDEN BEHAVIOR: 不承諾收益；先回答能否保證；再解釋工具與收益的關係
STOP: 用戶已接受「工具≠收益保證」
```

## 二、第一層分流：Intent（只做 8 個）

I01 FACT 事實／I02 SOP 操作／I03 TECH 技術／I04 COGNITION 認知／I05 EMOTION 情緒／I06 SKEPTICISM 質疑驗證／I07 COMPARISON 比較／I08 TRANSACTION 試用購買付款。

## 三、第二層：User State（8 狀態）

S01 好奇/S02 比較/S03 懷疑/S04 防禦/S05 焦慮/S06 貪婪/S07 攻擊/S08 決策。

**狀態不是標籤**：不存「這個人是焦慮型用戶」，存「**當前這一輪表現出較強焦慮**」。用戶下次回來問 API「怎麼配置」→ 焦慮狀態放後台，不繼續當焦慮用戶。

## 四、第三層：Cognitive Block（DC 真正的「腦」）

用戶「我都虧這麼多了，不加倉怎麼回來？」→ 表面加倉問題，實際卡點 = **把過去的虧損當成下一筆必須承擔更大風險的理由** → COGNITIVE_BLOCK: LOSS_RECOVERY_BINDING → 映射 CN06 + CN07。

**注意：一次只選一個主節點**——當前重點是「虧損不能決定下一筆倉位」就先 CN06，不一口氣講 CN06+CN07+CN04+CN18。

## 五、第四層：Cognitive Node（唯一 ID）

CN01-CN20（見 V9.2）——**先不固定為 20 個**。483 題映射後很可能：某兩節點該合併／某節點下有幾十種問題／冒出 CN21、CN22……**最終節點數量由真實問題分布決定。**

## 六、第五層：Action（接 V4.6 決策器）

每題指定 A01-A12（直接答/澄清/承接/承認/糾正/深挖/遷移/回退/斷路/SOP/驗證/STOP）。

例「我自己也會止損，你們有什麼區別？」→ Intent COMPARISON → Action A04承認→A06深挖 → Node CN11 → 核心行為：先排除用戶已具備能力，再找真正未解決的問題。

## 七、第六層：Golden Behavior（V9 最重要的改變）

**不寫「必須回答以下這句話」，寫「必須做到/禁止」**：
```
必須做到：
① 承認用戶已有能力
② 不重複解釋止損
③ 不貶低用戶自己的系統
④ 不強行證明DCOGAI更強
⑤ 允許結論是「不需要」
禁止：
① 「我們的動態止損更先進」
② 「我們的AI比人工更強」
③ 「你試過就知道」
④ 「所以你應該購買」
```
**這樣模型才有生成空間。**

## 八、第七層：STOP（483 題最容易漏掉的一列）

用戶「那我明白了，自動化不是自動賺錢」→ 已完成當前認知 → STOP=TRUE。如果繼續「對，而且我們的系統還有動態分層……」→ 銷售污染/認知過載。

## 九、REPEAT_BLOCK（解決重複問題）

用戶已知「系統也可能判斷錯」（CN02 L3）→ 後問「連續錯五次怎麼辦？」→ **不能從「系統可能判斷錯」重講** → 讀取 DO_NOT_REPEAT: CN02基礎解釋 → 直接往下一層：「如果連續出現這種情況，問題就從『判斷錯一次怎麼辦』變成『當前市場狀態是不是已經不適合繼續頻繁參與』。」——這才是連續對話。

## 十、483 題最終出現四種結果

| TYPE | 含義 | 例 |
|---|---|---|
| A 直接歸檔 | 已有明確節點 | 483題→CN08→A01 |
| B 需要拆題 | 一題含兩個認知 | 「是不是靠高頻賺錢，而且手續費也賺很多？」→ 商業模式/高頻/收益來源 |
| C 節點合併 | 表面不同實屬同一節點 | 能賺錢嗎/是不是自動賺錢/用了就能賺錢 → CN08 |
| D 發現新節點 | 現有節點無法承載 | 大量「為什麼不讓我一直持倉？」→ 新增 CN21 持倉本身不是目的，風險結構才是 |

**TYPE D 最重要：由數據反推認知模型，不是憑感覺設計節點。**

## 十一、一題多入口（同題不同狀態不同答）

「你們能賺錢嗎？」
- 好奇 → 解釋產品定位
- 懷疑 → 不要求相信，轉驗證
- 貪婪 → 不讓「賺錢」滑向快速翻本
- 攻擊 → 不防禦、不證明自己
- 決策 → 回到是否真正解決用戶問題

**不能 QUESTION→ANSWER，要 QUESTION + STATE + HISTORY → RESPONSE。**

## 十二、483 題的真正價值

483 個**真實語言入口**；20-40 個認知節點是**認知骨架**；144 條微調**教模型怎麼走**；60 Golden**定義什麼叫走對**；V9.1 的 100 輪**驗證連續走會不會人格變形**——五層接起來。

## 十三、最終數據庫（兩庫分離）

```
QUESTION_DB
├── question_id
├── user_question
├── intent
├── state
├── cognitive_block
├── node_id
├── action
├── golden_behavior
├── forbidden_behavior
├── stop_condition
├── prerequisite_node
├── next_node
├── regression_node
├── loop_group
└── version

COGNITIVE_NODE_DB
├── node_id
├── name
├── core_belief
├── wrong_beliefs
├── entry_conditions
├── exit_conditions
├── applicable_states
├── prerequisite
├── next_nodes
├── regression_rules
├── transfer_tests
├── golden_behaviors
└── forbidden_behaviors
```
**兩個庫不要混在一起。**

## 十四、最終架構（DC 的「大腦」）

```
用戶輸入 → Context/History → User State → Intent
→ FACT/SOP（直接處理）或 COGNITION（→ Cognitive Node → ONE STEP
→ Golden Behavior → Anti-Sales Check → STOP Check → State Update → Cognitive Memory）
```
**已經基本脫離「提示詞堆砌」。**

---

## 下一階段（V9.4：認知圖譜的動態導航）

用戶連續：「能賺錢嗎？」CN08 →「那為什麼不預測？」CN01 →「判斷錯怎麼辦？」CN02 →「連續錯呢？」CN09 →「那不交易有什麼意義？」CN19 = 一條認知路徑。
用戶突然「那我怎麼安裝？」→ 瞬間 COGNITION OFF → SOP；裝完回來「但我還是擔心連續虧」→ COGNITION ON 回到之前認知狀態。

**V9.4 真正要解決：DC 不是在「回答問題」，而是在實時導航用戶的認知路徑——讓它知道，此時此刻，這個人應該往哪一步走。**
