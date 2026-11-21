# 開啟「全班共用」（Firebase）設定

沒設定時網頁是單機模式（資料只在自己的瀏覽器）。照下面做完，同班同學輸入同一組「班級代碼」就會看到並一起編輯同一份資料，即時同步。

1. 到 <https://console.firebase.google.com> → **新增專案**（Google Analytics 可關閉）。
2. 專案內 **Build → Firestore Database → 建立資料庫**：選「正式版模式」，位置選 `asia-east1`（台灣）。
3. Firestore 的 **規則** 分頁：貼上本 repo 的 `firestore.rules` 內容 → **發布**。
4. **專案設定（齒輪）→ 一般 → 您的應用程式 → 網頁 `</>`**：註冊 app，複製 `firebaseConfig`。
5. 把 `firebaseConfig` 貼進 `firebase-config.js`（`window.FIREBASE_CONFIG = {...}`），commit 並推到 `main`，等 Pages 重新部署。
6. **（建議，必做）限制 API 金鑰**：Google Cloud Console → API 和服務 → 憑證 → 該金鑰：「應用程式限制」選「網站」，加入 `https://patty60723.github.io/*`；「API 限制」可只勾 Cloud Firestore API。

> **為什麼 `firebase-config.js` 裡的 `apiKey` 公開沒關係？** Firebase 網頁金鑰本來就會出現在前端程式裡，任何人都看得到；它只是識別專案，不是密碼。GitHub 的 secret scanning 看到 `AIza…` 格式會通報，那是誤報（`.github/secret_scanning.yml` 已設定忽略這個檔案）。真正控管存取的是第 3 步的 Firestore 規則與班級代碼，加上上面的網域限制。

## 安全性說明
- 資料路徑是 `classes/{班級代碼}/…`，規則不允許列出所有班級，所以只有**知道代碼**的人能讀寫。代碼等於密碼：請用夠長、不易猜的代碼（例如 `sing2026-x7k2`），只傳給同學。
- 這不是個人帳號登入：任何知道代碼的人都能新增、修改、刪除，也看不出是誰改的。代碼外流時，換一組新代碼即可（舊資料留在舊代碼下）。
- 同時編輯：不同的道具／事件互不影響；兩人同時改「同一個道具的同一個欄位」時，後寫入者為準。
