import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { Place } from '../../models/place.model';
import { emptyRecord, PersonalRecord, PlaceRecordsService } from '../../core/services/place-records.service';
interface RecordDialog extends HTMLElement { open: boolean; showModal(): void; close(): void; }
interface EditorDraft { record: PersonalRecord; baseline: PersonalRecord; }
@Component({selector:'app-place-records',templateUrl:'./place-records.component.html',styleUrls:['./place-records.component.scss']})
export class PlaceRecordsComponent implements AfterViewInit, OnDestroy {
  @ViewChild('editor') editor!: ElementRef<RecordDialog>;
  place: Place | null = null;
  form = emptyRecord();
  stars = [1,2,3,4,5];
  categories = [
    {value:'ATTRACTION',label:'景點'}, {value:'FOOD',label:'美食'},
    {value:'CAFE',label:'咖啡'}, {value:'HOTEL',label:'住宿'},
    {value:'CULTURE',label:'文化'}, {value:'NATURE',label:'自然'}
  ];
  message = '';
  private subscriptions = new Subscription();
  private drafts = new Map<number,EditorDraft>();
  private baseline = emptyRecord();
  private accountId: string | null = null;
  constructor(public records: PlaceRecordsService) {}

  ngAfterViewInit(): void {
    this.subscriptions.add(this.records.selected$.subscribe(place => {
      if (!place) return;
      this.remember();
      this.place = place;
      const draft = this.drafts.get(place.id);
      this.form = {...(draft?.record || this.records.record(place.id))};
      this.baseline = {...(draft?.baseline || this.records.record(place.id))};
      this.message = '';
      if (!this.editor.nativeElement.open) this.editor.nativeElement.showModal();
    }));
    this.subscriptions.add(this.records.changes$.subscribe(() => {
      const id = this.records.state.account?.id || null;
      if (id !== this.accountId) {
        this.drafts.clear();
        this.form = this.place ? this.records.record(this.place.id) : emptyRecord();
        this.baseline = {...this.form};
        this.accountId = id;
      }
      // 帳號確認早於文件載入；等文件 ready 才填入乾淨表單，避免登入後顯示空值。
      // 已編輯的表單或留存草稿不可被背景刷新覆蓋。
      if (this.records.canEdit && this.place && !this.drafts.has(this.place.id) && !this.differs(this.form, this.baseline)) {
        this.form = this.records.record(this.place.id);
        this.baseline = {...this.form};
      }
    }));
  }

  private normalized(record: PersonalRecord): PersonalRecord {
    return {...record, seasonalNote: record.seasonal === true ? record.seasonalNote : ''};
  }
  private differs(a: PersonalRecord, b: PersonalRecord): boolean {
    const left = this.normalized(a), right = this.normalized(b);
    return (Object.keys(emptyRecord()) as (keyof PersonalRecord)[]).some(key => left[key] !== right[key]);
  }
  private remember(): void {
    if (!this.place || !this.accountId) return;
    if (this.differs(this.form, this.baseline)) this.drafts.set(this.place.id, {record:this.normalized(this.form),baseline:{...this.baseline}});
    else this.drafts.delete(this.place.id);
  }
  private get hasUnsavedForms(): boolean { this.remember(); return this.drafts.size > 0; }

  close(): void { this.remember(); this.editor.nativeElement.close(); }
  connect(): void {
    // 同步核心只知道已提交草稿；未提交表單也要綁定原帳號，防止重新登入時遺失。
    this.records.editorAccountId = this.hasUnsavedForms ? this.accountId : null;
    this.records.connect();
  }
  async disconnect(): Promise<void> {
    if (this.hasUnsavedForms && !confirm('還有未儲存的地點表單。請先儲存或下載備份；確定放棄這些表單並登出？')) return;
    await this.records.disconnect();
  }
  async save(): Promise<void> {
    if (!this.place) return;
    // await 前保存地點與快照；完成時目前視窗可能已切換到另一筆資料。
    const id = this.place.id, submitted = {...this.form}, baseline = {...this.baseline};
    this.message = '';
    try {
      if (await this.records.save(id, submitted, baseline)) {
        const draft = this.drafts.get(id);
        if (!draft || !this.differs(draft.record, submitted)) this.drafts.delete(id);
        // A 上傳期間可能已關閉並開啟 B；完成後只能修改原提交的 A，不能清掉 B 的草稿。
        if (this.place?.id === id && !this.differs(this.form, submitted)) {
          this.baseline = {...this.records.record(id)};
          this.form = {...this.baseline};
          this.message = '已儲存到 Google Drive';
        }
      }
    } catch (error: any) { if (this.place?.id === id) this.message = error.message; }
  }
  reload(): void {
    if (!this.place || !confirm('重新載入會取代此地點目前的表單，是否繼續？')) return;
    this.drafts.delete(this.place.id);
    this.form = this.records.record(this.place.id);
    this.baseline = {...this.form};
    this.message = '已重新載入';
  }
  backup(): void {
    this.remember();
    const overrides: Record<number,PersonalRecord> = {};
    this.drafts.forEach((draft,id) => overrides[id] = draft.record);
    this.records.backup(overrides);
  }
  @HostListener('window:beforeunload',['$event'])
  warnUnsaved(event: BeforeUnloadEvent): void {
    // 表單未按儲存時還不在雲端佇列，離開提醒仍須涵蓋這些記憶體草稿。
    if (this.hasUnsavedForms) { event.preventDefault(); event.returnValue = ''; }
  }
  resolve(id: string): void {
    if (confirm('確認採用這個版本？若需保留目前草稿，請先下載備份。')) this.records.session.resolve(id);
  }
  ngOnDestroy(): void { this.subscriptions.unsubscribe(); }
}
