import { PlaceRecordsService } from './place-records.service';
import { Injectable } from '@angular/core';
import * as L from 'leaflet';
import { BehaviorSubject, Subject, Subscription } from 'rxjs';
import { Place, PlaceCategory } from '../../models/place.model';
import { PlaceService } from './place.service';
import { createPlacePopupContent } from './place-popup-content';

@Injectable({
  providedIn: 'root'
})
export class PlaceMarkerService {
  private readonly placeSelectedSubject = new Subject<Place>();
  private readonly routeRequestedSubject = new Subject<Place>();
  readonly placeSelected$ = this.placeSelectedSubject.asObservable();
  readonly routeRequested$ = this.routeRequestedSubject.asObservable();
  selectPlace(place: Place): void { this.placeSelectedSubject.next(place); }
  requestRoute(place: Place): void { this.routeRequestedSubject.next(place); }

  focusPlace(place: Place): void {
    if (!this.map) return;
    // 禁用平移動畫，避免載入標記時讀到動畫前的舊邊界；zoomend 後再開啟指定彈窗。
    this.map.setView([place.latitude, place.longitude], 15, {animate: false});
    this.loadMarkers(this.map, true, place.id);
  }

  private markers: L.Marker[] = [];
  private markerSubscription?: Subscription;
  private map?: L.Map;
  private selectedCategories: PlaceCategory[] = [];
  private searchTerm = '';
  private selectedCounties: string[] = [];
  private readonly countyFilterSubject = new BehaviorSubject<readonly string[]>([]);
  readonly countyFilter$ = this.countyFilterSubject.asObservable();
  private readonly categoryFilterSubject = new BehaviorSubject<readonly PlaceCategory[]>([]);
  private readonly searchFilterSubject = new BehaviorSubject<string>('');
  readonly categoryFilter$ = this.categoryFilterSubject.asObservable();
  readonly searchFilter$ = this.searchFilterSubject.asObservable();

  private categoryIcons: { [key in PlaceCategory]: string } = {
    ATTRACTION: '🏞',
    FOOD: '🍜',
    CAFE: '☕',
    HOTEL: '🏨',
    CULTURE: '🏛',
    NATURE: '🌲',
  };

  getIcon(category: PlaceCategory): string {
    return this.categoryIcons[category] || '';
  }

  createMarker(place: Place): L.Marker {
    const icon = L.divIcon({
      className: 'place-marker',
      html: this.getIcon(place.category),
      iconSize: [30, 30],
      iconAnchor: [15, 30],
    });

    const marker = L.marker([place.latitude, place.longitude], {
      icon,
      title: place.name,
      alt: place.name
    }).bindPopup(createPlacePopupContent(place), {
      className: 'place-details-popup',
      minWidth: 220,
      maxWidth: 300,
      maxHeight: 320,
      autoPanPadding: L.point(16, 16)
    });
    marker.on('popupopen', () => {
      const element = marker.getPopup()?.getElement();
      const routeButton = element?.querySelector<HTMLButtonElement>('.place-info__route');
      if (routeButton) routeButton.onclick = () => this.requestRoute(place);
      const recordButton = element?.querySelector<HTMLButtonElement>('.place-info__record');
      if (recordButton && this.records) recordButton.onclick = () => this.records.open(place);
    });
    return marker;
  }

  constructor(private placeService: PlaceService, private records: PlaceRecordsService) {}

  setCategoryFilter(categories: readonly PlaceCategory[]): void {
    this.selectedCategories = [...categories];
    this.categoryFilterSubject.next([...this.selectedCategories]);
    if (this.map) {
      this.loadMarkers(this.map, true);
    }
  }

  setCountyFilter(counties: readonly string[]): void {
    this.selectedCounties = [...counties];
    this.countyFilterSubject.next([...this.selectedCounties]);
    if (this.map) {
      this.loadMarkers(this.map, true);
    }
  }

  setSearchFilter(searchTerm: string): void {
    this.searchTerm = searchTerm.trim().toLocaleLowerCase();
    this.searchFilterSubject.next(this.searchTerm);
    if (this.map) {
      this.loadMarkers(this.map, true);
    }
  }

  loadMarkers(map: L.Map, ignoreZoomLevel = false, openPlaceId?: number): void {
    // 資料流會隨私人類別變動而持續發值；每次平移／重載只能保留一組訂閱。
    this.markerSubscription?.unsubscribe();
    this.map = map;
    if (!ignoreZoomLevel && map.getZoom() < 8) {
      this.clearMarkers();
      return;
    }

    this.markerSubscription = this.placeService.getPlaces().subscribe(places => {
      // 回呼內只移除舊圖示，不能呼叫會取消目前訂閱的 clearMarkers。
      this.removeMarkers();
      const bounds = map.getBounds();
      this.markers = places
        .filter(place => this.selectedCategories.length === 0 || this.selectedCategories.includes(place.category))
        .filter(place => this.selectedCounties.length === 0 || this.selectedCounties.includes(place.county))
        .filter(place => this.matchesSearch(place))
        .filter(place => bounds.contains([place.latitude, place.longitude]))
        .map(place => {
          const marker = this.createMarker(place).addTo(map);
          if (place.id === openPlaceId) marker.openPopup();
          return marker;
        });
      // 只在本次選取時開啟，不因背景私人類別更新反覆重開彈窗。
      openPlaceId = undefined;
    });
  }

  private matchesSearch(place: Place): boolean {
    if (!this.searchTerm) {
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

    return searchableText.includes(this.searchTerm);
  }

  clearMarkers(): void {
    this.markerSubscription?.unsubscribe();
    this.removeMarkers();
  }

  private removeMarkers(): void {
    for (const marker of this.markers) {
      marker.remove();
    }
    this.markers = [];
  }
}