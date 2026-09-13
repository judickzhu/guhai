// 第二階段：在已恢復的快照基礎上，PUT 補 q_en（非書籍題，書籍跳過）
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
// 讀簡體版 KB（含 q_en）
const KB = JSON.parse(fs.readFileSync('/Users/macbookair/Downloads/电子书ipa/网站/kb-data_simplified.json', 'utf8'))

async function main() {
  // 建 q_en 映射（按 id）
  const qenMap = {}
  for (const c of KB.categories) {
    for (const qa of c.qa || []) {
      if (qa.q_en) qenMap[qa.id] = { q_en: qa.q_en, q: qa.q, a: qa.a, keywords: qa.keywords || [], a_en: qa.a_en || '' }
    }
  }
  // 遍歷後台非書籍分類，逐題 PUT 補 q_en
  const kbR = (await apiRetry('/api/admin/kb')).body || {}
  const cats = Array.isArray(kbR) ? kbR : (kbR.categories || [])
  let updated = 0, skipped = 0
  for (const c of cats) {
    if (c.name.includes('股路不归') || c.name.includes('股路不歸') || c.name.includes('股道')) { skipped++; continue }
    for (const qa of (c.qa || c.items || [])) {
      const info = qenMap[qa.id]
      if (!info) continue
      if (qa.q_en) continue // 已有
      const payload = { category_id: String(c.id), q: info.q, a: info.a, keywords: info.keywords }
      if (info.a_en) payload.a_en = info.a_en
      if (info.q_en) payload.q_en = info.q_en
      try { const r = await apiRetry('/api/admin/kb/qa/' + qa.id, 'PUT', payload); if (r.status < 400) updated++ } catch (e) {}
    }
    console.log(`補 q_en ${c.name}`)
  }
  console.log(`\n第二階段完成: 更新 ${updated} 題 q_en | 書籍跳過 ${skipped} 分類`)
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1) })
