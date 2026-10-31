import { PlaceRecordsService } from '../../core/services/place-records.service';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { LocationService } from '../../core/services/location.service';
import { sortPlacesByDistance } from '../../core/utils/place-distance';
import { combineLatest, of, Subscription } from 'rxjs';
import { Place, PlaceCategory } from '../../models/place.model';
import { PlaceMarkerService } from '../../core/services/place-marker.service';
import { PlaceService } from '../../core/services/place.service';

@Component({
  selector: 'app-place-list',
  templateUrl: './place-list.component.html',
  styleUrls: ['./place-list.component.scss']
})
export class PlaceListComponent implements OnInit, OnDestroy {
  revealedPlaceId: number | null = null;
  private readonly subscriptions = new Subscription();
  private gesture: {placeId:number; pointerId:number; x:number; y:number} | null = null;
  places: Place[] = [];
  selectedCategories: readonly PlaceCategory[] = [];
  selectedCounties: readonly string[] = [];
  private appliedSearchTerm = '';
  private suppressSelection = false;

  constructor(
    private placeService: PlaceService,
    private placeMarkerService: PlaceMarkerService,
    public records: PlaceRecordsService,
    private locationService?: LocationService
  ) {}

  ngOnInit(): void {
    this.subscriptions.add(combineLatest([
      this.placeService.getPlaces(),
      this.placeMarkerService.categoryFilter$,
      this.placeMarkerService.searchFilter$,
      this.placeMarkerService.countyFilter$,
      this.locationService?.currentLocation$ || of(null)
    ]).subscribe(([places, categories, searchTerm, counties, position]) => {
      const filtersChanged = searchTerm !== this.appliedSearchTerm
        || categories.length !== this.selectedCategories.length
        || categories.some((category, index) => category !== this.selectedCategories[index])
        || counties.length !== this.selectedCounties.length
        || counties.some((county, index) => county !== this.selectedCounties[index]);
      const categoryPlaces = categories.length === 0
        ? places
        : places.filter(place => categories.includes(place.category));
      // 先套用原有篩選，再依最新有效定位排序；IP 位置同樣適用但距離僅為推估。
      const sortedPlaces = sortPlacesByDistance(categoryPlaces
        .filter(place => counties.length === 0 || counties.includes(place.county))
        .filter(place => this.matchesSearch(place, searchTerm)), position);
      const orderChanged = sortedPlaces.length !== this.places.length
        || sortedPlaces.some((place, index) => place.id !== this.places[index].id);
      // GPS 常連續回報相近位置；順序沒變時保留左滑操作，避免編輯按鈕忽然消失。
      // 若篩選或順序真的改變，才取消舊手勢，防止列已移動卻在原座標誤觸。
      if (filtersChanged || orderChanged) {
        this.revealedPlaceId = null;
        this.gesture = null;
      }
      this.selectedCounties = counties;
      this.selectedCategories = categories;
      this.appliedSearchTerm = searchTerm;
      this.places = sortedPlaces;
    }));
    if (this.records) this.subscriptions.add(this.records.changes$.subscribe(() => {
      if (!this.records.visible) { this.revealedPlaceId = null; this.gesture = null; }
    }));
  }

  onRowPointerDown(place: Place, event: PointerEvent): void {
    this.gesture = null;
    this.suppressSelection = false;
    if (event.button !== 0 || event.isPrimary === false) return;
    if (this.revealedPlaceId !== place.id) this.revealedPlaceId = null;
    this.gesture = {placeId:place.id, pointerId:event.pointerId, x:event.clientX, y:event.clientY};
  }

  onRowPointerUp(place: Place, event: PointerEvent): void {
    const start = this.gesture;
    this.gesture = null;
    // 必須是同一筆資料與同一支指標，避免多指或跨列放開誤觸。
    if (!start || start.placeId !== place.id || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    this.suppressSelection = Math.abs(dx) > 10 || Math.abs(dy) > 10;
    if (!this.records.visible) return;
    // 保留瀏覽器原生垂直捲動：至少橫移 48px，且垂直位移不得超過水平的 65%。
    if (Math.abs(dx) < 48 || Math.abs(dy) > Math.abs(dx) * 0.65) return;
    this.revealedPlaceId = dx < 0 ? place.id : null;
  }

  cancelRowGesture(): void { this.gesture = null; this.suppressSelection = true; }

  selectPlace(place: Place, event: MouseEvent): void {
    // 手勢結束後瀏覽器仍可能送出 click；左右滑及上下捲動不能誤當點選。
    if (event.detail !== 0 && this.suppressSelection) { this.suppressSelection = false; return; }
    if (this.revealedPlaceId !== null) { this.revealedPlaceId = null; return; }
    this.placeMarkerService.selectPlace(place);
  }

  onRowKeydown(place: Place, event: KeyboardEvent): void {
    // 編輯按鈕內的按鍵不再交給資料列處理，避免子控制項的鍵盤操作被攔截。
    if (!this.records.visible || event.target !== event.currentTarget) return;
    if (!['ArrowLeft', 'ArrowRight', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    this.revealedPlaceId = event.key === 'ArrowLeft' ? place.id : null;
  }

  revealEdit(place: Place, row?: HTMLElement): void {
    if (!this.records.visible) return;
    this.revealedPlaceId = place.id;
    // 螢幕閱讀器無法用方向滑動觸發；其替代按鈕啟動後，等 Angular 畫出編輯鈕再移入焦點。
    if (row) requestAnimationFrame(() => row.querySelector<HTMLButtonElement>('.edit-record')?.focus());
  }

  editPlace(place: Place, row?: HTMLElement): void {
    if (!this.records.visible || this.revealedPlaceId !== place.id) return;
    // 編輯鈕稍後會被移除，先讓視窗記住穩定的資料列，關閉時才能返回焦點。
    row?.focus();
    this.revealedPlaceId = null;
    this.records.open(place);
  }

  personalSummary(id: number): string {
    if (!this.records.visible) return '';
    const record = this.records.record(id);
    const parts: string[] = [];
    if (record.rating !== null) parts.push('★ ' + record.rating + '/5');
    // false 是明確的「沒去過」，只有 null 才代表尚未填寫而隱藏。
    if (record.visited !== null) parts.push(record.visited ? '去過' : '沒去過');
    return parts.join(' · ');
  }

  ngOnDestroy(): void { this.subscriptions.unsubscribe(); }

  private matchesSearch(place: Place, searchTerm: string): boolean {
    if (!searchTerm) {
      return true;
    }

    const searchableText = [
      place.name,
      place.county,
      place.district,
      place.address,
      place.description,
      ...(place.tags || [])
    ].filter(Boolean).join(' ').toLocaleLowerCase();

    return searchableText.includes(searchTerm);
  }
}