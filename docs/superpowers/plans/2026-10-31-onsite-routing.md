# 站內免費路線規劃實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 點清單可在本站定位景點，並免費計算開車、一般機車及步行的路線、時間和距離。
**Architecture:** Leaflet 維持原地圖；PlaceMarkerService 發送選取與規劃事件，TaiwanMapComponent 管理路線狀態。RoutingService 透過 HttpClient 呼叫 Valhalla，純函式驗證請求及結果。
**Tech Stack:** Angular 14、RxJS 6.6、Leaflet；不新增套件。
**Spec:** ../specs/2026-10-31-onsite-routing-design.md

## Global Constraints
中文介面與註解。免費、不需要金鑰。三種交通方式獨立計算。保留左滑編輯。
不可提交原本 package.json 與 package-lock.json 的異動。

## Review Focus
- 快速切換目的地或模式：取消舊請求，避免舊結果覆寫。
- 定位失敗或 IP 定位：不得冒用車站，IP 明確標示推估。
- 滑動與取消事件：不誤觸地圖選取。
- 不完整或無效服務回覆：顯示錯誤並移除舊線。
- 小螢幕與鍵盤：路線面板不遮蓋地圖，原編輯操作仍可使用。

### Task 1: 路線請求與結果
**Files:** 新增 src/app/core/services/routing.service.ts、src/app/core/utils/route.ts；測試 tests/routing.test.cjs。
**Interfaces:** RouteMode = driving | scooter | walking；RouteResult 包含 coordinates（Leaflet 緯經度）、distanceMeters、durationSeconds。RoutingService.route(origin,destination,mode) 回傳 Observable<RouteResult>。
- [x] 先寫失敗測試並執行，涵蓋三種模式、無效座標、GeoJSON 經緯度交換及無效回覆。
- [x] 實作純函式與具 20 秒逾時、1.1 秒間距、5 分鐘快取（最多 20 筆）的服務。
- [x] 執行測試，預期全部通過。

### Task 2: 清單與站內路線介面
**Files:** 修改 place-list 元件、place-marker.service.ts、place-popup-content.ts、taiwan-map 元件與 app.component.scss。
**Interfaces:** PlaceMarkerService.placeSelected$、routeRequested$；selectPlace(place)、requestRoute(place)、focusPlace(place)。
- [x] 先新增清單點擊、滑動不導航、選取置中及路線取消的失敗測試。
- [x] 實作原生地點按鈕及選取事件；地圖捲入視野，選取景點置中開啟資訊。
- [x] 加入路線面板、三種模式、結果、錯誤、重試與清除；非同步結果僅能修改目前選擇。
- [x] 執行 node --test tests/*.test.cjs，預期全通過。

### Task 3: 文件與驗證
- [x] 更新 docs/使用指南.md、docs/開發維護說明.md。
- [x] 執行 npm run build -- --base-href /TaiwanExplorer/，預期成功。
- [x] 以公開景點座標查詢三種模式並確認 CORS；行動版實際點選驗證未能執行，因 CUA 沒有可用瀏覽器。此限制保留供後續人工驗收。
- [x] 依既有授權提交與推送來源；維運方請公開應用告知用途，對外發文需另行授權，不自動代發。

## 執行紀錄
使用者選擇免費方案，沿用此會話直接實作與既有提交流程。只修改本功能相關檔案。

完成紀錄：81 項 Node 測試通過；正式路徑建置通過，Hash 09da1fb8e5718ea1。三種實際端點查詢通過，預檢回覆 204 且允許 X-Client-Id。既有 npm test 的 TS18003 未修改。獨立程式審查未發現重要缺陷；無可用瀏覽器，手機點選驗收未執行。

Ruling：保留既有 main 分支的連續網站更新流程，只提交本功能檔案；不混入原本的兩份套件異動。維運方用途通知屬對外發文，不在本次授權內，不自動發送。
