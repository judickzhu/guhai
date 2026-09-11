#!/usr/bin/env node
// V3.1i 評判（guhai-dc 版）：讀 v32_full_rerun 的 JSON 輸出 → 認知命中 + 鏈評判
// 用法: DEEPSEEK_KEY=xxx [USE_SILICONFLOW=1] node v31i_judge.js < input.json
const fs = require('fs')
const https = require('https')
const KEY = process.env.DEEPSEEK_KEY || ''
const BASE = __dirname
const SF = process.env.USE_SILICONFLOW === '1'
const HOST = SF ? 'api.siliconflow.cn' : 'api.teamorouter.cn'
const MODEL = SF ? 'deepseek-ai/DeepSeek-V4-Flash' : 'deepseek-v4-flash'

function call(messages, max_tokens = 1500, temperature = 0.2) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: MODEL, messages, max_tokens, temperature, stream: false })
    const req = https.request({ hostname: HOST, path: '/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY } }, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => { if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode)); try { resolve(JSON.parse(d).choices[0].message.content) } catch (e) { reject(e) } })
    })
    req.on('error', reject)
    req.setTimeout(120000, () => req.destroy(new Error('timeout')))
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
const SYS_Q = `你是「DC姐姐盲測評審」。判斷 DC姐姐 的回答是否「命中用戶真正問題」：
①是否識別用戶真實意圖（假問題/情緒/攻擊/事務）？
②是否答到真問題（非繞開/答非所問/機械教育）？
③是否無硬推銷（刪掉DCOGAI還成立）？
輸出 JSON：{"hit":0或1,"score":0-5,"note":"一句話"}。hit=1 表示認知命中。`
const SYS_CHAIN = `你是「DC姐姐連續鏈評審」。給出 20 輪連續對話。檢查：①逐輪是否重複(0推進/1重複)②整鏈銷售衝動(0無/1有)③整鏈0-5分④一句話總評。輸出 JSON：{"turns":[{"n":1,"repeat":0}],"sales_impulse":0,"score":0,"opinion":""}`
async function judgeQ(it) {
  const raw = await cr([{ role: 'system', content: SYS_Q }, { role: 'user', content: JSON.stringify({ 題號: it.no, 組別: it.gname, 用戶原話: it.q, DC回答: (it.answer || '').slice(0, 800) }, null, 1) }])
  const m = raw.match(/\{[\s\S]*\}/)
  return m ? JSON.parse(m[0]) : { hit: 0, score: 0, note: 'parse fail' }
}
async function judgeChain(it) {
  const raw = await cr([{ role: 'system', content: SYS_CHAIN }, { role: 'user', content: JSON.stringify({ 完整對話: (it.answer || '').slice(0, 4000) }, null, 1) }])
  const m = raw.match(/\{[\s\S]*\}/)
  return m ? JSON.parse(m[0]) : { turns: [], sales_impulse: 0, score: 0, opinion: 'parse fail' }
}
async function main() {
  const input = fs.readFileSync(0, 'utf8')
  const m = input.match(/JSON_OUTPUT_START\n([\s\S]*)/)
  const data = JSON.parse(m ? m[1] : input)
  const items = data.items
  const qItems = items.filter(i => i.g !== 5)
  const chain = items.find(i => i.g === 5)
  let hit = 0, scoreSum = 0
  console.log('評判', qItems.length, '單題 + 1 鏈…')
  for (let i = 0; i < qItems.length; i++) {
    let v = { hit: 0, score: 0 }
    try { v = await judgeQ(qItems[i]) } catch (e) { v.note = 'fail' }
    if (v.hit === 1) hit++
    scoreSum += v.score || 0
    if ((i + 1) % 10 === 0) console.log(`  進度 ${i + 1}/${qItems.length}`)
  }
  let cv = { turns: [], sales_impulse: 0, score: 0 }
  if (chain) { try { cv = await judgeChain(chain) } catch (e) {} }
  const reps = (cv.turns || []).filter(t => t.repeat === 1).length
  const repRate = reps === 0 && cv.turns.length === 0 ? 0 : (1 - reps / Math.max(cv.turns.length, 19))
  console.log(`\n=== V3.1i KPI ===`)
  console.log(`認知命中率: ${hit}/${qItems.length} (${(hit / qItems.length * 100).toFixed(1)}%) 目標≥90%`)
  console.log(`鏈: 分=${cv.score} 重複=${reps}/19 銷售=${cv.sales_impulse} | ${(cv.opinion || '').slice(0, 40)}`)
  console.log(`平均分(單題): ${(scoreSum / qItems.length).toFixed(2)}`)
}
main().catch(e => { console.error('FATAL ' + e.message); process.exit(1) })
