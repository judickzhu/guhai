// 增量補 q_en（在後台簡體快照基礎上，不刪分類）：
// 1. 刪除繁體殘留分類（我此前誤建的 cat43-50 等繁體名分類）
// 2. 對簡體分類逐題 PUT 加 q_en（帶完整 payload）
// 3. 補回缺失分類（若有被誤刪的，用簡體版重建）
const fs = require('fs')
const https = require('https')
const TOKEN = process.env.ADMIN_TOKEN || ''
const HOST = 's.dcogai.com'
function api(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL('https://' + HOST + path)
    const opts = { method, headers: { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, timeout: 60000 }
    const req = https.request(u, opts, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => { let j = null; try { j = d ? JSON.parse(d) : null } catch (e) {} resolve({ status: res.statusCode, body: j }) })
    })
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}
async function apiRetry(path, method, body, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try { const r = await api(path, method, body); if (r.status < 500) return r } catch (e) {}
    await new Promise(r => setTimeout(r, 1500))
  }
  throw new Error('api fail ' + path)
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const KB = JSON.parse(fs.readFileSync('/Users/macbookair/Downloads/电子书ipa/网站/kb-data_simplified.json', 'utf8'))

// 判斷分類名是否含繁體特徵字
const TRAD_CHARS = /[認知節點網絡風險審驗顧選損盤護啟動縮進執買賣開關計算機狀態測試價值驗證收縮系統規則連虧翻本思維訓練劇本問題]/ 
function isTradName(name) {
  // 簡體版分類名不含這些繁體字——但「产品功能」等簡體名也含「产」...用簡體版分類名集合判斷
  const simpNames = new Set(KB.categories.map(c => c.name))
  return !simpNames.has(name)
}

async function main() {
  const kbR = (await apiRetry('/api/admin/kb')).body || {}
  const cats = Array.isArray(kbR) ? kbR : (kbR.categories || [])
  console.log('後台分類數:', cats.length)

  // 1. 刪除「非簡體版分類名」的殘留（繁體重複 + 未知）
  let deleted = 0
  for (const c of cats) {
    if (isTradName(c.name)) {
      try { const r = await apiRetry('/api/admin/kb/category/' + c.id, 'DELETE'); if (r.status < 400) deleted++ } catch (e) {}
      console.log('刪繁體殘留:', c.id, c.name)
    }
  }
  console.log('已刪繁體殘留:', deleted)
  await sleep(1)

  // 2. 對每個簡體分類：存在則逐題 PUT 加 q_en；缺失則重建
  let updated = 0, rebuilt = 0
  for (const sc of KB.categories) {
    const kbR2 = (await apiRetry('/api/admin/kb')).body || {}
    const cats2 = Array.isArray(kbR2) ? kbR2 : (kbR2.categories || [])
    const existing = cats2.filter(c => c.name === sc.name)
    if (existing.length) {
      // 分類存在：逐題 PUT 加 q_en
      const haveQ = new Set(existing.flatMap(c => (c.qa || c.items || []).map(i => i.q)))
      for (const it of sc.qa || []) {
        if (!it.q_en) continue
        // 找到後台對應題 id
        let target = null
        for (const c of existing) {
          const qa = (c.qa || c.items || []).find(i => i.q === it.q)
          if (qa) { target = qa; break }
        }
        if (!target) continue
        const payload = { category_id: String(existing[0].id), q: it.q, a: it.a, keywords: it.keywords || [] }
        if (it.a_en) payload.a_en = it.a_en
        if (it.q_en) payload.q_en = it.q_en
        try { const r = await apiRetry('/api/admin/kb/qa/' + target.id, 'PUT', payload); if (r.status < 400) updated++ } catch (e) {}
      }
      console.log(`更新 ${sc.name}: q_en 已補`)
    } else {
      // 分類缺失：重建（含 q_en）
      let catId = null
      for (let t = 0; t < 5 && !catId; t++) {
        try { const r = await apiRetry('/api/admin/kb/category', 'POST', { name: sc.name, icon: sc.icon || '', description: sc.description || '' }); catId = r.body && (r.body.id || r.body.category_id) } catch (e) {}
      }
      if (!catId) { console.log('FAIL 建: ' + sc.name); continue }
      let ok = 0
      for (const it of sc.qa || []) {
        const payload = { category_id: String(catId), q: it.q, a: it.a, keywords: it.keywords }
        if (it.a_en) payload.a_en = it.a_en
        if (it.q_en) payload.q_en = it.q_en
        try { const r = await apiRetry('/api/admin/kb/qa', 'POST', payload); if (r.status < 400) ok++ } catch (e) {}
      }
      rebuilt++
      console.log(`重建 ${sc.name}: ${ok}/${(sc.qa||[]).length}`)
    }
  }
  console.log(`\n完成: 刪繁體殘留 ${deleted} | 更新 q_en ${updated} 題 | 重建 ${rebuilt} 分類`)
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1) })
