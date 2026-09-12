# 《DC姐姐 V4.2｜後台認知存儲 DB 設計（跨會話記憶）》

> 目標：把 V4.0/V4.1 的「會話內認知狀態」升級為「跨會話持久化」——用戶明天再來，DC 記得他昨天懂到哪。
> 這是需求⑩（官方 LLM 接入網站規則）的延伸：認知狀態需要 DB 支撐。
> 版本：V4.2 · 2026-09

---

## 一、核心表：user_cognitive_state（用戶認知狀態）

每用戶一條，跨會話持久化，對話時讀入、結束時更新。

```sql
CREATE TABLE user_cognitive_state (
  user_id          VARCHAR(64) PRIMARY KEY,      -- 用戶唯一標識（後台賬號/設備 id）
  updated_at       TIMESTAMP NOT NULL DEFAULT now(),

  -- ① 心理狀態（動態，非標籤）
  emotion          VARCHAR(16),                   -- 好奇/比較/懷疑/防禦/焦慮/貪婪/攻擊/決策
  emotion_score    JSONB,                         -- {焦慮:0.72, 懷疑:0.41, 貪婪:0.18}

  -- ② 認知軌跡
  cog_level        SMALLINT,                      -- L0-L5（認知階梯）
  cog_topic        VARCHAR(32),                   -- 當前認知主題：翻本/止損/系統價值…
  cog_understood   JSONB,                         -- ["不靠預測", "連虧要降倉"]（已理解，禁重講）
  cog_blocked      JSONB,                         -- ["等待也是交易"]（仍卡住）
  cog_debt         BOOLEAN DEFAULT FALSE,         -- 認知債務（說明白≠真懂）

  -- ③ 關係與階段
  relation_stage   SMALLINT,                      -- R0-R8（關係狀態機）
  sales_allowed    BOOLEAN DEFAULT FALSE,         -- 銷售允許度

  -- ④ 循環與回退
  loop_count       SMALLINT DEFAULT 0,            -- 重複主題計數（≥3 觸發 LOOP_BREAK）
  last_regression  TIMESTAMP,                     -- 最近認知回退時間
  regression_topic VARCHAR(32),                   -- 回退的主題

  -- ⑤ 未解決問題（對話連續性）
  unresolved       JSONB,                         -- [{topic:"休眠", resistance:"不交易=錯過機會"}]

  -- ⑥ 風險
  risk_level       SMALLINT,                      -- 0低/1中/2高
  last_risk_note   TEXT                           -- 最近風險事件（借錢/重倉/全押）
);
```

## 二、核心表：user_dialogue_log（對話日誌，診斷用）

```sql
CREATE TABLE user_dialogue_log (
  id               BIGSERIAL PRIMARY KEY,
  user_id          VARCHAR(64) NOT NULL,
  ts               TIMESTAMP NOT NULL DEFAULT now(),
  role             SMALLINT NOT NULL,             -- 0=用戶 1=DC
  text             TEXT,
  intent           VARCHAR(16),                   -- 事實/技術/認知/情緒/質疑/試用/購買
  cog_level_at     SMALLINT,                      -- 該輪認知層
  loop_flag        BOOLEAN DEFAULT FALSE,
  regression_flag  BOOLEAN DEFAULT FALSE,
  anti_sales       JSONB                          -- 反銷售三測結果 {t1,t2,t3}
);
CREATE INDEX idx_dialogue_user ON user_dialogue_log(user_id, ts);
```

## 三、核心表：user_cognitive_nodes（認知節點完成度）

```sql
CREATE TABLE user_cognitive_nodes (
  user_id     VARCHAR(64) NOT NULL,
  node_key    VARCHAR(64) NOT NULL,               -- 節點 id（如 'wait_is_trading'）
  status      SMALLINT DEFAULT 0,                 -- 0未接觸/1已講/2已理解(行為證明)/3已遷移
  proof_text  TEXT,                               -- 行為證明（用戶哪句話證明真懂）
  proven_at   TIMESTAMP,
  PRIMARY KEY (user_id, node_key)
);
```

## 四、對話流程（讀入 → 對話 → 更新）

```
用戶進入
 ↓
① 讀 user_cognitive_state（無則初始化）
 ↓
② 載入已理解(禁重講) + 卡住(下一節點) + 未解決(自然回接)
 ↓
③ 對話中每輪：
   - 更新 emotion/cog_level/loop_count
   - 檢測回退（對比已理解節點）→ 喚醒舊認知
   - 檢測循環（loop_count ≥3）→ LOOP_BREAK
   - 行為證明（用戶能複述/應用）→ 節點標 2/3
 ↓
④ 結束時：
   - 寫 user_dialogue_log（診斷）
   - 更新 user_cognitive_state + user_cognitive_nodes
```

## 五、跨會話接續範例

第 1 天（U001）：
- cog_level=2、卡住「等待=錯過」、未解決「休眠」
- 關係 R3、風險中

第 3 天（U001 再來）：
```
DC 自動帶入：
「上次你卡在『為什麼等待也是交易』——這兩天行情，剛好能拿來理解這個問題。」
```
- **不再重新認識用戶**（V4.2 方向一的核心驗收）

## 六、反銷售檢測器集成（診斷層）

每次 DC 回答後跑 `v63_anti_sales_checker.js` 三測：
- 任一命中 → 寫 user_dialogue_log.anti_sales（不攔截，只記錄質量分）
- 聚合指標：每用戶銷售污染率（供迭代）

## 七、遷移建議

1. **階段一**：先落地 `user_cognitive_state`（核心表，最小可用）
2. **階段二**：加 `user_dialogue_log`（診斷）
3. **階段三**：加 `user_cognitive_nodes`（行為證明閉環）
4. 字段皆 JSONB——後台可先存原始 JSON，逐步結構化

## 八、與現有後台對接

- 現有後台已有用戶體系 → user_id 直接複用
- API 建議：`GET /api/user/{id}/cognitive`（讀入）、`PUT /api/user/{id}/cognitive`（更新）
- 需配合需求⑩（官方 LLM 接入 v81 prompt）——prompt 負責「怎麼用」，DB 負責「記住」
