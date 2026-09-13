// 1. 回覆快照（穩定版 34 分類/2889 題全簡體）：清空後台 → 用快照重建
// 2. 快照基礎上增量加 q_en（從簡體版 KB 讀 q_en，PUT 更新）
const fs = require('fs')
const https = require('https')
const TOKEN = process.env.ADMIN_TOKEN || ''
const HOST = 's.dcogai.com'
function api(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL('https://' + HOST + path)
    const opts = { method, headers: { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, timeout: 90000 }
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

// 讀快照（穩定版）
const SNAP = JSON.parse(fs.readFileSync('/Users/macbookair/Downloads/电子书ipa/网站/backend_snapshot_20260907_234054.json', 'utf8'))
const snapCats = Array.isArray(SNAP) ? SNAP : (SNAP.categories || [])
// 讀簡體版 KB（含 q_en）
const KB = JSON.parse(fs.readFileSync('/Users/macbookair/Downloads/电子书ipa/网站/kb-data_simplified.json', 'utf8'))

async function main() {
  // 1. 清空後台全部
  const kbR = (await apiRetry('/api/admin/kb')).body || {}
  const cats = Array.isArray(kbR) ? kbR : (kbR.categories || [])
  let deleted = 0
  for (const c of cats) {
    try { const r = await apiRetry('/api/admin/kb/category/' + c.id, 'DELETE'); if (r.status < 400) deleted++ } catch (e) {}
  }
  console.log('清空後台:', deleted, '分類')
  await sleep(1)

  // 2. 用快照重建（全簡體穩定版）
  let rebuilt = 0
  for (const sc of snapCats) {
    let catId = null
    for (let t = 0; t < 5 && !catId; t++) {
      try { const r = await apiRetry('/api/admin/kb/category', 'POST', { name: sc.name, icon: sc.icon || '', description: sc.description || '' }); catId = r.body && (r.body.id || r.body.category_id) } catch (e) {}
    }
    if (!catId) { console.log('FAIL 建分類: ' + sc.name); continue }
    let ok = 0
    for (const it of (sc.qa || sc.items || [])) {
      const payload = { category_id: String(catId), q: it.q, a: it.a, keywords: it.keywords || [] }
      if (it.a_en) payload.a_en = it.a_en
      try { const r = await apiRetry('/api/admin/kb/qa', 'POST', payload); if (r.status < 400) ok++ } catch (e) {}
    }
    rebuilt++
    console.log(`回覆快照 ${sc.name}: ${ok}/${(sc.qa||sc.items||[]).length}`)
  }
  console.log('\n快照回覆完成:', rebuilt, '分類')
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1) })
