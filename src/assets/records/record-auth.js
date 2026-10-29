(function(root){
 const config=root.RecordConfig;let pendingAuthorization=null;
   function requestToken(prompt){
   if(!config.googleClientId)return Promise.reject(new Error('請先設定 Google OAuth Client ID，設定方式見專案的 Google Drive 操作說明。'));
   if(!globalThis.google?.accounts?.oauth2)return Promise.reject(new Error('Google 登入元件尚未載入，請檢查網路或阻擋設定後重試。'));
   return new Promise((resolve,reject)=>{
    let settled=false,leftPage=false,returnTimer,timeout;
    // 無論成功、拒絕、取消或逾時，統一清理；避免上一輪監聽影響下一次登入。
    const cleanup=()=>{clearTimeout(returnTimer);clearTimeout(timeout);window.removeEventListener('blur',leave);window.removeEventListener('focus',returned);window.removeEventListener('pageshow',returned);document.removeEventListener('visibilitychange',visibility);};
    // 一次要求只能完成一次；取消後遲到的 callback 不可把舊 token 當成新登入。
    const finish=(error,response)=>{if(settled)return;settled=true;cleanup();if(pendingAuthorization===attempt)pendingAuthorization=null;if(error)reject(error);else resolve(response);};
    const attempt={cancel:()=>finish(new Error('已取消 Google 登入，可以再次連接 Google Drive。'))};
    const leave=()=>{leftPage=true;clearTimeout(returnTimer);};
    // iPhone 外部驗證頁可能沒有回報關閉；回頁後留 1.5 秒接正常回應，再解除等待。
    // 這是恢復策略，不代表確認 popup 已關閉；使用者主動切回也可能取消當次要求。
    const returned=()=>{if(!leftPage||document.hidden||settled)return;clearTimeout(returnTimer);returnTimer=setTimeout(attempt.cancel,1500);};
    const visibility=()=>{if(document.hidden)leave();else returned();};
    pendingAuthorization=attempt;
    window.addEventListener('blur',leave);window.addEventListener('focus',returned);window.addEventListener('pageshow',returned);document.addEventListener('visibilitychange',visibility);
    // 限制的是登入要求等待時間，不是登入成功後的 Google token 使用效期。
    timeout=setTimeout(()=>finish(new Error('Google 登入尚未完成，請再試一次。')),5*60*1000);
    try{
     const client=google.accounts.oauth2.initTokenClient({client_id:config.googleClientId,scope:'https://www.googleapis.com/auth/drive.file',callback:response=>{
      if(settled)return;
      if(response.error||!response.access_token){finish(new Error('Google 授權未完成，請重新連接。'));return;}
      if(!google.accounts.oauth2.hasGrantedAllScopes(response,'https://www.googleapis.com/auth/drive.file')){finish(new Error('需要允許網站存取它建立的 Drive 地點紀錄檔案。'));return;}
      finish(null,response);
     },error_callback:()=>finish(new Error('Google 登入視窗已關閉或被阻擋，請再試一次。'))});
     client.requestAccessToken({prompt});
    }catch(error){finish(error);}
   });
  }

 root.RecordAuth={requestToken,cancel(){pendingAuthorization?.cancel();}};
})(globalThis);
