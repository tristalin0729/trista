# 智囊團 — 正式版

吳寶春團隊內部溝通、交辦、待辦 app。畫面與互動完全比照 Trista 確認過的原型（`prototype.html`），
差別是資料改用 **Firebase（Firestore）** 即時同步給所有人，管理員登入改用**真正的 Firebase Auth**，
並且可以「加到手機主畫面」變成一個 app（PWA）。

這是純前端的靜態網站（沒有 npm、沒有建置流程），所以佈署非常單純：把這個資料夾放到 GitHub，
再用 Vercel 匯入就好。以下步驟你自己做一次大概 20–30 分鐘。

## 這個資料夾裡有什麼

```
index.html          主畫面
styles.css           樣式（沿用原型）
app.js                主要程式邏輯
firebase-config.js    你要貼上 Firebase 設定的地方
manifest.json         PWA 設定（app 名稱、圖示、顏色）
sw.js                  離線快取（Service Worker）
firestore.rules       Firestore 安全性規則，要貼到 Firebase 後台
icons/                 app 圖示（已經生成好了）
server.ps1             只是給你本機測試用的小型伺服器，正式上線用不到
```

---

## 第一步：建立 Firebase 專案（免費）

1. 開啟 https://console.firebase.google.com ，用你的 Google 帳號登入，按「新增專案」。
2. 專案名稱輸入「智囊團」之類的名稱，一路下一步（不需要 Google Analytics，可以關掉）。
3. 專案建立好之後，在左側選單找到 **Build → Firestore Database**，按「建立資料庫」。
   - 位置選 `asia-east1`（台灣/香港附近）即可。
   - 模式選「以正式模式啟動」（production mode）。
4. 左側選單找到 **Build → Authentication**，按「開始使用」。
   - 到「Sign-in method」分頁，啟用兩種登入方式：
     - **匿名**（Anonymous）— 一定要開，一般員工靠這個登入才能寫入資料。
     - **電子郵件/密碼**（Email/Password）— 管理員登入用。
5. 到「Authentication → Users」，按「新增使用者」，建立**你自己（第一個管理員）**的帳號：
   - Email 用 `trista810729@gmail.com`
   - 密碼自己設一組（之後登入 app 的管理後台會用到，且可以在 app 裡「變更我的密碼」）。

## 第二步：取得 Firebase 設定，貼進 `firebase-config.js`

1. 在 Firebase 左上角齒輪 → 「專案設定」→ 頁面下方「你的應用程式」，按網頁圖示 `</>` 新增一個網頁應用程式（名稱隨意，不用勾選 Firebase Hosting）。
2. 會出現一段 `const firebaseConfig = {...}`，把裡面 6 個欄位複製，貼到這個資料夾的 [firebase-config.js](firebase-config.js) 取代掉範例值。
3. 確認 `window.BOOTSTRAP_ADMIN_EMAILS` 裡的 Email 跟你在 Authentication 建立的管理員帳號一致（預設已經是 `trista810729@gmail.com`）。

> 這組設定不是密碼，可以放心留在程式碼裡一起上傳到 GitHub；真正的保護在下一步的安全性規則。

## 第三步：設定 Firestore 安全性規則

1. Firebase 左側「Firestore Database → 規則」。
2. 打開這個資料夾的 [firestore.rules](firestore.rules)，全選複製，貼到 Firebase 規則編輯框，**取代**原本內容。
3. 確認裡面的 Email（`trista810729@gmail.com`）跟你的管理員帳號一致。
4. 按「發佈」。

這組規則的意思：所有人（含匿名登入的員工）都能讀取、新增、編輯、刪除「事項」；但只有管理員能新增／改名／刪除「分店、分類」。之後想開放其他人當管理員，就在 app 的「管理後台 → 管理員帳號」新增即可（對方要先請你在 Firebase Console 的 Authentication 幫他建一組帳號）。

## 第四步：本機測試（選用）

