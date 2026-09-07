// 後台快照：重建/同步前 dump 後台全量 → backend_snapshot_日期.json
// 用法: ADMIN_TOKEN=xxx node backend_snapshot.js
// 產出: /Users/macbookair/Downloads/电子书ipa/网站/backend_snapshot_YYYYMMDD_HHMMSS.json
const https = require('https')
const fs = require('fs')
const path = require('path')
const TOKEN = process.env.ADMIN_TOKEN
if (!TOKEN) { console.error('need ADMIN_TOKEN'); process.exit(1) }

function api(p) {
  return new Promise((resolve, reject) => {
    const u = new URL('https://s.dcogai.com' + p)
    const req = https.request(u, { method: 'GET', headers: { 'Authorization': 'Bearer ' + TOKEN }, timeout: 120000 }, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }) } catch (e) { reject(e) } })
    })
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.end()
  })
}
async function main() {
  console.log('快照開始：dump 後台全量…')
  const r = await api('/api/admin/kb')
  if (r.status !== 200) { console.error('GET 失敗 ' + r.status); process.exit(1) }
  const cats = Array.isArray(r.body) ? r.body : ((r.body && r.body.categories) || [])
  const tot = cats.reduce((s, c) => s + (c.qa || c.items || []).length, 0)
  const ts = new Date()
  const pad = n => String(n).padStart(2, '0')
  const name = `backend_snapshot_${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.json`
  const outPath = path.join('/Users/macbookair/Downloads/电子书ipa/网站', name)
  // 精簡存儲（只要可重建的字段：分類名/icon/description/qa的q/a/keywords/a_en）
  const slim = cats.map(c => ({ name: c.name, icon: c.icon || '', description: c.description || '', qa: (c.qa || c.items || []).map(i => ({ q: i.q, a: i.a, keywords: i.keywords || [], a_en: i.a_en || '' })) }))
  fs.writeFileSync(outPath, JSON.stringify(slim, null, 1), 'utf8')
  console.log(`快照完成: ${cats.length} 分類 / ${tot} 題 → ${name}`)
  console.log(`大小: ${(fs.statSync(outPath).size / 1024 / 1024).toFixed(2)} MB`)
}
main().catch(e => { console.error('FATAL ' + e.message); process.exit(1) })
