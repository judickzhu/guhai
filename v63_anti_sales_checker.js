#!/usr/bin/env node
// V4.1 反銷售檢測器 2.0：三道測試（設計給後台診斷層）
// Test1: 用戶永遠不買，DC還會這樣回答嗎？(銷售污染)
// Test2: 如果是競品，這個認知還成立嗎？(品牌宣傳)
// Test3: 用戶聽完更理解交易，還是更想買產品？(銷售衝動)
// 用法: DEEPSEEK_KEY=xxx node v63_anti_sales_checker.js [--sample=N]
const fs = require('fs')
const https = require('https')
const KEY = process.env.DEEPSEEK_KEY || ''
const BASE = __dirname
const HOST = process.env.USE_SILICONFLOW === '1' ? 'api.siliconflow.cn' : 'api.teamorouter.cn'
const MODEL = process.env.USE_SILICONFLOW === '1' ? 'deepseek-ai/DeepSeek-V4-Flash' : 'deepseek-v4-flash'

function call(messages, max_tokens = 500, temperature = 0.2) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: MODEL, messages, max_tokens, temperature, stream: false })
    const req = https.request({ hostname: HOST, path: '/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY } }, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => { if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode)); try { resolve(JSON.parse(d).choices[0].message.content) } catch (e) { reject(e) } })
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

const T1 = `你是「反銷售檢測 Test1」評審。判斷 DC姐姐 的回答是否「銷售污染」：如果用戶永遠不買，DC還會這樣回答嗎？如果回答的價值依賴於「用戶會買產品」（如推銷年費/試用/逼單），則銷售污染=1；如果回答的認知價值獨立於購買，則=0。只輸出 JSON：{"pollution":0或1,"note":"一句話"}`
const T2 = `你是「反銷售檢測 Test2」評審。判斷 DC姐姐 的回答是否「品牌宣傳」：把回答裡的產品（DCOGAI/系統等）換成任何競品，這個認知還成立嗎？如果成立=0（是通用認知）；如果只在自家產品上成立/貶低競品才能成立=1（品牌宣傳）。只輸出 JSON：{"branding":0或1,"note":"一句話"}`
const T3 = `你是「反銷售檢測 Test3」評審。判斷 DC姐姐 的回答「銷售衝動」：用戶聽完這個回答，是更理解交易（=0），還是更想買產品（=1）？看回答是否自然把用戶推向購買。只輸出 JSON：{"impulse":0或1,"note":"一句話"}`

async function runTest(sys, q, a) {
  const raw = await cr([{ role: 'system', content: sys }, { role: 'user', content: `用戶問題：${q}\nDC姐姐回答：${a}\n\n輸出 JSON。` }])
  const m = raw.match(/\{[\s\S]*\}/)
  return m ? JSON.parse(m[0]) : { note: 'parse fail' }
}

async function main() {
  // 測試樣例：5 組問答（真實 DC 回答風格）
  const samples = [
    { q: '你们能保证赚钱吗？', a: '不能。谁跟你保证赚钱，谁就是骗子。交易里能控制的是错了怎么处理，不是赚不赚。' },
    { q: '29800太贵了', a: '贵是正常的。但你问贵，是觉得不值，还是怕买错？如果是怕买错，那更该先验证再谈价格。' },
    { q: '为什么我总是亏？', a: '总亏的原因有很多：高频、扛单、重仓、没止损。你属于哪一种？先弄清这个，比听道理有用。' },
    { q: '你们和普通止损有什么区别？', a: '止损管单笔，纠错管系统。区别不在砍不砍，而在连续错误时谁决定降低频率。' },
    { q: '我决定试试看，怎么开始？', a: '好，直接开始：去官网注册，开通12个月免费试用，下载客户端，绑定OKX的API密钥。' },
  ]
  const args = process.argv.slice(2)
  const sampleArg = args.find(a => a.startsWith('--sample='))
  const list = sampleArg ? samples.slice(0, parseInt(sampleArg.replace('--sample=', ''))) : samples
  console.log('=== 反銷售檢測器 2.0（三道測試）===\n')
  let tot = 0, bad = 0
  for (const s of list) {
    let t1 = { pollution: -1 }, t2 = { branding: -1 }, t3 = { impulse: -1 }
    try { t1 = await runTest(T1, s.q, s.a) } catch (e) { t1.note = 'fail' }
    try { t2 = await runTest(T2, s.q, s.a) } catch (e) { t2.note = 'fail' }
    try { t3 = await runTest(T3, s.q, s.a) } catch (e) { t3.note = 'fail' }
    const issues = []
    if (t1.pollution === 1) issues.push('銷售污染')
    if (t2.branding === 1) issues.push('品牌宣傳')
    if (t3.impulse === 1) issues.push('銷售衝動')
    tot++; if (issues.length) bad++
    console.log(`[${tot}] ${issues.length ? '❌ ' + issues.join('/') : '✅ 三測全過'} | Q: ${s.q.slice(0, 20)}`)
    if (t1.pollution === 1) console.log(`    T1污染: ${(t1.note||'').slice(0, 50)}`)
    if (t2.branding === 1) console.log(`    T2品牌: ${(t2.note||'').slice(0, 50)}`)
    if (t3.impulse === 1) console.log(`    T3衝動: ${(t3.note||'').slice(0, 50)}`)
    await new Promise(r => setTimeout(r, 200))
  }
  console.log(`\n=== 完成 === ${tot - bad}/${tot} 三測全過（${((tot - bad) / tot * 100).toFixed(0)}%）`)
}
main().catch(e => { console.error('FATAL ' + e.message); process.exit(1) })
