# DCOGAI 後台同步 · 可靠操作手冊（純 Node 直連版）

> 版本：2026-09-05（v11 實戰總結，34 分類 / 2891 題全量同步成功）
> 適用：把本地 `网站/dc-sister/kb-data.json`（→ `网站/site_full_rebuild.js`）同步到 s.dcogai.com 後台。
> 本文檔是多次失敗（DELETE bug／evaluate 超時／併發錯亂）後沉澱的**可靠做法**——照此操作可一次到位。

---

## 一、背景：後台同步的四個坑（為何之前一直失敗）

### 坑 1｜`DELETE /api/admin/kb/qa/{id}` 按全局 id 解析（Bug，勿用）
- 後台 QA 的 `id` 是**分類內序號**（每個分類都從 c1 開始），但 DELETE 按**全局第一個同 id** 刪——跨分類誤刪。
- 帶 `body: {category_id}` 也無效（後端忽略）。
- **結論：QA 層級 DELETE/PUT 一律不用**（詳見 `DCOGAI開發轉達稿-刪除接口.md`）。
- ✅ 安全做法：只刪**分類**（`DELETE /api/admin/kb/category/{catId}`），再重建整個分類。

### 坑 2｜`GET /api/admin/kb` 一次返回全量（~600KB+），瀏覽器 evaluate 超時
- 後台沒有輕量列表接口（`?light=1`、`/categories`、`/summary` 均無效）。
- 題數多（2000+）時，在 ego-browser 的 `js()` 裡 `fetch` 全庫 → `Runtime.evaluate timed out`。
- **結論：不要用 ego-browser 頁面 evaluate 操作大庫**。

### 坑 3｜多 job 併發 → 重複/錯亂
- 多次 kill 後台 bash job，但 ego-browser 子進程可能 detached 存活，多個進程同時 POST → 分類題數暴漲（曾見 情緒識別 19→943、銷售邊界 10→544）。
- **結論：同一時間只允許一個同步進程**；用 `pgrep -fl "ego-browser|rebuild"` 先清場。

### 坑 4｜後台服務偶發 socket hang up / 慢
- DELETE 分類偶發 `socket hang up`（但實際可能已刪成功——以「重新 GET 驗證」為準，勿盲重試）。
- GET 全庫在題多時耗時 5-10 秒屬正常。

---

## 二、可靠方案：純 Node 直連 admin API

### 原理
不走 ego-browser 頁面 evaluate，直接用 Node `https` 請求 admin API——
- 無 evaluate 超時；
- 單進程可控；
- 分類層級 DELETE + 整類重建，避開 QA 全局 id Bug。

### 前置
1. 本地最新知識庫已生成 `网站/site_full_rebuild.js`：
   ```bash
   python3 scripts/gen_site_full_rebuild.py
   # 預期輸出：分類 34｜總題 2891｜缺 a_en 0
   ```
2. 取得 admin token（登入態）：用 ego-browser 讀一次 localStorage：
   ```bash
   ego-browser nodejs <<'EOF'
   (async () => {
     const task = await useOrCreateTaskSpace('dcogai full rebuild')
     await openOrReuseTab('https://s.dcogai.com/admin', { wait: true, timeout: 40 })
     await wait(2)
     const tok = await js(`localStorage.getItem('admin_token')`)
     cliLog(tok)
   })().catch(e => { cliLog('FATAL ' + e.message); process.exit(1) })
   EOF
   ```
   （輸出即 token，拷入下步環境變數）

---

## 三、同步執行

### 方式 A：全量重建（清空 → 重建，最徹底）
```bash
# 完整版腳本：先清空所有分類，再依 site_full_rebuild.js 重建 34 分類
# （若需要可重建 rebuild_backend_node.js；以下為其核心邏輯，亦可直接用 resume 版替代）
ADMIN_TOKEN=<token> node <全量腳本>
```

### 方式 B：續傳重建（推薦，斷點安全）——`rebuild_backend_node_resume.js`
- **跳過已齊分類**（按名字核驗題數），只刪除＋重建「缺失/未齊」分類；
- 單條 POST 失敗自動重試（不整批退出）；
- 每類完成即寫入 done，中斷後重跑會從斷點續。

