#!/usr/bin/env node
// V4.0 對話動作 73 題有效集 · 判定驗收 v4
// DC 完整回答（不輸出 ACT 標記）→ 評審從回答判動作 → 對比校驗後標記
const fs = require('fs')
const https = require('https')
const KEY = process.env.DEEPSEEK_KEY || 'sk-teamo-dffbb80d91b54f308cce7b0ecb17b7a6b51f41b14d701db8'
const BASE = __dirname.endsWith('网站') ? __dirname : __dirname + '/网站'
const PROMPT = fs.readFileSync(BASE + '/v31_prompt.txt', 'utf8')

function call(messages, max_tokens = 1000, temperature = 0.4) {
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
// 評審：從 DC 回答判動作（看回答的第一步/主體動作）
const JUDGE = `你是「DC-Action 動作判定專家」。DC姐姐 對用戶說了一段話，判斷這段話的「第一步動作/主體動作」是哪個。
動作：A ANSWER直接答(給了信息/答案)/B ASK先問(先提問收集信息)/C REFLECT反射共情(先理解情緒/處境)/D CHALLENGE溫和挑戰(指出邏輯錯誤)/E PAUSE暫停(停止推進/勸停)/F EXECUTE給操作步驟(安裝/綁定/註冊步驟)。
看 DC姐姐 回答的主體是在做什麼——給答案→A、先問→B、接情緒→C、拆錯誤邏輯→D、勸停→E、給步驟→F。
只輸出單字母 A-F。`
async function judge(reply) {
  const raw = await retry([{ role: 'system', content: JUDGE }, { role: 'user', content: 'DC姐姐回答：' + reply.slice(0, 300) + '\n\n第一步動作？只輸出字母。' }])
  const m = raw.trim().match(/[A-F]/)
  return m ? m[0] : null
}
async function main() {
  const verified = JSON.parse(fs.readFileSync(BASE + '/v45_verified_labels.json', 'utf8'))
  const labelMap = {}; for (const k in verified.label) labelMap[parseInt(k)] = verified.label[k]
  const userMap = {}
  const glob = require('child_process').execSync('ls ' + BASE + '/DC姐姐V4.0_对话动作选择训练_卷*.md', { encoding: 'utf8' }).trim().split('\n')
  for (const f of glob) {
    const s = fs.readFileSync(f.trim(), 'utf8')
    const blocks = s.split(/### 题目 (\d+)/).slice(1)
    for (let i = 0; i < blocks.length; i += 2) {
      const no = parseInt(blocks[i])
      const body = blocks[i + 1] || ''
      const userM = body.match(/用户：(.*?)(?:\nA\.|$)/s)
      if (userM) userMap[no] = userM[1].trim()
    }
  }
  const questions = []
  for (const no of Object.keys(labelMap).map(Number).sort((a, b) => a - b)) {
    if (userMap[no]) questions.push({ no, user: userMap[no], correct: labelMap[no] })
  }
  console.log('有效題:', questions.length)
  const results = []
  let hit = 0
  for (const q of questions) {
    let reply = ''
    try {
      const raw = await retry([{ role: 'system', content: PROMPT }, { role: 'user', content: q.user }])
      reply = raw.replace(/\n?\[COG\|[^\]]*\]/, '').trim()
    } catch (e) { reply = '' }
    let predicted = null
    if (reply) { try { predicted = await judge(reply) } catch (e) {} }
    const ok = predicted === q.correct
    if (ok) hit++
    results.push({ no: q.no, correct: q.correct, predicted, ok, reply: reply.slice(0, 100) })
    console.log(`[${String(q.no).padStart(3)}] ${ok ? '✅' : '❌'} 正確=${q.correct} 判=${predicted || '?'} | ${q.user.slice(0, 24)}`)
    await new Promise(r => setTimeout(r, 200))
  }
  fs.writeFileSync(BASE + '/v45_action100_results_v4.jsonl', results.map(r => JSON.stringify(r)).join('\n'))
  console.log(`\n=== 完成 === 命中 ${hit}/${questions.length} (${(hit / questions.length * 100).toFixed(1)}%) 驗收線 ≥95%`)
}
main().catch(e => { console.error('FATAL ' + e.message); process.exit(1) })
