// 把 Firebase 專案設定貼在這裡。
// 到 Firebase Console →（左上角齒輪）專案設定 → 一般 → 你的應用程式 → SDK 設定與設定
// 選「設定」，把整段 firebaseConfig 物件複製貼過來取代下面這個。
// 這組設定不是密碼，可以放心公開在前端程式碼裡；真正的安全防護是 Firestore 的「安全性規則」（firestore.rules）。
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCPIFUf2LsOYpLlO3chUOPhQPfJLGC7aRg",
  authDomain: "wpcno1.firebaseapp.com",
  projectId: "wpcno1",
  storageBucket: "wpcno1.firebasestorage.app",
  messagingSenderId: "280379148520",
  appId: "1:280379148520:web:10b23a9befa4db9a5c615d"
};

// 允許使用管理後台的 Email（第一個管理員，之後可以在管理後台裡新增其他管理員）。
window.BOOTSTRAP_ADMIN_EMAILS = ["trista810729@gmail.com"];
