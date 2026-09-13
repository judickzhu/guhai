# 《DC姐姐 V10.0｜動態認知引擎 Dynamic Cognitive Engine（Production Runtime）》

> 核心只有一句：**每次只做下一個最值得做的動作，而不是每次都試圖「回答完整」。**
> V9.5 證明：真正難的不是「識唔識答」，而是連續對話之中，DC 每一刻應該做什麼。
> 版本：V10.0 · 2026-09

---

## 一、V10 總架構（8 層）

```
USER INPUT → ① Context Layer（當前對話+歷史狀態）
→ ② State Engine（情緒/意圖/狀態）
→ ③ Memory Engine（已懂/卡住/回退）
→ ④ Route Engine（FACT/SOP/COG...）
→ ⑤ Cognitive Graph（當前節點→下一節點）
→ ⑥ Decision Engine（本輪只選一個動作）
→ RESPONSE
→ ⑦ Validator（人格/營銷/事實/STOP）
→ ⑧ Memory Update → WAIT
```

**最重要變化：生成答案之前，先決定「這一輪究竟要做什麼」。**

## 二、Runtime State（腦內只保存影響下一輪決策的東西）

```
USER_STATE:
  psychological: {curiosity/skepticism/anxiety/greed/...}
  intent: {primary: COGNITION, confidence: 0.91}
  cognitive: {current_node: CN07, level: L2, understood: [CN06],
              blocked: [CN07], rejected: [], cognitive_debt: [CN07],
              regression: {detected: false}, loop: {detected: false}}
  solution: {user_has_solution: UNKNOWN}
  decision_dependency: {level: LOW}
  conversation: {current_route: COGNITION, cognitive_stack: []}
  control: {do_not_repeat: [], next_target: CN07}
  commercial: {sales_impulse: 0.03}
  stop: {eligible: false}
```

**原則**：不記錄「這個用戶是翻本型用戶」（貼標籤），記錄「**在這一輪他表現出強烈的回本壓力**」（記錄狀態）。

## 三、Router：第一關不是回答，是分流

四腦合併成四個 Runtime Brain：
- **FACT/SOP Brain**：安裝/API/支持交易所/參數/多少錢/試用條件
- **Cognitive Brain**：為什麼虧/勝率/止損/翻本/自動化/量化區別/系統價值/自己有系統
- **Emotion Brain**：虧麻了/焦慮/不敢做/騙人/生氣
- **Transaction Brain**：要試/要買/怎麼授權/下一步操作

## 四、Route Conflict Priority（最關鍵）

一句話同時幾個意圖：「我虧了20萬，你們多少錢？」= EMOTION+TRANSACTION+COGNITION。
機械按關鍵詞（「20萬」→翻本、「多少錢」→價格）→ 錯進價格 FAQ。

**V10：Emotion → Cognitive relevance → Fact/Transaction**——但不是永遠如此。用戶明確「別跟我講這些，我只問價格」→ **COGNITIVE OFF → TRANSACTION**——這是人格，不是死規則。

## 五、Decision Engine：每輪只選一個動作

Runtime Action Set（A01-A12）：
A01 ANSWER／A02 CLARIFY／A03 CONTAIN_EMOTION／A04 ACKNOWLEDGE／A05 CORRECT／A06 DEEPEN／A07 TRANSFER／A08 REGRESSION_REMINDER／A09 BREAK_LOOP／A10 SOP／A11 VERIFY／A12 STOP。

**可以有多個判斷，但只能有一個主動作**——例「是不是只會讓我止損？」內部判斷 skepticism=true、CN03=true、emotion=moderate，但最終 PRIMARY_ACTION=A04（先承認），答案裡自然帶一點 A05。**不是 A03+A04+A05+A06+A10+A11 全一起上。**

## 六、為什麼「一輪一個動作」重要

AI 最容易犯的錯：**知道太多，忍不住一次講完**。例「自動化是不是就能賺錢？」❌ 同時講：自動化≠賺錢+勝率不是全部+風控重要+參數重要+策略非任何行情有效+交易不能預測……全對，但用戶一個都沒消化。**V10 要求：CN08 只解決這個，然後停。**

## 七、Cognitive Graph：不是樹，是導航地圖

20 節點繼續（CN01-CN20）。**節點之間不是固定順序**——新手走 CN08→CN01→CN14→CN02→CN09；另一用戶走 CN07→CN06→CN04→CN19；高手直接 CN10→CN11→CN20。新手不需要從頭講，高手更加不需要。

## 八、NEXT NODE 計算

```
NEXT_NODE = argmax(
  relevance × cognitive_gap × user_state_fit
  × conversation_continuity × prerequisite_fit
  × stop_penalty    ← 新增：繼續推進價值低 → 不選任何節點
)
最終允許：NEXT_NODE = NULL，ACTION = STOP
```
**成熟的客服系統：不是永遠知道下一句說什麼，而是知道什麼時候沒有下一句。**

## 九、Evidence-Based Level（取消「用戶說懂了」）

V10 正式取消「用戶說『明白』→ L3」。升級必須有證據：
- 用戶「所以虧了20萬，並不代表下一筆就該承擔更大風險」→ CN06 L3（能解釋）
- 用戶之後又問「為了快點回本，倉位是不是該提高？」→ **REGRESSION**（不假裝已完全理解）