```bash
ADMIN_TOKEN="<token>" node rebuild_backend_node_resume.js > /tmp/rebuild.log 2>&1
```
建議**後台執行** + 看 log（分類大時需數分鐘：股路不歸 1371 題約 5-8 分鐘）：
```bash
# 用 run_in_background 或 nohup 啟動，然後：
tail -f /tmp/rebuild.log
```
預期尾部：
```
OK 股道·DC問答 (1031) ...
RESUME DONE rebuilt=N
```

### 方式 C：只補單一分類（如只同步「銷售邊界」）
1. `DELETE /api/admin/kb/category/{catId}` 刪同名分類（可重複 GET 驗證歸零）
2. `POST /api/admin/kb/category` 建新分類（記下返回的 id）
3. 逐題 `POST /api/admin/kb/qa`（payload 含 category_id），每題間隔 0.2-1s

---

## 四、最終驗證（必做）

```bash
ADMIN_TOKEN="<token>" node -e "
const https=require('https'); const fs=require('fs');
function api(p){return new Promise((res,rej)=>{const u=new URL('https://s.dcogai.com'+p);const r=https.request(u,{method:'GET',headers:{'Authorization':'Bearer '+process.env.ADMIN_TOKEN},timeout:60000},x=>{let d='';x.on('data',c=>d+=c);x.on('end',()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})});r.on('error',e=>rej(e));r.end()})}
(async()=>{
  const kb=await api('/api/admin/kb'); const cats=Array.isArray(kb)?kb:(kb.categories||[]);
  const SITE=JSON.parse(fs.readFileSync('网站/site_full_rebuild.js','utf8').replace('const SITE_FULL = ','').replace(/;\s*\$/,''));
  let ok=0,bad=[]; for(const sc of SITE){const cur=cats.find(c=>c.name===sc.name);const n=cur?(cur.qa||cur.items||[]).length:-1; if(n===sc.qa.length)ok++; else bad.push(sc.name+'('+n+'/'+sc.qa.length+')')}
  const extra=cats.filter(c=>!SITE.some(s=>s.name===c.name));
  const tot=cats.reduce((s,c)=>s+(c.qa||c.items||[]).length,0);
  console.log('匹配:'+ok+'/'+SITE.length,'| 額外:',extra.length?extra.map(c=>c.name).join(','):'無','| 總題:'+tot);
  if(bad.length)console.log('不匹配:',bad.join(' | '));
})().catch(e=>{console.error(e.message);process.exit(1)})"
```
**通過標準**：`匹配:34/34 額外:無 總題:2891`（題數隨 kb-data 增減變動）。

---

## 五、執行紀律（防再翻車）

1. **單進程**：跑同步前先 `pkill -9 -f "ego-browser nodejs"`＋`pgrep -fl rebuild` 確認無殘留。
2. **勿用 ego-browser 頁面 evaluate 操作大庫**；一律純 Node 直連。
3. **勿用 QA 層級 DELETE/PUT**；要換內容就刪分類→重建分類。
4. **失敗判據以 GET 驗證為準**：socket hang up 不代表失敗——先重新 GET 看實際狀態，勿盲重試（曾致銷售邊界膨脹）。
5. 分類 POST 後**每次 GET 全庫核驗**放最後做一次即可（避免反覆大 GET）。
6. 大批量（1000+ 題）用**續傳版**並後台跑、看 log；不要前台等。

---

## 六、本次同步紀錄（2026-09-05）

- 修復內容已入後台：認知主題 27 題（刪 8 條與股路不歸重複書摘題）、情緒識別 19 題（繁體姐姐風、禁語清零）、兩分類 mdi 圖標。
- 全庫 34 分類 / 2891 題與本地完全一致；最終驗證 34/34、額外 0。
- 相關文件：`rebuild_backend_node_resume.js`（可重用）、`网站/dc-sister/kb-data.json`、`网站/site_full_rebuild.js`、`网站/DCOGAI開發轉達稿-刪除接口.md`（DELETE bug 詳情）。