因為這台電腦沒有安裝 Node.js，我另外寫了一個用 PowerShell 啟動的小型靜態伺服器，純粹讓你在正式上線前先在瀏覽器裡點點看：

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\A\Desktop\智囊團-app\server.ps1"
```

啟動後用瀏覽器打開 http://localhost:5173 。這一步只是方便你確認畫面，正式上線走的是 Vercel，不需要這個伺服器。

## 第五步：上傳到 GitHub

```bash
cd "C:\Users\A\Desktop\智囊團-app"
git init
git add .
git commit -m "智囊團正式版"
```

接著到 https://github.com/new 建立一個新的（可以設成 Private）repository，照畫面指示把上面這個資料夾 push 上去，例如：

```bash
git remote add origin https://github.com/<你的帳號>/zhinangtuan.git
git branch -M main
git push -u origin main
```

## 第六步：用 Vercel 部署

1. 到 https://vercel.com ，用 GitHub 帳號登入。
2. 「Add New… → Project」，選你剛剛建立的 repository。
3. Framework Preset 選 **Other**（因為這是純靜態網站，不需要建置指令，Build Command 留空、Output Directory 留空或填 `.` 即可）。
4. 按「Deploy」，等大約 30 秒，就會拿到一個 `https://xxx.vercel.app` 的網址，這就是可以給全店員工用手機打開的網址。

之後你在 GitHub 上有新的 commit，Vercel 會自動重新部署，不用再手動操作。

## 第七步：加到手機主畫面（PWA）

- **Android（Chrome）**：打開網址後，瀏覽器選單會出現「加入主畫面」或「安裝應用程式」。
- **iPhone（Safari）**：打開網址 → 下方分享圖示 → 「加入主畫面」。

加入後會像原生 app 一樣有自己的圖示，全螢幕打開，且離線時也能打開畫面本身（資料要連線才能即時同步）。

---

## 管理後台怎麼用

- 一般員工：第一次打開會問名字，之後每次發問、交辦、回饋都會用這個名字（存在自己手機的瀏覽器裡，換手機要重新輸入）。
- 管理員（你）：按右上角「管理後台」，輸入 Email/密碼登入。第一次登入時，app 會自動把預設的分店／分類寫進 Firestore。
- 新增其他管理員：管理後台最下面「管理員帳號」可以直接加 Email；但對方要先請你在 Firebase Console → Authentication 幫他建立同一組 Email 的帳號，這是刻意設計的（避免任何人自己註冊變成管理員）。

## 跟原型（prototype.html）的差異

| 項目 | 原型 | 正式版 |
|---|---|---|
| 資料儲存 | Claude artifact 的 window.storage，每 30 秒輪詢 | Firebase Firestore，即時推播同步（`onSnapshot`），多人同時看到最新狀態 |
| 多人同時修改 | 最後寫入者覆蓋 | 用 Firestore transaction，降低互相覆蓋的機率 |
| 管理員登入 | 前端密碼雜湊比對，任何人看程式碼都能繞過 | 真正的 Firebase Auth 帳號密碼，權限檢查寫在伺服器端的安全性規則，前端沒有密碼可看 |
| 安裝到手機 | 沒有 | 有 manifest + Service Worker，可加到主畫面、離線也能打開畫面 |
| 匿名許願 | 前端不記錄作者 | 一樣不記錄作者；但因為用匿名登入寫入，Firebase 專案擁有者技術上還是能從登入紀錄反查裝置，這點跟大部分免費方案一樣是已知限制 |

## 還沒做、之後可以再加的

這些是 HANDOFF.md 提到、但這次先不做的，供你之後評估優先順序：

1. **每位員工都有真正帳號**：現在一般員工是「匿名登入 + 自己打的名字」，同名可以互相冒用。要做到每人一個帳號，需要幫每位員工在 Firebase 建帳號（或改用電話號碼登入），工程量不小，建議等團隊確定要正式導入後再做。
2. **新交辦／新回饋的推播通知**：需要另外設定 Firebase Cloud Messaging（FCM）的憑證、在 app 裡要求瀏覽器通知權限、以及一段「有新資料就發通知」的邏輯。現在的即時同步（打開 app 立刻看到最新狀態）已經比原本的 30 秒輪詢好很多，但沒有「主動推播」。
3. **「刪除只能管理員」**：HANDOFF 裡這項原本就寫「待決定」，目前維持跟原型一樣任何人都能刪除（有二次確認）。如果要改成只有管理員能刪，把 [firestore.rules](firestore.rules) 裡 `items` 的 `allow delete` 條件改成 `isAdmin()`，並把 [app.js](app.js) 對應按鈕的顯示邏輯加上 `isAdmin` 判斷即可，改動很小。
