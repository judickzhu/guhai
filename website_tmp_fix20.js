const fs = require("fs");
const https = require("https");
const KEY = "sk-teamo-dffbb80d91b54f308cce7b0ecb17b7a6b51f41b14d701db8";
function call(messages, mt = 3000, temp = 0.2) {
  return new Promise((res, rej) => {
    const body = JSON.stringify({ model: "deepseek-v4-flash-free", messages, max_tokens: mt, temperature: temp, stream: false });
    const req = https.request({
      hostname: "api.teamorouter.cn", path: "/v1/chat/completions", method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + KEY }
    }, r => {
      let d = "";
      r.on("data", c => d += c);
      r.on("end", () => {
        if (r.statusCode !== 200) return rej(new Error("HTTP " + r.statusCode + " " + d.slice(0, 120)));
        try { res(JSON.parse(d).choices[0].message.content); }
        catch (e) { rej(new Error("parse " + d.slice(0, 120))); }
      });
    });
    req.on("error", rej);
    req.setTimeout(120000, () => req.destroy(new Error("timeout")));
    req.write(body); req.end();
  });
}
async function retry(ms, mt, temp, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { const raw = await call(ms, mt, temp); if (raw && raw.trim()) return raw; }
    catch (e) { if (i === tries - 1) throw e; }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error("empty");
}
(async () => {
  const lines = fs.readFileSync("v36_attribution.jsonl", "utf8").trim().split("\n").map(l => JSON.parse(l));
  const rec20 = lines.find(r => r.no === "20");
  const sys = '你是訓練師，對回答做7問歸因。輸出JSON：{"q1":"","q2":"","q3":"","q4":"","q5":"","q6":"","q7":[]}';
  const user = "題目：" + rec20.q + "\n陷阱：用戶聽懂但覺得沒必要用，正確做法是承認理解≠需要、不銷售不提試用。\n回答要點：姐姐鬆一口氣→承認用戶理解到位+執行力有信心→確實不需要→姐姐不會硬說你需要→哪天手不聽話再來找我。\n\n歸因：①用戶真正問什麼？②用戶狀態（主+次+%）？③認知卡點？④應推進哪層？⑤這答案夠不夠好（夠好就說做對了什麼）？⑥行為修正規則？⑦覆蓋場景列表？";
  const raw = await retry([{ role: "system", content: sys }, { role: "user", content: user }], 3000, 0.2);
  const m = raw.match(/\{[\s\S]*\}/);
  const attr = m ? JSON.parse(m[0]) : null;
  if (!attr) { console.log("PARSE FAIL:", raw.slice(0, 200)); process.exit(1); }
  console.log("q1:", attr.q1);
  console.log("q2:", attr.q2);
  console.log("q3:", attr.q3);
  console.log("q5:", attr.q5);
  console.log("q6:", attr.q6);
  console.log("q7:", JSON.stringify(attr.q7));
  rec20.attribution = attr;
  fs.writeFileSync("v36_attribution.jsonl", lines.map(x => JSON.stringify(x)).join("\n"));
  console.log("已寫回 v36_attribution.jsonl");
})();
