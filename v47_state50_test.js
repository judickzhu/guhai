#!/usr/bin/env node
// V4.0 狀態跳轉 50 條 · 驗收
// 逐輪連續對話：DC姐姐 對用戶多輪話術連續回應 → 評審檢查「狀態切換」是否正確
const fs = require('fs')
const https = require('https')
const KEY = process.env.DEEPSEEK_KEY || 'sk-teamo-dffbb80d91b54f308cce7b0ecb17b7a6b51f41b14d701db8'
const BASE = __dirname.endsWith('网站') ? __dirname : __dirname + '/网站'
const PROMPT = fs.readFileSync(BASE + '/v31_prompt.txt', 'utf8')

function call(messages, max_tokens = 700, temperature = 0.5) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: 'deepseek-v4-flash', messages, max_tokens, temperature, stream: false })
    const req = https.request({
      hostname: 'api.teamorouter.cn', path: '/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY }
    }, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => { if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode)); try { resolve(JSON.parse(d).choices[0].message.content) } catch (e) { reject(new Error('parse')) } })
    })
    req.on('error', reject)
    req.setTimeout(90000, () => req.destroy(new Error('timeout')))
    req.write(body); req.end()
  })
}
async function retry(messages, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { const raw = await call(messages); if (raw && raw.trim()) return raw } catch (e) {}
    await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error('empty')
}
// 評審：檢查整鏈的狀態切換
const JUDGE = `你是「V4.0 狀態跳轉評審」。這是 DC姐姐 對用戶連續對話的回應，用戶狀態在對話中變化（如 好奇→懷疑→防禦→憤怒→冷靜→決策）。
檢查 DC姐姐 是否「沿狀態軌跡正確切換」：
- 攻擊/憤怒輪 → 是否接住不爭？
- 崩潰/恐慌輪 → 是否零決定/禁指令？
- 傾訴輪 → 是否在場傾聽不追細節？
- 退縮/告別輪 → 是否尊重不追擊？
- 認可/信任輪 → 是否不追加銷售？
- 問價/要步驟輪 → 是否直接答？
- 全鏈是否不抓矛盾、記住前面對話（不重複初次見面式回答）？
輸出 JSON：{"ok":0或1(狀態切換總體正確),"points":["逐點檢查結果"],"bad":["犯的錯，若無則空"],"score":0-5,"note":"一句話"}。`
async function judge(chainNo, turns) {
  const userMsg = turns.map(t => `R${t.i}: ${t.q}\nDC：${t.a.slice(0, 120)}`).join('\n')
  const raw = await retry([{ role: 'system', content: JUDGE }, { role: 'user', content: `鏈${chainNo} 完整對話：\n${userMsg}\n\n輸出 JSON。` }])
  const m = raw.match(/\{[\s\S]*\}/)
  return m ? JSON.parse(m[0]) : { ok: -1, note: 'parse fail', bad: [] }
}
async function main() {
  const args = process.argv.slice(2)
  const glob = require('child_process').execSync('ls ' + BASE + '/DC姐姐V4.0_状态跳转训练_卷*.md', { encoding: 'utf8' }).trim().split('\n')
  const chains = []
  for (const f of glob) {
    const s = fs.readFileSync(f.trim(), 'utf8')
    const blocks = s.split(/### 題目 (\d+)/).slice(1)
    for (let i = 0; i < blocks.length; i += 2) {
      const no = parseInt(blocks[i])
      const body = blocks[i + 1] || ''
      const turns = []
      const turnM = body.match(/R(\d+)\s+(.+?)(?=\nR\d|\n切換點|$)/gs)
      if (turnM) {
        for (const tm of turnM) {
          const mm = tm.match(/R(\d+)\s+(.+?)(?=\nR\d|\n切換點|$)/s)
          if (mm) turns.push({ i: parseInt(mm[1]), q: mm[2].trim() })
        }
      }
      if (turns.length) chains.push({ no, turns })
    }
  }
  const sampleArg = args.find(a => a.startsWith('--sample='))
  const list = sampleArg ? chains.slice(0, parseInt(sampleArg.replace('--sample=', ''))) : chains
  console.log('驗收鏈:', list.length, '/', chains.length)
  const results = []
  let okCount = 0
  for (const ch of list) {
    const msgs = [{ role: 'system', content: PROMPT }]
    const turns = []
    for (const t of ch.turns) {
      msgs.push({ role: 'user', content: t.q })
      let a = ''
      try { a = (await retry(msgs)).replace(/\n?\[COG\|[^\]]*\]/, '').trim() } catch (e) { a = '' }
      msgs.push({ role: 'assistant', content: a })
      turns.push({ i: t.i, q: t.q, a })
    }
    let v = null
    try { v = await judge(ch.no, turns) } catch (e) { v = { ok: -1, note: 'judge fail', bad: [] } }
    const ok = v.ok === 1
    if (ok) okCount++
    results.push({ no: ch.no, ok, v, turns })
    console.log(`[${String(ch.no).padStart(3)}] ${ok ? '✅' : '❌'} ${(v.bad || []).slice(0, 2).join(';') || (v.note || '').slice(0, 40)}`)
    await new Promise(r => setTimeout(r, 200))
  }
  fs.writeFileSync(BASE + '/v47_state50_results.jsonl', results.map(r => JSON.stringify({ no: r.no, ok: r.ok, v: r.v })).join('\n'))
  console.log(`\n=== 完成 === 狀態切換正確 ${okCount}/${list.length} (${(okCount / list.length * 100).toFixed(1)}%)`)
}
main().catch(e => { console.error('FATAL ' + e.message); process.exit(1) })
