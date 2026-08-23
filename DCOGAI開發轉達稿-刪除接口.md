# DCOGAI 開發轉達稿：知識庫刪除接口 Bug（P0）

> 直接轉發給 DCOGAI 後端開發。問題已探測到鐵證級別，按下方最小改動即可修復。
> 日期：2025-06

---

## 一、問題一句話

後台知識庫 QA 的 `id` 是**分類內序號**（每個分類都從 c1 開始編號），但 `DELETE /api/admin/kb/qa/{id}` 按**全局查找第一個 id** 刪除——不同分類的同 id 題會互相誤刪。

## 二、鐵證（已實測）

1. **id 非全局唯一**：POST 一條題返回 `id=c14`，但該 id **同時存在於 14 個分類**（每個分類都有自己的 c14）。
2. **DELETE 無安全調用方式**：
   - `DELETE /api/admin/kb/qa/c14` → 200「条目已删除」，但刪的是**別的 c14**（誤刪了「認知主題」的真實題）
   - `DELETE .../qa/c14` 帶 `body: {category_id}` → **仍無效**，照樣全局找第一個 c14（後端忽略 body）
   - `GET .../qa/c14?category_id=cat11` → 405
   - `GET /api/admin/kb/category/cat11/qa/c12` → 404（無按分類路由）
3. **影響**：網站↔後台同步時無法安全刪除多餘題（現有 6 條 + 1 條測試題無法清理）；誤刪會污染數據。

## 三、最小改動方案（建議 A+B 一起做，各 ~20 行）

### 方案 A：新增「帶分類定位」的刪除路由（根治）

```
DELETE /api/admin/kb/category/{catId}/qa/{id}
```

Express 示意（其他框架同理）：

```js
// 帶分類定位刪除：按 (category_id, id) 精確刪
app.delete('/api/admin/kb/category/:catId/qa/:id', async (req, res) => {
  const { catId, id } = req.params
  const category = await Category.findById(catId)
  if (!category) return res.status(404).json({ error: '分類不存在' })

  const qa = (category.qa || []).find(q => q.id === id)
  if (!qa) return res.status(404).json({ error: '題目不存在於該分類' })

  // 方案 B：刪前校驗 q 內容（雙保險，防調錯 id）
  if (req.body?.q && req.body.q !== qa.q) {
    return res.status(409).json({ error: 'q 內容不匹配，拒絕刪除（可能是 id 碰撞）' })
  }

  category.qa = category.qa.filter(q => q.id !== id)
  await category.save()
  res.json({ message: '条目已删除', deleted: { id: qa.id, q: qa.q } })
})
```

### 方案 B：舊路由加「衝突檢測 + 內容校驗」（兜底）

```js
// 舊路由加防誤刪：先查全庫有多少同 id，多於 1 個直接拒絕
app.delete('/api/admin/kb/qa/:id', async (req, res) => {
  const all = await findAllQAsById(req.params.id)   // 全庫掃描
  if (all.length > 1) {
    return res.status(409).json({
      error: `id 碰撞：${req.params.id} 存在於 ${all.length} 個分類，請改用 DELETE /category/{catId}/qa/{id}`
    })
  }
  if (!all.length) return res.status(404).json({ error: '不存在' })

  // 校驗 q（防止誤刪）
  if (req.body?.q && req.body.q !== all[0].q) {
    return res.status(409).json({ error: 'q 不匹配' })
  }
  await deleteQA(all[0])
  res.json({ message: '条目已删除' })
})
```

> 若後端是 Python/FastAPI/Flask，邏輯相同：路由加 `category_id` 參數 → 按 `(category_id, id)` 定位 → 刪前對比 `q`。

## 四、可選：徹底方案（一勞永逸，工作量中）

QA 改用**全局唯一 id**（UUID 或全局自增）——POST 時後端生成，前端不再用分類內序號。需要一次數據遷移 + 改所有引用。不急的話，方案 A+B 已夠。

## 五、修復後需配合做的事

1. 我（網站側）用新路由 `DELETE /category/{catId}/qa/{id}` 清理 7 條髒數據：
   - 衝突場景「這次扛回來了，下次也能扛回來」
   - 股路不歸 2 條 / 股道 3 條多餘題
   - 測試題 `_DELETE_TEST_唯一標記`（衝突場景）
2. 清理後後台 = 網站 2888 條，做全量一致性驗證
3. （另案）admin UI「客服知识库」tab 顯示分類總數 0 的問題（與 API 數據不一致，疑 UI 數據源 bug）——可另行排查

## 六、驗收標準

- [ ] `DELETE /category/{catId}/qa/{id}` 只刪指定分類的題，其他分類同 id 題完好
- [ ] `q` 不匹配時返回 409，不刪除
- [ ] 舊 `DELETE /qa/{id}` 遇 id 碰撞返回 409 提示，不再靜默誤刪