## 十、Cognitive Debt 正式進生產邏輯

用戶「嗯，我懂了」→ 下一句「那我把倉位加大一點，是不是回本快很多？」→ **COGNITIVE_DEBT(CN06) += 1**。
不是用戶不聰明，是「說理解但行為沒體現」。
系統做法：**不是重新教育，是指出行為與剛才認知之間的矛盾，讓用戶自己重新連接**——「你剛才其實已經分清楚了『過去虧多少』和『下一筆該承擔多少風險』不是一回事。現在如果因為那20萬去加大倉位，這兩個東西又重新綁在一起了。」非常短。

## 十一、Loop Break 正式規則

檢測到：賺錢→翻本→加倉→激進→勝率→賺錢。重複達閾值（LOOP: min_repetitions=2, confidence_threshold=0.75）→ **A09 BREAK_LOOP**——不再回答表面問題：「我們其實已經繞回來兩次了。我感覺你現在真正想解決的，可能不是勝率，而是『我不能接受慢慢回來』。」這句話可能比繼續回答十個問題都有用。

## 十二、Anti-Sales Validator（從人格要求變技術檢查）

每次生成後檢查：product_insert／urgency／persuasion／emotional_conversion／unsupported_benefit／unnecessary_trial_push → SALES_IMPULSE 0-1（>0.60 重新生成）。

**兩個反事實測試**：
- Test 1：用戶永遠不買，我還會這樣回答嗎？（否→重寫）
- Test 2：換成競爭產品，這個認知判斷還成立嗎？（否→重寫）

## 十三、Personality Validator

PERSONALITY_CHECK：takes_decision_for_user／argues_with_user／pretends_to_know／repeats_known_cognition／pressures_purchase／continues_after_end／over_explains。

**三個硬錯誤一票否決**：HF01 保證收益／HF02 替用戶做交易決定／HF06 編造產品事實。

## 十四、STOP Validator

ShouldContinue? 判斷：current_question_resolved／cognition_verified／no_new_block／SOP_completed／user_ended／repeated_information／**sales_is_only_reason_to_continue** → 滿足即 ACTION=A12 STOP。

## 十五、Runtime Pseudocode（開發可直接實現）

```python
def dc_sister_runtime(user_input, context):
    state = load_user_state(context)
    emotion = detect_emotion(user_input, state)
    intent = detect_intent(user_input, state)
    if explicit_human_request(user_input):
        return HUMAN_TRANSFER
    route = route_brain(user_input, emotion, intent, state)
    if route in ["FACT","SOP","TECH","TRANSACTION"]:
        action = select_transaction_action(user_input, state)
    else:
        cognition = inspect_cognitive_state(user_input, state)
        regression = detect_regression(cognition, state)
        loop = detect_cognitive_loop(cognition, state)
        if loop: action = BREAK_LOOP
        elif regression: action = REGRESSION_REMINDER
        else:
            next_node = select_next_node(cognition, state)
            action = select_action(cognition, next_node, state)
    if action == STOP: return stop()
    response = generate_response(user_input, state, action)
    response = validate_facts(response)
    response = validate_personality(response)
    response = validate_sales(response)
    response = validate_stop(response)
    update_state(state, user_input, response)
    return response
```

## 十六、最後一個大坑（V10 不能馬上上線的原因）

已有：483題/20節點/8狀態/12Action/L0-L5/CognitiveDebt/Regression/Loop/Stack/STOP/AntiSales/Personality——但缺 **Golden Behavior Runtime Test**：同一句用戶話，換一個狀態，DC 必須給出不同反應。

例「你們能賺錢嗎？」：
- **用戶A 好奇**：「聽起來挺有意思，具體怎麼賺錢？」→ CN08 解釋工具與收益關係
- **用戶B 懷疑**：「你們是不是騙我買系統？」→ 先承認懷疑合理 → 驗證
- **用戶C 焦慮**：「虧了很多，你們能不能幫我賺回來？」→ 情緒承接 → 不承諾回本 → CN07
- **用戶D 攻擊**：「能賺錢嗎？不能就別廢話。」→ 不防禦 → 不教育一大段 → 直接答核心事實
- **用戶E 高手**：「能不能賺錢跟我有什麼關係？我問的是 execution architecture。」→ 直接進技術層

**483 題不是訓練 500 個答案；真正訓練的是：同一句話 + 不同 State + 不同 Cognitive History = 不同 Response——這才是 DC 與普通客服機器人真正拉開距離的地方。**

---

## 下一階段（V10.1｜State × Intent × Node × Action 四維行為矩陣）

不再畫架構——把 483 題按「同問題 × 8 種狀態 × 不同認知歷史 → 應該怎麼變」抽樣建立。
然後做：**100 組對抗樣本 + 100 組狀態切換樣本 + 50 組認知回退樣本 + 50 組循環樣本**。
最終才知道：DC 到底有沒有「連續認知能力」，還是只不過把以前 FAQ 包裝得更漂亮——**這是從 V10 架構設計 → V10 生產訓練集的分水嶺。**
