// 第二階段修正：按 q 內容匹配補 q_en（後台 id 是分類內序號，不能按 id）
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
  // 建 q_en 映射（按 q 原文）
  const qenMap = {}
  for (const c of KB.categories) {
    for (const qa of c.qa || []) {
      if (qa.q_en) qenMap[qa.q] = { q_en: qa.q_en, q: qa.q, a: qa.a, keywords: qa.keywords || [], a_en: qa.a_en || '' }
    }
  }
  console.log('q_en 映射題數:', Object.keys(qenMap).length)
  const kbR = (await apiRetry('/api/admin/kb')).body || {}
  const cats = Array.isArray(kbR) ? kbR : (kbR.categories || [])
  let updated = 0, notFound = 0
  for (const c of cats) {
    if (c.name.includes('股路不归') || c.name.includes('股路不歸') || c.name.includes('股道')) continue
    for (const qa of (c.qa || c.items || [])) {
      if (qa.q_en) continue
      const info = qenMap[qa.q]
      if (!info) { notFound++; continue }
      const payload = { category_id: String(c.id), q: info.q, a: info.a, keywords: info.keywords }
      if (info.a_en) payload.a_en = info.a_en
      payload.q_en = info.q_en
      try { const r = await apiRetry('/api/admin/kb/qa/' + qa.id, 'PUT', payload); if (r.status < 400) updated++ } catch (e) {}
    }
    console.log(`補 q_en ${c.name}`)
  }
  console.log(`\n完成: 更新 ${updated} | 後台題無對應簡體 q_en ${notFound}`)
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1) })
