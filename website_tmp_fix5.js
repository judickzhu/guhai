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
        if (r.statusCode !== 200) return rej(new Error("HTTP " + r.statusCode));
        try { res(JSON.parse(d).choices[0].message.content); }
        catch (e) { rej(new Error("parse")); }
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
  const need = ["02", "08", "09", "10", "18"];
  const sys = '你是訓練師，對回答做7問歸因。只輸出JSON：{"q1":"","q2":"","q3":"","q4":"","q5":"","q6":"","q7":[]}';
  for (const no of need) {
    const rec = lines.find(r => r.no === no);
    if (!rec) continue;
    const user = "題目：" + rec.q + "\n陷阱：" + rec.trap + "\n回答（截斷到300字）：" + String(rec.answer || "").slice(0, 300) + "\n\n歸因：①用戶真正問什麼？②狀態（主+次+%）？③認知卡點？④應推進哪層？⑤答案夠不夠好（夠好就說做對了什麼）？⑥行為修正規則（當用戶____時，禁止____；先____再____）？⑦覆蓋場景列表？";
    try {
      const raw = await retry([{ role: "system", content: sys }, { role: "user", content: user }], 3000, 0.2);
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        rec.attribution = JSON.parse(m[0]);
        console.log(no, "✅ q6:", (rec.attribution.q6 || "").slice(0, 80));
      } else {
        console.log(no, "PARSE FAIL:", raw.slice(0, 80));
      }
    } catch (e) {
      console.log(no, "ERR:", e.message.slice(0, 50));
    }
  }
  fs.writeFileSync("v36_attribution.jsonl", lines.map(x => JSON.stringify(x)).join("\n"));
  console.log("已寫回");
})();
