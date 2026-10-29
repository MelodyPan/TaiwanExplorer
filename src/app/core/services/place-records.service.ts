import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Place, PlaceCategory } from '../../models/place.model';
// null 表示未設定；類別的 null 代表沿用公開分類，不是新的分類。
export interface PersonalRecord { category: PlaceCategory | null; rating: number | null; visited: boolean | null; parking: boolean | null; seasonal: boolean | null; seasonalNote: string; }
export const emptyRecord = (): PersonalRecord => ({category:null,rating:null,visited:null,parking:null,seasonal:null,seasonalNote:''});
@Injectable({providedIn:'root'})
export class PlaceRecordsService {
  readonly selected$ = new BehaviorSubject<Place | null>(null);
  readonly changes$ = new BehaviorSubject<number>(0);
  readonly session: any;
  editorAccountId: string | null = null;
  private token = '';
  private expires = 0;
  // 與 Home 共用流程的 JS 模組依 angular.json 的 scripts 順序先載入，再由 Angular 橋接。
  private readonly modules = window as any;
  private readonly login: any;
  private readonly store: any;
  constructor(private zone: NgZone) {
    this.login = this.modules.RecordLogin.createLoginCache({storage:sessionStorage,clientId:this.modules.RecordConfig.googleClientId});
    this.store = this.modules.RecordDrive.createDriveStore({token:()=>Date.now()<this.expires?this.token:''});
    // 新 token 不足以證明帳號相同；必須向 Drive 查證，保護尚未提交的編輯表單。
    const identify = this.store.account.bind(this.store);
    this.store.account = async () => {
      const account = await identify();
      if (this.editorAccountId && account.id !== this.editorAccountId) throw Object.assign(new Error('尚有原帳號的地點表單，請重新連接原本的 Google 帳號。'),{code:'account'});
      return account;
    };
    this.session = this.modules.RecordCloud.createCloudSession({store:this.store,authorize:(options:any)=>this.authorize(options),clearAuthorization:()=>this.clearAuthorization(),onChange:()=>this.zone.run(()=>this.changes$.next(this.changes$.value+1))});
    this.session.setOnline(navigator.onLine);
    window.addEventListener('online',()=>{this.session.setOnline(true);this.session.refresh();});
    window.addEventListener('offline',()=>this.session.setOnline(false));
    window.addEventListener('focus',()=>this.session.refresh());
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.session.refresh();});
    window.addEventListener('beforeunload',(event)=>{if(this.session.hasUnsaved){event.preventDefault();event.returnValue='';}});
    // 效期檢查放在 Angular 外，避免每秒重繪整頁；真正到期時才回到變更偵測。
    this.zone.runOutsideAngular(()=>setInterval(()=>{if(this.token&&Date.now()>=this.expires)this.zone.run(()=>{this.clearAuthorization();this.changes$.next(this.changes$.value+1);});},1000));
    if(this.login.read())this.session.connect({resume:true});
  }
  get state(): any { return this.session.state; }
  get canEdit(): boolean { return Date.now()<this.expires&&this.state.online&&this.state.phase==='ready'; }
  // 重新授權尚未確認身分、到期或錯帳號時，不顯示記憶體中的私人紀錄。
  get visible(): boolean { return this.state.phase!=='connecting'&&!!this.token&&Date.now()<this.expires&&!!this.state.account&&this.state.error?.code!=='account'; }
  get status(): string {
    if(this.state.error)return this.state.error.message;
    if(!this.state.online)return '目前離線，連線後可繼續同步';
    if(!this.token&&!['connecting','loading'].includes(this.state.phase))return '連接 Google Drive，跨裝置維護私人紀錄';
    const labels: any={connecting:'等待 Google 授權…',loading:'正在讀取地點紀錄…',saving:'正在儲存…',ready:'已同步到私人 Google Drive',empty:'尚無地點紀錄，請建立',choosing:'請選擇地點紀錄',disconnected:'尚未連接'};
    return labels[this.state.phase]||'請重新連接 Google Drive';
  }
  open(place: Place): void { this.zone.run(()=>this.selected$.next(place)); }
  // 舊版檔案沒有 category，以預設值補齊即可；不能因此拒絕載入既有星等等紀錄。
  record(id: number): PersonalRecord { return this.visible ? {...emptyRecord(),...(this.state.draft||this.state.document)?.records?.[id]} : emptyRecord(); }
  connect(): void { if(this.state.phase==='connecting'){this.modules.RecordAuth.cancel();return;}this.session.connect(); }
  create(): void { this.session.create(this.modules.RecordFile.createDataFile()); }
  async save(id: number, record: PersonalRecord, expected?: PersonalRecord): Promise<boolean> {
    if(!this.canEdit)return false;
    // 背景同步可能已取得新版本；另比對表單基準，避免舊表單配上新 revision 覆寫資料。
    if(expected && (Object.keys(emptyRecord()) as (keyof PersonalRecord)[]).some(key=>this.record(id)[key]!==expected[key]))throw new Error('此地點已在另一台裝置更新。請先保留草稿，再按「重新載入此地點」查看最新紀錄。');
    // 季節說明只對「限定」有效，切回否／未設定時一起清除，避免隱藏的舊文字殘留。
    const records={...this.state.document.records,[id]:{...record,seasonalNote:record.seasonal===true?record.seasonalNote.trim():''}};
    await this.session.save(this.modules.RecordFile.createDataFile(records));
    return this.state.phase==='ready'&&!this.session.hasUnsaved;
  }
  async disconnect(): Promise<void> {try{await this.session.disconnect();this.selected$.next(null);}catch(error:any){alert(error.message);}}
  backup(overrides: Record<number,PersonalRecord> = {}): void {
    const source=this.state.draft||this.state.document;if(!source)return;
    // 合併各筆尚未提交的表單後下載；不把草稿偷偷存進 localStorage。
    const data=this.modules.RecordFile.createDataFile({...source.records,...overrides});
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='taiwan-place-records-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  private clearAuthorization(): void {this.token='';this.expires=0;this.login.clear();}
  private async authorize({resume=false}:any): Promise<void> {
    if(resume){const saved=this.login.read();if(!saved)throw new Error('登入已到期，請重新連接。');this.token=saved.token;this.expires=saved.expires;return;}
    const response=await this.modules.RecordAuth.requestToken('select_account');
    // 只依 Google 真正回傳的秒數計算期限；不能自行延長或猜固定有效時間。
    const details=this.modules.RecordLogin.tokenDetails(response);
    if(!details)throw new Error('Google 未回傳有效授權期限，請重新連接。');
    this.token=response.access_token;this.expires=details.receivedAt+details.expiresIn*1000;this.login.save(this.token,this.expires,undefined,details);
  }
}
