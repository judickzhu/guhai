#!/usr/bin/env node
// V4.3 連續對話狀態機驗證：讀答案鑰（md）→ 逐用戶逐輪跑 DC → 評審對照標準答案
// 用法: DEEPSEEK_KEY=xxx [USE_SILICONFLOW=1] node v64_v43_verify.js [--users=U01,U03]
const fs = require('fs')
const https = require('https')
const KEY = process.env.DEEPSEEK_KEY || ''
const BASE = __dirname
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
      res.on('end', () => { if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode + ' ' + d.slice(0, 80))); try { resolve(JSON.parse(d).choices[0].message.content) } catch (e) { reject(e) } })
    })
    req.on('error', reject)
    req.setTimeout(60000, () => req.destroy(new Error('timeout')))
    req.write(body); req.end()
  })
}
async function cr(msgs, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try { const raw = await call(msgs); if (raw && raw.trim()) return raw } catch (e) { if (i === tries - 1) throw e }
    await new Promise(r => setTimeout(r, 1500))
  }
  throw new Error('empty')
}
// 解析答案鑰：提取每個用戶的 10 輪（R1-R10 + 用戶原話 + 標準答案要點）
function parseAnswerKey() {
  const users = []
  for (const vol of ['DC姐姐V4.3_答案鑰_卷1_U01-U05.md', 'DC姐姐V4.3_答案鑰_卷2_U06-U10.md']) {
    const src = fs.readFileSync(BASE + '/' + vol, 'utf8')
    const blocks = src.split(/## U(\d{2})｜/)
    for (let i = 1; i < blocks.length; i += 2) {
      const uid = blocks[i]
      const body = blocks[i + 1] || ''
      const turns = []
      // 逐行掃描：### R 開新輪，字段行填充
      let cur = null
      for (const line of body.split('\n')) {
        const rm = line.match(/^### R(\d+)/)
        if (rm) { cur = { rn: parseInt(rm[1]), q: '', target: '', ans: '' }; turns.push(cur); continue }
        if (!cur) continue
        const qm = line.match(/用戶原話：(.*)/) || line.match(/用戶原话：(.*)/)
        if (qm) { cur.q = qm[1].trim(); continue }
        const tm = line.match(/本輪唯一目標：(.*)/) || line.match(/本輪唯一目标：(.*)/)
        if (tm) { cur.target = tm[1].trim(); continue }
        const am = line.match(/標準答案要點：(.*)/) || line.match(/標準答案要点：(.*)/)
        if (am) { cur.ans = am[1].trim(); continue }
      }
      if (turns.length) users.push({ uid, turns })
    }
  }
  return users
}
const JUDGE = `你是「V4.3 狀態機評審」。給出：用戶本輪原話、答案鑰的「唯一目標」與「標準答案要點」（要點=方向參考，非逐字要求）、DC 實際回答。
判斷：DC 是否達成「唯一目標」？——看行為方向（接住情緒/拆認知/給驗證/給SOP/停住），只要達成目標就算 hit=1；「標準答案要點」僅作方向參考，DC 用不同措辭/更深切入都算對齊。輸出 JSON：{"hit":0或1(達成目標),"align":0或1(方向對齊),"score":0-5,"note":"一句話"}`
async function judgeTurn(q, target, ans, dc) {
  const raw = await cr([{ role: 'system', content: JUDGE }, { role: 'user', content: JSON.stringify({ 用戶原話: q, 唯一目標: target, 標準答案要點: ans, DC實際回答: dc.slice(0, 300) }, null, 1) }])
  const m = raw.match(/\{[\s\S]*\}/)
  return m ? JSON.parse(m[0]) : { hit: 0, score: 0, note: 'parse fail' }
}
async function main() {
  const args = process.argv.slice(2)
  const userFilter = (args.find(a => a.startsWith('--users=')) || '').replace('--users=', '').split(',')
  const users = parseAnswerKey()
  console.log('解析答案鑰:', users.length, '用戶 |', users.reduce((s, u) => s + u.turns.length, 0), '輪')
  const list = userFilter[0] ? users.filter(u => userFilter.includes('U' + u.uid)) : users
  let totalHit = 0, total = 0
  for (const u of list) {
    const msgs = [{ role: 'system', content: PROMPT }]
    console.log(`\n[U${u.uid}] ${u.turns.length} 輪`)
    for (const t of u.turns) {
      msgs.push({ role: 'user', content: t.q })
      let dc = ''
      try { dc = (await cr(msgs)).replace(/\n?\[COG\|[^\]]*\]/, '').trim() } catch (e) { dc = '（失敗）' }
      msgs.push({ role: 'assistant', content: dc })
      let v = { hit: 0, score: 0 }
      try { v = await judgeTurn(t.q, t.target, t.ans, dc) } catch (e) {}
      if (v.hit === 1) totalHit++
      total++
      console.log(`  R${t.rn} ${v.hit === 1 ? '✅' : '❌'} 分=${v.score} | ${t.q.slice(0, 22)}`)
      await new Promise(r => setTimeout(r, 150))
    }
  }
  console.log(`\n=== 完成 === 目標達成 ${totalHit}/${total} (${(totalHit / total * 100).toFixed(1)}%)`)
}
main().catch(e => { console.error('FATAL ' + e.message); process.exit(1) })
