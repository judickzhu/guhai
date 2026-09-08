# honglou 站點生成器

`build_honglou_site.py` 係 https://judickzhu.github.io/guhai/honglou/ 的唯一生成源。
站上 `honglou/` 全部檔案都可由呢度重建——**唔好直接手改 `honglou/` 嘅 HTML，改源頭再重跑**。

## 跑一次

```bash
pip install opencc-python-reimplemented     # 繁體統轉依賴；唔裝就原樣輸出
python3 tools/build_honglou_site.py
```

輸出目錄：`../honglou/`（repo 根下）。數據檔先喺 `tools/` 搵，搵唔到先返 repo 根。

## 檔案

| 檔案 | 用途 | 手改？ |
|---|---|---|
| `build_honglou_site.py` | 生成器。含 `CURATED`（逐回解碼素材，U=提問者原話／A=AI 待核／B=總綱）、`T()` 繁體統轉、詩詞槽位 | 係 |
| `honglou_mentions.json` | 總綱逐回素材 | 少改 |
| `honglou_dialogue_clean.json` | 對話清洗稿 | 少改 |
| `honglou_char_review.json` | **人物點評自填位**（提問者填） | 係 |
| `honglou_poem_review.json` | **詩詞解讀自填位**，120 回已預開空槽（提問者填） | 係 |
| `assets/zi-hao.js` `app.js` `style.css` `404.html` | 原樣複製到 `honglou/`，**唔過繁體統轉**（JS 內簡繁觸發詞要保留簡體） | 係 |

## 自填槽位

`honglou_poem_review.json` 格式：

```json
{ "5": [["判詞原句", "你嘅解讀"], ["另一首", "…"]] }
```

填完重跑生成器，入卡兼入子嗥知識庫；留空則站上顯示【待填】佔位，**AI 不代筆**。

## 規矩

- 全站以**繁體**為唯一底色，古籍白話文需要繁體支撐；保護字 `占／致／蒙／週` 唔轉。
- 提問者原話（粵語）逐字保留，唔轉書面語、唔加評價。
- 生成器改完，重跑後 `git diff honglou/` 應該得你預期嘅變動——多咗就係手改未入源頭。
