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
      // Account verification precedes document loading. Populate a clean editor
      // only when the document is ready; never replace an in-progress form.
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
    this.records.editorAccountId = this.hasUnsavedForms ? this.accountId : null;
    this.records.connect();
  }
  async disconnect(): Promise<void> {
    if (this.hasUnsavedForms && !confirm('還有未儲存的地點表單。請先儲存或下載備份；確定放棄這些表單並登出？')) return;
    await this.records.disconnect();
  }
  async save(): Promise<void> {
    if (!this.place) return;
    const id = this.place.id, submitted = {...this.form}, baseline = {...this.baseline};
    this.message = '';
    try {
      if (await this.records.save(id, submitted, baseline)) {
        const draft = this.drafts.get(id);
        if (!draft || !this.differs(draft.record, submitted)) this.drafts.delete(id);
        // The user may have closed A and opened B while A was uploading.
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
    if (this.hasUnsavedForms) { event.preventDefault(); event.returnValue = ''; }
  }
  resolve(id: string): void {
    if (confirm('確認採用這個版本？若需保留目前草稿，請先下載備份。')) this.records.session.resolve(id);
  }
  ngOnDestroy(): void { this.subscriptions.unsubscribe(); }
}
