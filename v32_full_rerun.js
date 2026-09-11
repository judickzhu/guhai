#!/usr/bin/env node
// V3.2 全量重跑（guhai-dc 版）：80 單題 + 1 鏈（20 輪）——只答題，輸出 stdout（避開結果文件 EPERM）
// 用法: DEEPSEEK_KEY=xxx [USE_SILICONFLOW=1] node v32_full_rerun.js
const fs = require('fs')
const https = require('https')
const KEY = process.env.DEEPSEEK_KEY || ''
const BASE = __dirname
const PROMPT = fs.readFileSync(BASE + '/v31_prompt.txt', 'utf8')
const DATA = JSON.parse(fs.readFileSync(BASE + '/v31i_blind100.json', 'utf8'))
const SF = process.env.USE_SILICONFLOW === '1'
const HOST = SF ? 'api.siliconflow.cn' : 'api.teamorouter.cn'
const MODEL = SF ? 'deepseek-ai/DeepSeek-V4-Flash' : 'deepseek-v4-flash'

function call(messages, max_tokens = 1600, temperature = 0.7) {
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
async function main() {
  const out = { meta: { prompt_v: 'v81', prompt_chars: PROMPT.length }, items: [] }
  let ok = 0, fail = 0
  // 80 單題
  for (const grp of DATA.groups) {
    if (grp.g === 5) continue
    for (const it of grp.items) {
      let answer = ''
      try { answer = (await cr([{ role: 'system', content: PROMPT }, { role: 'user', content: it.q }])).trim() } catch (e) { fail++; answer = '（失敗）' }
      if (answer && answer !== '（失敗）') ok++
      out.items.push({ no: it.no, g: grp.g, gname: it.gname, q: it.q, answer })
      console.log(`[${it.no}] ${answer && answer !== '（失敗）' ? '✅' : '❌'} | ${it.q.slice(0, 24)}`)
    }
  }
  // 鏈 81（20 輪）
  const chain = DATA.groups.find(g => g.g === 5).items[0]
  const msgs = [{ role: 'system', content: PROMPT }]
  const turns = []
  for (let i = 0; i < chain.chain.length; i++) {
    msgs.push({ role: 'user', content: chain.chain[i] })
    let a = ''
    try { a = (await cr(msgs)).replace(/\n?\[COG\|[^\]]*\]/, '').trim() } catch (e) { a = '（失敗）' }
    msgs.push({ role: 'assistant', content: a })
    turns.push(`[問] ${chain.chain[i]}\n[答] ${a}`)
  }
  out.items.push({ no: '81', g: 5, gname: chain.gname, q: chain.q, chain: chain.chain, answer: turns.join('\n---\n') })
  console.log(`\n=== 完成 === 單題 ${ok}/80 成功 | 鏈 20 輪`)
  console.log('JSON_OUTPUT_START')
  console.log(JSON.stringify(out))
}
main().catch(e => { console.error('FATAL ' + e.message); process.exit(1) })
