// 後台 q_en 同步：刪非書籍分類 → 重建（含 q_en 字段）；書籍分類保留不動
// 用法: ADMIN_TOKEN=xxx node rebuild_backend_qen_sync.js
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

// 讀網站 KB（含 q_en）
const KB = JSON.parse(fs.readFileSync('/Users/macbookair/Downloads/电子书ipa/网站/dc-sister/kb-data.json', 'utf8'))

async function main() {
  const nonBook = KB.categories.filter(c => !(c.name.includes('股路不归') || c.name.includes('股路不歸') || c.name.includes('股道')))
  console.log('非書籍分類（將重建含 q_en）:', nonBook.length)
  console.log('書籍分類（保留不動）: 2')
  let rebuilt = 0, skipped = 0
  for (const sc of nonBook) {
    // 刪同名分類
    const kbR = (await apiRetry('/api/admin/kb')).body || {};
    const cats = Array.isArray(kbR) ? kbR : (kbR.categories || [])
    const existing = cats.filter(c => c.name === sc.name)
    for (const c of existing) { try { await apiRetry('/api/admin/kb/category/' + c.id, 'DELETE') } catch (e) {} await sleep(0.3) }
    await sleep(0.5)
    // 建分類
    let catId = null
    for (let t = 0; t < 5 && !catId; t++) {
      try { const r = await apiRetry('/api/admin/kb/category', 'POST', { name: sc.name, icon: sc.icon || '', description: sc.description || '' }); catId = r.body && (r.body.id || r.body.category_id) } catch (e) {}
    }
    if (!catId) { console.log('FAIL 建分類: ' + sc.name); continue }
    // 建 qa（含 q_en）
    let ok = 0
    for (const it of sc.qa || []) {
      const payload = { category_id: String(catId), q: it.q, a: it.a, keywords: it.keywords }
      if (it.a_en) payload.a_en = it.a_en
      if (it.q_en) payload.q_en = it.q_en
      try { const r = await apiRetry('/api/admin/kb/qa', 'POST', payload); if (r.status < 400) ok++ } catch (e) {}
    }
    rebuilt++
    console.log(`重建 ${sc.name}: ${ok}/${(sc.qa||[]).length} 題（含 q_en）`)
  }
  console.log(`\n完成: 重建 ${rebuilt} 分類 | 書籍保留`)
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1) })
