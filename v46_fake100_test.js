#!/usr/bin/env node
// V4.0 假問題識別 100 題 · 驗收
// DC姐姐 對用戶原話：識別「真實問題」+ 開放映射回答 → 評審判類型 → 對比規格類型
const fs = require('fs')
const https = require('https')
const KEY = process.env.DEEPSEEK_KEY || 'sk-teamo-dffbb80d91b54f308cce7b0ecb17b7a6b51f41b14d701db8'
const BASE = __dirname.endsWith('网站') ? __dirname : __dirname + '/网站'
const PROMPT = fs.readFileSync(BASE + '/v31_prompt.txt', 'utf8')

function call(messages, max_tokens = 900, temperature = 0.4) {
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
// 評審：DC 回答識別出的真實問題類型
const JUDGE = `你是「假問題識別評審」。用戶說了一句話（表面問題），DC姐姐 回應了。判斷 DC姐姐 是否識別出「真實問題」並做開放映射（不腦補）。
類型：P價(價格/值不值/怕騙/沒錢)/L損(虧損/翻本/求安慰)/F功(功能/想開始/操作)/T信(信任/怕再被騙/驗證)/S默(沉默/傾訴/退縮/情感收尾)。
輸出 JSON：{"type":"P/L/F/T/S","ok":0或1(識別對且開放映射不腦補),"note":"一句話"}。若 DC 回答中出現「你其實是…/你就是怕…」式斷言 → ok=0。`
async function judge(user, reply) {
  const raw = await retry([{ role: 'system', content: JUDGE }, { role: 'user', content: '用戶說：' + user + '\n\nDC姐姐回應：' + reply.slice(0, 250) + '\n\n輸出 JSON。' }])
  const m = raw.match(/\{[\s\S]*\}/)
  return m ? JSON.parse(m[0]) : { type: null, ok: -1, note: 'parse fail' }
}
async function main() {
  const glob = require('child_process').execSync('ls ' + BASE + '/DC姐姐V4.0_假问题识别训练_卷*.md', { encoding: 'utf8' }).trim().split('\n')
  const questions = []
  for (const f of glob) {
    const s = fs.readFileSync(f.trim(), 'utf8')
    const blocks = s.split(/### 題目 (\d+)/).slice(1)
    for (let i = 0; i < blocks.length; i += 2) {
      const no = parseInt(blocks[i])
      const body = blocks[i + 1] || ''
      const userM = body.match(/用戶：(.*?)\n/)
      const realM = body.match(/真實：([PFLTS])價|真實：([PFLTS])損|真實：([PFLTS])功|真實：([PFLTS])信|真實：([PFLTS])默/)
      if (!userM || !realM) continue
      const user = userM[1].trim()
      const type = realM[1] || realM[2] || realM[3] || realM[4] || realM[5]
      questions.push({ no, user, type })
    }
  }
  console.log('解析題目:', questions.length)
  const results = []
  let hit = 0, noBrain = 0
  for (const q of questions) {
    let reply = ''
    try {
      const raw = await retry([{ role: 'system', content: PROMPT }, { role: 'user', content: q.user }])
      reply = raw.replace(/\n?\[COG\|[^\]]*\]/, '').trim()
    } catch (e) { reply = '' }
    let v = null
    if (reply) { try { v = await judge(q.user, reply) } catch (e) {} }
    const typeOk = v && v.type === q.type
    const brainOk = v && v.ok === 1
    if (typeOk) hit++
    if (brainOk) noBrain++
    results.push({ no: q.no, type: q.type, judgeType: v ? v.type : null, typeOk, brainOk, reply: reply.slice(0, 80) })
    console.log(`[${String(q.no).padStart(3)}] ${typeOk ? '✅' : '❌'} 正確=${q.type} 判=${v ? v.type : '?'}${brainOk ? '' : ' ⚠️腦補?'} | ${q.user.slice(0, 22)}`)
    await new Promise(r => setTimeout(r, 180))
  }
  fs.writeFileSync(BASE + '/v46_fake100_results.jsonl', results.map(r => JSON.stringify(r)).join('\n'))
  const typeRate = (hit / questions.length * 100).toFixed(1)
  console.log(`\n=== 完成 === 類型識別命中 ${hit}/${questions.length} (${typeRate}%) | 無腦補 ${noBrain}/${questions.length}`)
}
main().catch(e => { console.error('FATAL ' + e.message); process.exit(1) })
