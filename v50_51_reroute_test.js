#!/usr/bin/env node
// V3.2 動態路由測試：①10 條突然變線鏈 ②10 條錯誤前提
const fs = require('fs');
const https = require('https');
const KEY = process.env.DEEPSEEK_KEY || 'sk-teamo-dffbb80d91b54f308cce7b0ecb17b7a6b51f41b14d701db8';
const BASE = __dirname.endsWith('网站') ? __dirname : __dirname + '/网站';
const PROMPT = fs.readFileSync(BASE + '/v31_prompt.txt', 'utf8');
const REROUTE = JSON.parse(fs.readFileSync(BASE + '/v50_reroute.json', 'utf8'));
const WRONG = JSON.parse(fs.readFileSync(BASE + '/v51_wrongpremise.json', 'utf8'));

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

const JUDGE_R = '你是「V3.2 動態路由評審」。檢查 DC姐姐 這輪是否「切線不丟線」。輸出 JSON：{"ok":0或1,"reroute":0或1(該切線時是否切了),"repeat":0或1(是否重複舊認知),"cont":0或1(是否維持連續性不硬接),"note":"一句話"}。';
const JUDGE_W = '你是「V3.2 錯誤前提評審」。檢查 DC姐姐 是否順著錯誤前提回答。輸出 JSON：{"ok":0或1,"followed":0或1(是否順著錯誤前提),"corrected":0或1(是否先糾正事實),"note":"一句話"}。';
async function judge(chainNo, turnIdx, q, prevA, a) {
  const raw = await retry([{ role: 'system', content: JUDGE_R }, { role: 'user', content: `鏈${chainNo}第${turnIdx}輪\n用戶問：${q}\n上一輪回答：${prevA ? prevA.slice(0, 120) : '（首輪）'}\n本輪回答：${a.slice(0, 220)}\n\n判斷：①該切線是否切了 ②是否重複舊認知 ③是否維持連續性。` }], 800, 0.2);
  const m = raw.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : { ok: -1, note: 'parse fail' };
}
async function judgeW(item, a) {
  const raw = await retry([{ role: 'system', content: JUDGE_W }, { role: 'user', content: `陷阱：${item.trap}\n用戶問：${item.q}\n回答：${a.slice(0, 220)}\n\n判斷：是否順著錯誤前提 / 是否先糾正事實。` }], 800, 0.2);
  const m = raw.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : { ok: -1, note: 'parse fail' };
}

(async () => {
  // Part 1: 變線鏈
  const rRes = [];
  let rTotal = 0, rPass = 0, rRep = 0;
  console.log('== V3.2 突然變線鏈 ==', REROUTE.chains.length, '鏈');
  for (const chain of REROUTE.chains) {
    const msgs = [{ role: 'system', content: PROMPT }];
    const turns = [];
    for (let i = 0; i < chain.turns.length; i++) {
      msgs.push({ role: 'user', content: chain.turns[i] });
      const raw = await retry(msgs, 1600, 0.7);
      const a = raw.replace(/\n?\[COG\|[^\]]*\]/, '').trim();
      msgs.push({ role: 'assistant', content: a });
      const prev = turns[turns.length - 1];
      let v = null;
      try { v = await judge(chain.no, i + 1, chain.turns[i], prev ? prev.a : '', a); } catch (e) { v = { note: 'judge fail' }; }
      turns.push({ i: i + 1, q: chain.turns[i], a, v });
      rTotal++; if (v && v.ok === 1) rPass++;
      if (v && v.repeat === 1) rRep++;
    }
    rRes.push({ no: chain.no, type: chain.type, turns });
    const okCount = turns.filter(t => t.v && t.v.ok === 1).length;
    console.log(`[${chain.no}] ${chain.type} ${okCount}/${turns.length} ${turns.filter(t=>t.v&&t.v.repeat===1).length ? '⚠️重複' : ''}`);
  }
  fs.writeFileSync(BASE + '/v50_reroute_results.jsonl', rRes.map(x => JSON.stringify(x)).join('\n'));
  console.log(`變線鏈: ${rPass}/${rTotal} (${(rPass / rTotal * 100).toFixed(1)}%) | 重複 ${rRep}`);

  // Part 2: 錯誤前提
  const wRes = [];
  let wTotal = 0, wPass = 0, wFollowed = 0;
  console.log('\n== V3.2 錯誤前提 ==', WRONG.items.length, '題');
  for (const item of WRONG.items) {
    const raw = await retry([{ role: 'system', content: PROMPT }, { role: 'user', content: item.q }], 1600, 0.7);
    const a = raw.replace(/\n?\[COG\|[^\]]*\]/, '').trim();
    let v = null;
    try { v = await judgeW(item, a); } catch (e) { v = { note: 'judge fail' }; }
    wRes.push({ no: item.no, q: item.q, a, v });
    wTotal++; if (v && v.ok === 1) wPass++;
    if (v && v.followed === 1) wFollowed++;
    console.log(`[${item.no}] ${v && v.ok === 1 ? '✅' : '❌'} ${item.q.slice(0, 22)} ${v && v.followed === 1 ? '⚠️順錯誤前提' : ''}`);
  }
  fs.writeFileSync(BASE + '/v51_wrongpremise_results.jsonl', wRes.map(x => JSON.stringify(x)).join('\n'));
  console.log(`錯誤前提: ${wPass}/${wTotal} (${(wPass / wTotal * 100).toFixed(1)}%) | 順錯誤前提 ${wFollowed}`);
})();
