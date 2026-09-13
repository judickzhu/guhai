// 後台全簡體重建：刪全部非書籍分類（簡/繁殘留）→ 用簡體版（全簡體+q_en）重建；書籍分類也重建（全簡體）
// 用法: ADMIN_TOKEN=xxx node rebuild_backend_qen_clean.js
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

async function main() {
  // 1. 刪除後台全部分類（含書籍——全簡體重建）
  const kbR = (await apiRetry('/api/admin/kb')).body || {}
  const cats = Array.isArray(kbR) ? kbR : (kbR.categories || [])
  let deleted = 0
  for (const c of cats) {
    try { const r = await apiRetry('/api/admin/kb/category/' + c.id, 'DELETE'); if (r.status < 400) deleted++ } catch (e) {}
  }
  console.log('已刪後台分類:', deleted)
  await sleep(1)
  // 2. 用簡體版全量重建（34 分類，含 q_en）
  let rebuilt = 0
  for (const sc of KB.categories) {
    let catId = null
    for (let t = 0; t < 5 && !catId; t++) {
      try { const r = await apiRetry('/api/admin/kb/category', 'POST', { name: sc.name, icon: sc.icon || '', description: sc.description || '' }); catId = r.body && (r.body.id || r.body.category_id) } catch (e) {}
    }
    if (!catId) { console.log('FAIL 建分類: ' + sc.name); continue }
    let ok = 0
    for (const it of sc.qa || []) {
      const payload = { category_id: String(catId), q: it.q, a: it.a, keywords: it.keywords }
      if (it.a_en) payload.a_en = it.a_en
      if (it.q_en) payload.q_en = it.q_en
      try { const r = await apiRetry('/api/admin/kb/qa', 'POST', payload); if (r.status < 400) ok++ } catch (e) {}
    }
    rebuilt++
    console.log(`重建 ${sc.name}: ${ok}/${(sc.qa||[]).length}（${it_qen_count(sc)} q_en）`)
  }
  console.log(`\n完成: 刪 ${deleted} | 重建 ${rebuilt} 分類（全簡體+q_en）`)
}
function it_qen_count(sc) {
  return (sc.qa || []).filter(i => i.q_en).length
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1) })
