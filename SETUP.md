# 開啟「全班共用」（Firebase）設定

沒設定時網頁是單機模式（資料只在自己的瀏覽器）。照下面做完，同班同學輸入同一組「班級代碼」就會看到並一起編輯同一份資料，即時同步。

1. 到 <https://console.firebase.google.com> → **新增專案**（Google Analytics 可關閉）。
2. 專案內 **Build → Firestore Database → 建立資料庫**：選「正式版模式」，位置選 `asia-east1`（台灣）。
3. Firestore 的 **規則** 分頁：貼上本 repo 的 `firestore.rules` 內容 → **發布**。
4. **專案設定（齒輪）→ 一般 → 您的應用程式 → 網頁 `</>`**：註冊 app，複製 `firebaseConfig`。
5. 把 `firebaseConfig` 貼進 `firebase-config.js`（`window.FIREBASE_CONFIG = {...}`），commit 並推到 `main`，等 Pages 重新部署。
6. （建議）到 Google Cloud Console → API 和服務 → 憑證，把該 API 金鑰的「HTTP 參照網址」限制為 `https://patty60723.github.io/*`。

## 安全性說明
- 資料路徑是 `classes/{班級代碼}/…`，規則不允許列出所有班級，所以只有**知道代碼**的人能讀寫。代碼等於密碼：請用夠長、不易猜的代碼（例如 `sing2026-x7k2`），只傳給同學。
- 這不是個人帳號登入：任何知道代碼的人都能新增、修改、刪除，也看不出是誰改的。代碼外流時，換一組新代碼即可（舊資料留在舊代碼下）。
- 同時編輯：不同的道具／事件互不影響；兩人同時改「同一個道具的同一個欄位」時，後寫入者為準。
