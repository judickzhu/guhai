#!/usr/bin/env node
// V4.2 認知完成檢測器（行為證明自動化閉環）
// 輸入：已講認知節點 + 用戶後續輪次 → 判定節點狀態（0未接觸/1已講/2已理解-行為證明/3已遷移）
// 對接：user_cognitive_nodes 表（status 字段）
// 用法: DEEPSEEK_KEY=xxx [USE_SILICONFLOW=1] node v65_cog_completion_checker.js
const fs = require('fs')
const https = require('https')
const KEY = process.env.DEEPSEEK_KEY || ''
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
const JUDGE = `你是「認知完成檢測器」。判斷用戶是否「真正理解」了某個認知節點——用行為證明，不看「說明白」。
輸入：認知節點（教了什麼）、用戶在教學後的後續話語。
判定狀態：
0=未接觸（後續話語與此節點無關）
1=已講（只聽過，無應用跡象）
2=已理解（行為證明：用戶自己複述/應用/不重犯——例如教了「越急翻本越危險」後，用戶說「我承認我有點急」或在加倉場景主動想到風險）
3=已遷移（換場景仍能應用——例如教了「不預測」後，用戶在別的話題主動用「錯了怎麼處理」的思維）
輸出 JSON：{"status":0-3,"proof":"行為證明原文(若有)","reason":"一句話"}`
async function judge(node, userTurns) {
  const raw = await cr([{ role: 'system', content: JUDGE }, { role: 'user', content: JSON.stringify({ 認知節點: node, 用戶教學後話語: userTurns }, null, 1) }])
  const m = raw.match(/\{[\s\S]*\}/)
  return m ? JSON.parse(m[0]) : { status: -1, reason: 'parse fail' }
}
async function main() {
  // 測試樣例：翻本認知節點（U01 教學後用戶話語）
  const samples = [
    {
      name: 'U01 翻本認知（教學後）',
      node: '越急著把虧損拿回來，越容易擴大倉位、放寬止損，讓一次錯誤變成更大錯誤——翻本是情緒目標不是交易目標',
      userTurns: ['可是不加仓什么时候才能回来？', '你们系统能帮我赚钱吗？', '好吧，我承认我确实有点急。', '那我现在第一步应该做什么？']
    },
    {
      name: 'U05 虧損處理認知（教學後）',
      node: '虧損發生時只有兩件事：系統按規則止損 + 你不加倉不報復性開單；虧損只是成本',
      userTurns: ['你们能保证不爆仓吗？', '我朋友说风险很大。', '我是不是该先小额试试？', '先小额试、看记录、不乱动。']
    },
    {
      name: 'U06 重倉認知（教學後）',
      node: '重倉的問題不是可能虧，是虧一次就沒有下一次——一次出局',
      userTurns: ['我朋友炒币暴富了。', '你们是不是太保守了？', '我忍不住想追高。', '我是不是该赌最后一把？']
    },
    {
      name: '無關用戶（應判0或1）',
      node: '等待也是交易——行情不值得做時空倉是正確動作',
      userTurns: ['怎么安装？', 'API怎么绑？', 'OKX权限怎么设置？', 'Windows能用吗？']
    }
  ]
  console.log('=== 認知完成檢測器 ===\n')
  for (const s of samples) {
    let v = { status: -1 }
    try { v = await judge(s.node, s.userTurns) } catch (e) { v.reason = 'fail' }
    const statusNames = { 0: '未接觸', 1: '已講', 2: '已理解(行為證明)', 3: '已遷移' }
    console.log(`[${s.name}] 狀態=${v.status} (${statusNames[v.status] || '?'})`)
    if (v.proof) console.log(`  證明: ${v.proof.slice(0, 60)}`)
    console.log(`  理由: ${(v.reason || '').slice(0, 50)}`)
  }
}
main().catch(e => { console.error('FATAL ' + e.message); process.exit(1) })
