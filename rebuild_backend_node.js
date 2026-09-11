// 後台全量重建（純 Node 直連版）：清空 → 依 site_full_rebuild.js 重建
// 用法: ADMIN_TOKEN=xxx node rebuild_backend_node.js
// 注意: 一般情況優先使用 rebuild_backend_node_resume.js（續傳、斷點安全）
const https = require('https')
const fs = require('fs')
const TOKEN = process.env.ADMIN_TOKEN
if (!TOKEN) { console.error('need ADMIN_TOKEN'); process.exit(1) }
const SITE = JSON.parse(fs.readFileSync('/Users/macbookair/Downloads/电子书ipa/网站/site_full_rebuild.js', 'utf8').replace('const SITE_FULL = ', '').replace(/;\s*$/, ''))

function api(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL('https://s.dcogai.com' + path)
    const req = https.request(u, { method, headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN }, timeout: 120000 }, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => { let j = null; try { j = d ? JSON.parse(d) : null } catch (e) {} resolve({ status: res.statusCode, body: j }) })
    })
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('timeout')))
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}
const sleep = s => new Promise(r => setTimeout(r, s * 1000))

async function getAllCats() {
  const r = await api('/api/admin/kb')
  return Array.isArray(r.body) ? r.body : ((r.body && r.body.categories) || [])
}

async function main() {
  console.log('start full rebuild')
  for (let round = 0; round < 200; round++) {
    const cats = await getAllCats()
    if (cats.length === 0) { console.log('CLEARED round ' + round); break }
    const slice = cats.slice(0, 15)
    for (const c of slice) { const r = await api('/api/admin/kb/category/' + c.id, 'DELETE'); if (r.status >= 500) await sleep(2); await sleep(0.2) }
    if (round % 5 === 0) console.log('remaining ' + cats.length)
    await sleep(0.3)
  }
  let done = 0
  for (const sc of SITE) {
    let catId = null
    for (let t = 0; t < 4 && !catId; t++) {
      try {
        const r = await api('/api/admin/kb/category', 'POST', { name: sc.name, icon: sc.icon || '', description: sc.description || '' })
        catId = r.body && (r.body.id || r.body.category_id)
      } catch (e) {}
      if (!catId) await sleep(1.5)
    }
    if (!catId) { console.error('CATFAIL ' + sc.name); process.exit(1) }
    for (let s = 0; s < sc.qa.length; s += 10) {
      const chunk = sc.qa.slice(s, s + 10)
      for (const it of chunk) {
        const payload = { category_id: String(catId), q: it.q, a: it.a, keywords: it.keywords }
        if (it.a_en) payload.a_en = it.a_en
        for (let t = 0; t < 3; t++) {
          try { const r = await api('/api/admin/kb/qa', 'POST', payload); if (r.status === 200 || r.status === 201) break } catch (e) {}
          await sleep(1.5 * (t + 1))
        }
        await sleep(0.15)
      }
    }
    done++
    console.log('OK ' + sc.name + ' (' + sc.qa.length + ') [' + done + '/' + SITE.length + ']')
  }
  const final = await getAllCats()
  const tot = final.reduce((s, c) => s + (c.qa || c.items || []).length, 0)
  console.log('FINAL categories=' + final.length + ' total=' + tot)
}
main().catch(e => { console.error('FATAL ' + e.message); process.exit(1) })
