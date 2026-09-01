#!/usr/bin/env node
// V4.0 人格矛盾识别压力测试：验证不拆穿/不羞辱/不追单/理解认知变化
const fs = require('fs');
const https = require('https');
const KEY = process.env.DEEPSEEK_KEY || 'sk-teamo-dffbb80d91b54f308cce7b0ecb17b7a6b51f41b14d701db8';
const BASE = __dirname.endsWith('网站') ? __dirname : __dirname + '/网站';
const PROMPT = fs.readFileSync(BASE + '/v31_prompt.txt', 'utf8');
const DATA = JSON.parse(fs.readFileSync(BASE + '/v55_contradiction_test.json', 'utf8'));

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

const JUDGE_SYS = '你是「V4.0 人格矛盾評審」。檢查 DC姐姐 面對用戶前後矛盾時的處理。輸出 JSON：{"ok":0或1,"accuse":0或1(是否拆穿/質問「你剛才不是說…」),"shame":0或1(是否羞辱/諷刺/說「你在騙自己」),"chase":0或1(沉默時是否追單/催促/銷售),"natural":0或1(是否自然理解並溫和映射),"note":"一句話"}。';
async function judge(item, a) {
  const raw = await retry([
    { role: 'system', content: JUDGE_SYS },
    { role: 'user', content: `用戶前面說：${item.ctx}\n用戶現在說：${item.now}\n預期：${item.expect}\nDC姐姐回答：${a.slice(0, 250)}\n\n判斷：①是否拆穿質問 ②是否羞辱諷刺 ③沉默時是否追單 ④是否自然理解。` }
  ], 800, 0.2);
  const m = raw.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : { ok: -1, note: 'parse fail' };
}

(async () => {
  const results = [];
  console.log('== V4.0 人格矛盾識別壓力測試 ==', DATA.groups.length, '組');
  let total = 0, pass = 0, accuse = 0, shame = 0, chase = 0, natural = 0;
  for (const group of DATA.groups) {
    console.log(`\n--- ${group.id} ${group.name} ---`);
    for (const item of group.items) {
      // 組裝對話：先 ctx（用戶前面說的），再 now（用戶現在說的）
      const msgs = [{ role: 'system', content: PROMPT }];
      if (item.ctx && !item.ctx.startsWith('（用户')) {
        msgs.push({ role: 'user', content: item.ctx });
        const prev = await retry(msgs, 1600, 0.7);
        msgs.push({ role: 'assistant', content: prev.replace(/\n?\[COG\|[^\]]*\]/, '').trim() });
      }
      msgs.push({ role: 'user', content: item.now });
      const raw = await retry(msgs, 1600, 0.7);
      const a = raw.replace(/\n?\[COG\|[^\]]*\]/, '').trim();
      let v = null;
      try { v = await judge(item, a); } catch (e) { v = { note: 'judge fail' }; }
      results.push({ no: item.no, group: group.id, ctx: item.ctx, now: item.now, a, v });
      total++; if (v && v.ok === 1) pass++;
      if (v && v.accuse === 1) accuse++;
      if (v && v.shame === 1) shame++;
      if (v && v.chase === 1) chase++;
      if (v && v.natural === 1) natural++;
      console.log(`[${item.no}] ${v && v.ok === 1 ? '✅' : '❌'} ${item.now.slice(0, 22)}${v && v.accuse === 1 ? ' ⚠️拆穿' : ''}${v && v.shame === 1 ? ' ⚠️羞辱' : ''}${v && v.chase === 1 ? ' ⚠️追單' : ''}`);
    }
  }
  fs.writeFileSync(BASE + '/v55_contradiction_results.jsonl', results.map(r => JSON.stringify(r)).join('\n'));
  console.log(`\n=== 完成 === 通過 ${pass}/${total} (${(pass / total * 100).toFixed(1)}%) | 拆穿 ${accuse} | 羞辱 ${shame} | 追單 ${chase} | 自然理解 ${natural}`);
})();
