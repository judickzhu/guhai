// 後台續傳重建（純 Node）：跳過已齊分類，只建缺失/未齊分類；單條失敗重試不退出
// 用法: ADMIN_TOKEN=xxx node rebuild_backend_node_resume.js
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
async function apiRetry(path, method, body, tries = 5) {
  for (let t = 0; t < tries; t++) {
    try { const r = await api(path, method, body); if (r.status < 500) return r; } catch (e) {}
    await sleep(2 * (t + 1))
  }
  throw new Error('api fail ' + path)
}

async function postOne(catId, it) {
  const payload = { category_id: String(catId), q: it.q, a: it.a, keywords: it.keywords }
  if (it.a_en) payload.a_en = it.a_en
  for (let t = 0; t < 6; t++) {
    try { const r = await api('/api/admin/kb/qa', 'POST', payload); if (r.status === 200 || r.status === 201) return true } catch (e) {}
    await sleep(1.2 * (t + 1))
  }
  return false
}

async function main() {
  console.log('resume start')
  let done = 0, rebuilt = 0
  for (const sc of SITE) {
    const cats = await getAllCats()
    const existing = cats.filter(c => c.name === sc.name)
    const haveQs = new Set(existing.flatMap(c => (c.qa || c.items || []).map(i => i.q)))
    const got = sc.qa.filter(i => haveQs.has(i.q)).length
    if (got === sc.qa.length) { done++; console.log('SKIP ' + sc.name + ' (齊 ' + got + ')'); continue }
    // 未齊：刪同名（若有）再重建
    for (const c of existing) { try { await apiRetry('/api/admin/kb/category/' + c.id, 'DELETE') } catch (e) {} await sleep(0.3) }
    await sleep(0.5)
    let catId = null
    for (let t = 0; t < 5 && !catId; t++) {
      try { const r = await apiRetry('/api/admin/kb/category', 'POST', { name: sc.name, icon: sc.icon || '', description: sc.description || '' }); catId = r.body && (r.body.id || r.body.category_id) } catch (e) {}
      if (!catId) await sleep(2)
    }
    if (!catId) { console.error('CATFAIL ' + sc.name); process.exit(1) }
    // 逐條 POST（每條獨立重試）
    let fail = 0
    for (let i = 0; i < sc.qa.length; i++) {
      const ok = await postOne(catId, sc.qa[i])
      if (!ok) fail++
      if ((i + 1) % 50 === 0) console.log('  ' + sc.name + ' ' + (i + 1) + '/' + sc.qa.length + ' fail=' + fail)
    }
    rebuilt++
    console.log('OK ' + sc.name + ' (' + sc.qa.length + ') fail=' + fail)
  }
  console.log('RESUME DONE rebuilt=' + rebuilt)
}
main().catch(e => { console.error('FATAL ' + e.message); process.exit(1) })
