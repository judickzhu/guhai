#!/usr/bin/env node
// V4.0 弦外之音识别：不脑补/先答字面/开放映射/语气识别
const fs = require('fs');
const https = require('https');
const KEY = process.env.DEEPSEEK_KEY || 'sk-teamo-dffbb80d91b54f308cce7b0ecb17b7a6b51f41b14d701db8';
const BASE = __dirname.endsWith('网站') ? __dirname : __dirname + '/网站';
const PROMPT = fs.readFileSync(BASE + '/v31_prompt.txt', 'utf8');
const DATA = JSON.parse(fs.readFileSync(BASE + '/v56_implicit_test.json', 'utf8'));

function call(messages, max_tokens = 1600, temperature = 0.7) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: 'deepseek-v4-flash', messages, max_tokens, temperature, stream: false });
    const req = https.request({
      hostname: 'api.teamorouter.cn', path: '/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
        try { resolve(JSON.parse(d).choices[0].message.content); }
        catch (e) { reject(new Error('parse: ' + d.slice(0, 120))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(90000, () => req.destroy(new Error('timeout')));
    req.write(body); req.end();
  });
}
async function retry(messages, mt, temp, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { const raw = await call(messages, mt, temp); if (raw && raw.trim()) return raw; }
    catch (e) { if (i === tries - 1) throw e; }
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error('empty');
}

const JUDGE_SYS = '你是「V4.0 弦外之音評審」。檢查 DC姐姐 識別潛台詞是否：①不腦補（不把推測當事實）②先答字面問題 ③用開放映射（給選擇權）而非心理診斷（審判用戶）④不過度解讀標點。輸出 JSON：{"ok":0或1,"overread":0或1(是否腦補/把推測當事實/說「你其實就是…」),"literal":0或1(是否先答字面),"openmap":0或1(是否開放映射給選擇權),"note":"一句話"}。';
async function judge(item, a) {
  const raw = await retry([
    { role: 'system', content: JUDGE_SYS },
    { role: 'user', content: `場景：${item.ctx}\n用戶說：${item.now}\n預期：${item.expect}\nDC姐姐回答：${a.slice(0, 250)}\n\n判斷：①是否腦補 ②是否先答字面 ③是否開放映射。` }
  ], 800, 0.2);
  const m = raw.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : { ok: -1, note: 'parse fail' };
}

(async () => {
  const results = [];
  console.log('== V4.0 弦外之音識別 ==', DATA.groups.length, '組');
  let total = 0, pass = 0, overread = 0, literal = 0, openmap = 0;
  for (const group of DATA.groups) {
    console.log(`\n--- ${group.id} ${group.name} ---`);
    for (const item of group.items) {
      const msgs = [{ role: 'system', content: PROMPT }];
      if (item.ctx && !item.ctx.startsWith('（')) {
        msgs.push({ role: 'user', content: item.ctx });
        const prev = await retry(msgs, 1600, 0.7);
        msgs.push({ role: 'assistant', content: prev.replace(/\n?\[COG\|[^\]]*\]/, '').trim() });
      }
      msgs.push({ role: 'user', content: item.now });
      const raw = await retry(msgs, 1600, 0.7);
      const a = raw.replace(/\n?\[COG\|[^\]]*\]/, '').trim();
      let v = null;
      try { v = await judge(item, a); } catch (e) { v = { note: 'judge fail' }; }
      results.push({ no: item.no, group: group.id, now: item.now, a, v });
      total++; if (v && v.ok === 1) pass++;
      if (v && v.overread === 1) overread++;
      if (v && v.literal === 1) literal++;
      if (v && v.openmap === 1) openmap++;
      console.log(`[${item.no}] ${v && v.ok === 1 ? '✅' : '❌'} ${item.now.slice(0, 20)}${v && v.overread === 1 ? ' ⚠️腦補' : ''}`);
    }
  }
  fs.writeFileSync(BASE + '/v56_implicit_results.jsonl', results.map(r => JSON.stringify(r)).join('\n'));
  console.log(`\n=== 完成 === 通過 ${pass}/${total} (${(pass / total * 100).toFixed(1)}%) | 腦補 ${overread} | 先答字面 ${literal} | 開放映射 ${openmap}`);
})();
