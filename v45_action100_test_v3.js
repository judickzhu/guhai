#!/usr/bin/env node
// V4.0 對話動作選擇 100 題 · 判定驗收 v2（DC姐姐 自輸出 [ACT:X]，不再用第二模型猜）
const fs = require('fs')
const https = require('https')
const KEY = process.env.DEEPSEEK_KEY || 'sk-teamo-dffbb80d91b54f308cce7b0ecb17b7a6b51f41b14d701db8'
const BASE = __dirname.endsWith('网站') ? __dirname : __dirname + '/网站'
const PROMPT = fs.readFileSync(BASE + '/v31_prompt.txt', 'utf8')
// 要求輸出 ACT 隱形標記（類似 COG）
const ACT_INSTR = '\n\n【本輪輸出格式】先內部判 DC-Action 動作，然後以 [ACT:X] 開頭輸出該動作標記（X=A-F），再輸出你的回答。例：[ACT:A] 年費29800U…'

function call(messages, max_tokens = 1000, temperature = 0.5) {
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

async function main() {
  // 用校驗後標記表（73 題有效集）——從卷文件取用戶話，從校驗表取正確動作
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
  for (const no of Object.keys(labelMap).map(Number).sort((a,b)=>a-b)) {
    if (userMap[no]) questions.push({ no, user: userMap[no], correct: labelMap[no] })
  }
  console.log('解析題目:', questions.length)
  const results = []
  let hit = 0
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    let reply = ''
    let predicted = null
    try {
      const raw = await retry([{ role: 'system', content: PROMPT }, { role: 'user', content: q.user + ACT_INSTR }])
      reply = raw.replace(/\n?\[COG\|[^\]]*\]/, '').trim()
      const actM = reply.match(/\[ACT:([A-F])\]/)
      if (actM) { predicted = actM[1]; reply = reply.replace(/\[ACT:[A-F]\]\s*/, '') }
      else {
        // 沒輸出 ACT → 從開頭猜（若開頭是直接答/問句/共情）
        if (/^(姐姐|[^，。？!？!]{0,6}?[。！])/.test(reply) && reply.length < 200) predicted = 'A'
      }
    } catch (e) { reply = '' }
    const ok = predicted === q.correct
    if (ok) hit++
    results.push({ no: q.no, user: q.user.slice(0, 40), correct: q.correct, predicted, ok, reply: reply.slice(0, 100) })
    console.log(`[${String(q.no).padStart(3)}] ${ok ? '✅' : '❌'} 正確=${q.correct} 判定=${predicted || '?'} ${q.user.slice(0, 20)}`)
    await new Promise(r => setTimeout(r, 200))
  }
  fs.writeFileSync(BASE + '/v45_action100_results_v3.jsonl', results.map(r => JSON.stringify(r)).join('\n'))
  console.log(`\n=== 完成 === 命中 ${hit}/${questions.length} (${(hit / questions.length * 100).toFixed(1)}%) 驗收線 ≥95%`)
}
main().catch(e => { console.error('FATAL ' + e.message); process.exit(1) })
