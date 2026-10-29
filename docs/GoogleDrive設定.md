# Google Drive 設定與同步規則

[返回文件總覽](README.md)

## 設定方式

本專案沿用 Home bookmarks 的 Google OAuth Web Client ID，設定在 src/assets/records/config.js。它是可公開的 Client ID，不是 Client Secret 或使用者存取憑證。

1. 在該 Google Cloud 專案啟用 Google Drive API。
2. 設定 OAuth 同意畫面；若仍在測試模式，將實際登入帳號加入測試使用者。
3. 在 Web Client 的 Authorized JavaScript origins 加入實際來源。線上為 https://melodypan.github.io；本機依啟動方式加入例如 http://localhost:4200 或 http://127.0.0.1:4173。
4. 來源包含協定、主機及必要的連接埠，不包含 /TaiwanExplorer/ 路徑。localhost 與 127.0.0.1 是不同來源，不能互相替代。
5. 開啟網站，點「連接 Google Drive」，允許 drive.file 範圍；首次再按「建立我的地點紀錄」。

不需要服務帳號、Client Secret、Cloud Storage bucket 或公開分享資料夾。不要將存取 token、私人備份或金鑰提交到 Git。

## 資料隔離

私人資料夾名稱為 TaiwanExplorer，應用程式 purpose 為 melody-taiwan-records-v1。它們與 bookmarks 的儲存標記不同；即使共用 OAuth Client，也不會讀寫書籤文件。

檔名依 Asia/Taipei 日期產生 place-records-YYYY-MM-DD.json。同日修改更新同一檔，跨日有修改才建立新的每日檔；只登入或讀取不會每天新增空白文件。

資料內容及未同步草稿在分頁記憶體，沒有存入 localStorage。授權相關資料僅存目前分頁的 sessionStorage，使用獨立 key；有效期限依 Google 實際回傳的 expires_in，不猜固定一小時，也不因使用者操作而自行延長。

## 寫入與版本規則

| 規則 | 原因 |
| --- | --- |
| 先以 Drive 帳號資訊確認身分 | 新 token 不代表仍是原帳號，不能把舊草稿寫到別人的資料集 |
| 資料夾須符合名稱、標記、類型與私人條件 | 同名資料夾可能已分享，不能只憑名稱存入 |
| 版本識別為 fileId 加 commit | 同日檔案 ID 不變，僅比較 ID 會漏掉其他裝置的更新 |
| 寫入帶 If-Match 與一致的 ETag | 雲端內容已改變時必須報衝突，不可強制覆蓋 |
| v3 讀不到 ETag 時用 v2 JSON 備援 | ETag 與寫入必須使用同一 API 版本，不能拿新 ETag 配舊內容 |
| v2 仍無有效 ETag 即停止 | 不能為了存檔成功而移除版本保護 |
| 跨日先在舊版本預約新檔 ID | 避免兩台裝置同時建立兩份當日檔 |
| 回應遺失時保留原操作與檔案 ID | 重試先確認原操作，不重複建立或任意替換草稿 |
| 上傳後再次確認雲端最新版本 | 僅收到上傳回應還不足以宣告同步完成 |

同步核心有約 600 毫秒的防抖與序列佇列；畫面採明確按「儲存」才提交。文件的 updatedAt 不算內容異動，避免只變時間就重傳。

## 常見問題

- 登入視窗被阻擋或取消：再次點連接；若仍在等待，可按「取消登入」。
- iPhone 從外部驗證頁返回卻沒有回應：程式會保留 1.5 秒等待正常回呼，再解除這次等待。這是恢復策略，不等於能確認外部視窗已關閉。
- 授權等待超過 5 分鐘：結束此次要求後重新登入。這個 5 分鐘只限制彈窗等待，不是 token 有效期限。
- Google 回報來源不符：核對 Client ID、實際網址來源、連接埠及 OAuth origins。
- API 未啟用、範圍不足、權限拒絕或空間額度不足：依畫面訊息修正設定；不要用公開資料夾來繞過私人存取要求。
- 有多份資料集：由使用者選擇，不會任意挑一份覆寫。
- 版本衝突或找不到祖先檔：先備份，確認原帳號及 Drive 垃圾桶，不自動建立空資料覆蓋。
- 授權到期：重新連回原帳號；私人紀錄暫時隱藏，公開地圖仍可瀏覽。

模擬測試無法證明真實 Google 專案設定、帳號政策或 iPhone 彈窗行為。正式使用時仍須用實際帳號驗收登入、跨裝置存檔與衝突處理。
