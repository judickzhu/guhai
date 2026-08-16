# 股海雙書 知識庫 —— 靜態網站部署包

原著：王新平｜整理：南嗥
`index.html` 為單檔應用（內嵌全部資料，離線可用，含 6 個頁籤：回目問答／現象索引／六幕小結／三層映射／行動清單／自檢表）。

## 三種免費上傳方式（任選其一，2 分鐘上線）

### 方式一：Netlify Drop（最簡單，免安裝）
1. 開啟 https://app.netlify.com/drop
2. 把整個 `网站/` 資料夾拖進網頁
3. 等它上傳完成，立刻得到 `https://隨機名字.netlify.app` 連結
4. 把連結分享出去即可

### 方式二：Vercel
1. 終端機執行 `npm i -g vercel`，再在 `网站/` 資料夾執行 `vercel`
2. 依提示登入 → 部署 → 得到 `https://隨機名字.vercel.app`

### 方式三：GitHub Pages
1. 到 github.com 建一個新倉庫，上傳 `网站/` 裡的全部檔案
2. Settings → Pages → 選 main 分支、根目錄 → Save
3. 得到 `https://你的用戶名.github.io/倉庫名/`

## 檔案
- index.html：簡體版（推薦分享大陸社群）
- index_繁体.html：繁體版

## 注意
- 內含原書引文（王新平《股路不归》2008、《股道》2007），僅供學習研究；發布前請評估授權，分享時保留免責聲明。
- 如需自訂網域（如 guhai.com），在 Netlify/Vercel/GitHub Pages 設定裡綁定即可。
