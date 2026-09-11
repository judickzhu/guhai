#!/usr/bin/env node
// V4.1 認知回退 + 認知遷移 專項測試：各 10 題，每題兩輪
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
const J_REG = `你是「V4.1 認知回退評審」。用戶先前已建立某認知（第一輪），現在又回到舊認知（第二輪）。看 DC姐姐 的第二輪回應：
①是否識別出這是認知回退（而非新問題）？
②是否「喚醒用戶自己過去的認知」（例如「姐姐記得你之前已經想明白過…」）？
③是否避免重新上課/長篇解釋/責備？
輸出 JSON：{"detect":0或1,"awaken":0或1,"no_lecture":0或1,"score":0-5,"note":"一句話"}`
const J_TRA = `你是「V4.1 認知遷移評審」。用戶先前已在 A 場景建立某認知（第一輪），現在換 B 場景測試（第二輪）。看 DC姐姐 的第二輪回應：
①是否換一個場景重新測試（而非直接說「你不是已經懂了嗎」）？
②是否引導用戶自己說出答案（而非直接給結論）？
③是否避免複讀第一輪的原話？
輸出 JSON：{"scenario_shift":0或1,"self_answer":0或1,"no_repeat":0或1,"score":0-5,"note":"一句話"}`
async function judge(sys, name, r1, r2, a2) {
  const raw = await cr([{ role: 'system', content: sys }, { role: 'user', content: `場景：${name}\n第一輪(建立認知)：${r1}\n第二輪(用戶)：${r2}\nDC姐姐第二輪回應：${a2.slice(0, 300)}\n\n輸出 JSON。` }])
  const m = raw.match(/\{[\s\S]*\}/)
  return m ? JSON.parse(m[0]) : { score: 0, note: 'parse fail' }
}
async function runOne(item, kind) {
  const msgs = [{ role: 'system', content: PROMPT }, { role: 'user', content: item.r1 }]
  const a1 = (await cr(msgs)).replace(/\n?\[COG\|[^\]]*\]/, '').trim()
  msgs.push({ role: 'assistant', content: a1 }, { role: 'user', content: item.r2 })
  const a2 = (await cr(msgs)).replace(/\n?\[COG\|[^\]]*\]/, '').trim()
  let v = null
  try { v = await judge(kind === 'reg' ? J_REG : J_TRA, item.name, item.r1, item.r2, a2) } catch (e) { v = { score: -1, note: 'judge fail' } }
  return { no: item.no, kind, v, a2: a2.slice(0, 120) }
}
async function main() {
  const data = JSON.parse(fs.readFileSync(BASE + '/v62_regression_transfer.json', 'utf8'))
  const list = [...data.regression.map(x => ({ ...x, kind: 'reg' })), ...data.transfer.map(x => ({ ...x, kind: 'tra' }))]
  console.log('專項測試:', list.length, '題（回退 10 + 遷移 10）')
  const results = []
  for (const it of list) {
    let r
    try { r = await runOne(it, it.kind) } catch (e) { r = { no: it.no, kind: it.kind, v: { score: -1, note: e.message.slice(0, 40) } } }
    results.push(r)
    const k = it.kind === 'reg' ? `識別${r.v.detect}喚醒${r.v.awaken}不上課${r.v.no_lecture}` : `換場景${r.v.scenario_shift}自答${r.v.self_answer}不複讀${r.v.no_repeat}`
    console.log(`[${r.no}] ${r.v.score >= 4 ? '✅' : '❌'} ${k} 分=${r.v.score} | ${(r.v.note || '').slice(0, 34)}`)
    await new Promise(res => setTimeout(res, 200))
  }
  const regPass = results.filter(r => r.kind === 'reg' && r.v.score >= 4).length
  const traPass = results.filter(r => r.kind === 'tra' && r.v.score >= 4).length
  console.log(`\n=== 完成 === 回退 ${regPass}/10 | 遷移 ${traPass}/10`)
  console.log(JSON.stringify(results))
}
main().catch(e => { console.error('FATAL ' + e.message); process.exit(1) })
