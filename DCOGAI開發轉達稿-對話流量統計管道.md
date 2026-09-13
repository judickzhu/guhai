# DCOGAI 開發轉達稿：對話流量/迭代統計管道（需求⑪ 具體化）

> **背景**：用戶無法得知後台 DC姐姐 的真實流量與能力水平——網站已通過 `/api/dc-sister/chat` 上報每次對話（message/history/script），但**後台無查詢/統計接口**（探測：conversations/chat-logs/logs/stats 全 404 或 403）。數據要麼沒存、要麼存了查不到。
> **目標**：把「已上報的對話」變成「可查的數據」——建表 + 查詢端點 + 統計報表。
> **狀態**：待開發 · 2026-09

---

## 一、現狀確認（探測證據）

| 端點 | 結果 | 含義 |
|---|---|---|
| `POST /api/dc-sister/chat` | ✅ 可用 | 網站每次對話都打這裡（matched_items+LLM reply）——**上報通道活著** |
| `GET /api/admin/conversations` 等 | 404 | **無對話查詢** |
| `GET /api/admin/stats` | 403 | 有但權限不夠/未開 |
| 網站側 | 無埋點 | dc-sister.js 純靠 /chat 上報 |

## 二、要做什麼（3 件事）

### 1. 確認/建 conversation_log 表

```sql
CREATE TABLE IF NOT EXISTS conversation_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  ts DATETIME DEFAULT CURRENT_TIMESTAMP,      -- 時間
  user_message TEXT NOT NULL,                  -- 用戶原話
  history_json JSON,                           -- 上下文（可選）
  matched_categories VARCHAR(255),             -- 命中的知識庫分類
  matched_item_ids VARCHAR(255),               -- 命中的題 id（c1,c10...）
  reply TEXT,                                  -- DC 回答
  source VARCHAR(16),                          -- llm / kb
  script VARCHAR(16),                          -- simplified/traditional
  ip_hash VARCHAR(64),                         -- 匿名用戶標識（隱私：只存 hash）
  session_id VARCHAR(64)                       -- 會話標識（跨輪）
);
```
> 如果 `/api/dc-sister/chat` 已經在寫某張表——確認表名後直接接查詢層，不重複建。

### 2. 查詢端點（admin，需權限）

```
GET /api/admin/chat-logs?from=&to=&category=&page=&size=
  → {total, items:[{ts, user_message, matched_categories, source, reply}]}

GET /api/admin/chat-stats?from=&to=
  → {
      total_conversations,          -- 對話量
      by_category: {分類: 數量},     -- 分類分布（用戶都在問什麼）
      by_source: {llm: n, kb: n},   -- LLM vs 知識庫直答
      by_hour: [0..23],             -- 時段分布（什麼時候人多）
      top_questions: [              -- 高頻問題（迭代線索）
        {question, count, matched_category}
      ]
    }

GET /api/admin/chat-export?from=&to=   -- 全量導出（CSV/JSON，供人工抽樣評測）
```

### 3. 低分監控（質量信號）

- 無 rating 機制時先用**代理信號**：
  - 用戶同輪短時間重問 → 可能不滿意
  - 用戶結束語帶負面情緒（「算了」「都是騙子」「沒用」）→ 抽樣人工評測
- 有 rating 後：直接統計低分分布

## 三、驗收

1. `GET /api/admin/chat-stats` 返回總量/分類分布/時段/高頻題
2. `GET /api/admin/chat-logs` 可翻頁查原始對話
3. 每次 `/chat` 調用都能在 logs 查到（上報即存）
4. 隱私：只存 ip_hash 不存明文 IP

## 四、優先級

**P1**（用戶明確需求：要知道 DC 能力水平）——比原 P2 升一級。
做完後：用戶能看到「每天多少人問、問什麼、DC 答得如何」→ 迭代有數據依據。

## 五、一句話

網站對話已在上報（/api/dc-sister/chat）——**只差後台把這些上報存下來、開查詢接口、出統計報表**。三個端點做完，DC姐姐 的真實流量和能力水平就有數據了。
