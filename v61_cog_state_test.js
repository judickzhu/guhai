#!/usr/bin/env node
// V4.1 認知狀態機測試：10 用戶 × 10 輪連續對話
// 評審維度（V4.1 規格十項）：真問題/心理狀態/不重複/不重講/推進認知/行為證明/回退識別/循環斷路/不銷售/停得住
const fs = require('fs')
const https = require('https')
const KEY = process.env.DEEPSEEK_KEY || 'sk-teamo-dffbb80d91b54f308cce7b0ecb17b7a6b51f41b14d701db8'
const BASE = '/Users/macbookair/guhai-dc'
const PROMPT = fs.readFileSync(BASE + '/v31_prompt.txt', 'utf8')
const SF = process.env.USE_SILICONFLOW === '1'
const HOST = SF ? 'api.siliconflow.cn' : 'api.teamorouter.cn'
const MODEL = SF ? 'deepseek-ai/DeepSeek-V4-Flash' : 'deepseek-v4-flash'

function call(messages, max_tokens = 700, temperature = 0.6) {
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
const JUDGE = `你是「V4.1 認知狀態機評審」。DC姐姐 與同一個用戶連續對話 10 輪。按 V4.1 十項指標評審：
1.答到用戶真正的問題 2.識別當前心理狀態 3.不重複講過的東西 4.不把用戶已懂的重講 5.推進新認知 6.行為證明(用戶下一句能否用上認知) 7.識別認知回退(喚醒舊認知) 8.識別認知循環(斷路) 9.不必要銷售 10.停得住(認知完成就閉嘴)
輸出 JSON：{"q1":0-1,"q2":0-1,"q3":0-1,"q4":0-1,"q5":0-1,"q6":0-1,"q7":0-1,"q8":0-1,"q9":0-1,"q10":0-1,"score":0-5,"note":"一句話"}。q7/q8 若場景無回退/循環則記 1（不扣分）。`
async function judge(uid, turns) {
  const userMsg = turns.map(t => `R${t.i}: ${t.q}\nDC：${t.a.slice(0, 70)}`).join('\n')
  const raw = await cr([{ role: 'system', content: JUDGE }, { role: 'user', content: `用戶${uid} 10輪對話：\n${userMsg}\n\n輸出 JSON。` }])
  const m = raw.match(/\{[\s\S]*\}/)
  return m ? JSON.parse(m[0]) : { score: 0, note: 'parse fail' }
}
async function main() {
  const src = fs.readFileSync(BASE + '/DC姐姐V4.1_连续人格压力测试_用户档案.md', 'utf8')
  const users = []
  const blocks = src.split(/## U(\d{2})｜/)
  for (let i = 1; i < blocks.length; i += 2) {
    const uid = blocks[i]
    const body = blocks[i + 1] || ''
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
    console.log(`[U${u.uid}] ${ok ? '✅' : '❌'} q1-10:${[1,2,3,4,5,6,7,8,9,10].map(n=>v['q'+n]??'-').join('')} 分=${v.score} | ${(v.note||'').slice(0,36)}`)
    await new Promise(r => setTimeout(r, 300))
  }
  fs.writeFileSync(BASE + '/v61_cog_state_results.jsonl', results.map(r => JSON.stringify({ uid: r.uid, v: r.v })).join('\n'))
  const pass = results.filter(r => r.v.score >= 4).length
  console.log(`\n=== 完成 === 通過 ${pass}/${users.length} 用戶`)
}
main().catch(e => { console.error('FATAL ' + e.message); process.exit(1) })
