#!/usr/bin/env node
// V4.0 連續人格壓力測試：10 用戶 × 20 輪 = 200 輪
// 驗證 DC姐姐 能否「認識同一個人」：記得前面輪次、識別重複循環、認知階梯只推一級、關係階段跟隨
const fs = require('fs')
const https = require('https')
const KEY = process.env.DEEPSEEK_KEY || ''
const BASE = __dirname.endsWith('网站') ? __dirname : __dirname + '/网站'
const PROMPT = fs.readFileSync(BASE + '/v31_prompt.txt', 'utf8')
const SF = process.env.USE_SILICONFLOW === '1'
const HOST = SF ? 'api.siliconflow.cn' : 'api.teamorouter.cn'
const MODEL = SF ? 'deepseek-ai/DeepSeek-V4-Flash' : 'deepseek-v4-flash'

function call(messages, max_tokens = 800, temperature = 0.6) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: MODEL, messages, max_tokens, temperature, stream: false })
    const req = https.request({ hostname: HOST, path: '/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY } }, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => { if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode + ' ' + d.slice(0, 100))); try { resolve(JSON.parse(d).choices[0].message.content) } catch (e) { reject(e) } })
    })
    req.on('error', reject)
    req.setTimeout(90000, () => req.destroy(new Error('timeout')))
    req.write(body); req.end()
  })
}
async function cr(msgs, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try { const raw = await call(msgs); if (raw && raw.trim()) return raw } catch (e) { if (i === tries - 1) throw e }
    await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error('empty')
}
// 評審：檢查整鏈是否「認識同一個人」
const JUDGE = `你是「V4.0 連續人格評審」。DC姐姐 與同一個用戶連續對話 20 輪。檢查：
①是否記得前面輪次（不重新認識/不重複初次見面式回答）
②是否識別重複循環（用戶反覆翻本/加倉時，是否指出重複而非每次重新解釋）
③認知階梯是否只推進一級
④關係階段變化時策略是否跟隨（懷疑→信任→挫折→決策）
⑤未解決問題是否自然回接
輸出 JSON：{"remember":0或1,"loop_detect":0或1,"cog_advance":0或1,"relation_follow":0或1,"recall_unresolved":0或1,"score":0-5,"note":"一句話"}。`
async function judge(uid, turns) {
  const userMsg = turns.map(t => `R${t.i}: ${t.q}\nDC：${t.a.slice(0, 80)}`).join('\n')
  const raw = await cr([{ role: 'system', content: JUDGE }, { role: 'user', content: `用戶${uid} 20輪對話：\n${userMsg}\n\n輸出 JSON。` }])
  const m = raw.match(/\{[\s\S]*\}/)
  return m ? JSON.parse(m[0]) : { score: 0, note: 'parse fail' }
}

async function main() {
  // 解析用戶檔案
  const src = fs.readFileSync(BASE + '/DC姐姐V4.0_连续人格压力测试_用户档案.md', 'utf8')
  const users = []
  const blocks = src.split(/## U(\d{2})｜/)
  for (let i = 1; i < blocks.length; i += 2) {
    const uid = blocks[i]
    const body = blocks[i + 1] || ''
    // 找 20 輪軌跡
    const turns = []
    const tm = body.match(/R(\d+)\s+([^\n]+)/g)
    if (tm) for (const t of tm) { const m = t.match(/R(\d+)\s+(.+)/); if (m) turns.push({ i: parseInt(m[1]), q: m[2].trim() }) }
    if (turns.length) users.push({ uid, turns })
  }
  console.log('解析用戶:', users.length, '| 總輪次:', users.reduce((s, u) => s + u.turns.length, 0))
  const results = []
  for (const u of users) {
    const msgs = [{ role: 'system', content: PROMPT }]
    const turns = []
    for (const t of u.turns) {
      msgs.push({ role: 'user', content: t.q })
      let a = ''
      try { a = (await cr(msgs)).replace(/\n?\[COG\|[^\]]*\]/, '').trim() } catch (e) { a = '（失敗）' }
      msgs.push({ role: 'assistant', content: a })
      turns.push({ i: t.i, q: t.q, a })
    }
    let v = null
    try { v = await judge(u.uid, turns) } catch (e) { v = { score: -1, note: 'judge fail' } }
    const ok = v.score >= 4
    results.push({ uid: u.uid, v, turns })
    console.log(`[U${u.uid}] ${ok ? '✅' : '❌'} remember=${v.remember} loop=${v.loop_detect} cog=${v.cog_advance} rel=${v.relation_follow} recall=${v.recall_unresolved} 分=${v.score} | ${(v.note || '').slice(0, 40)}`)
    await new Promise(r => setTimeout(r, 300))
  }
  fs.writeFileSync(BASE + '/v48_persona100_results.jsonl', results.map(r => JSON.stringify({ uid: r.uid, v: r.v })).join('\n'))
  const pass = results.filter(r => r.v.score >= 4).length
  console.log(`\n=== 完成 === 通過 ${pass}/${users.length} 用戶（各 20 輪）`)
}
main().catch(e => { console.error('FATAL ' + e.message); process.exit(1) })
