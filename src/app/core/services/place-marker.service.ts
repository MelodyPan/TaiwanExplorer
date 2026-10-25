import { Injectable } from '@angular/core';
import * as L from 'leaflet';
import { BehaviorSubject } from 'rxjs';
import { Place, PlaceCategory } from '../../models/place.model';
import { PlaceService } from './place.service';

@Injectable({
  providedIn: 'root'
})
export class PlaceMarkerService {
  private markers: L.Marker[] = [];
  private map?: L.Map;
  private selectedCategory = 'ALL';
  private searchTerm = '';
  private selectedCounties: string[] = [];
  private readonly countyFilterSubject = new BehaviorSubject<readonly string[]>([]);
  readonly countyFilter$ = this.countyFilterSubject.asObservable();
  private readonly categoryFilterSubject = new BehaviorSubject<string>('ALL');
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

    return L.marker([place.latitude, place.longitude], { icon });
  }

  constructor(private placeService: PlaceService) {}

  setCategoryFilter(category: string): void {
    this.selectedCategory = category;
    this.categoryFilterSubject.next(category);
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

  loadMarkers(map: L.Map, ignoreZoomLevel = false): void {
    this.map = map;
    if (!ignoreZoomLevel && map.getZoom() < 8) {
      this.clearMarkers();
      return;
    }

    this.placeService.getPlaces().subscribe(places => {
      this.clearMarkers();
      const bounds = map.getBounds();
      this.markers = places
        .filter(place => this.selectedCategory === 'ALL' || place.category === this.selectedCategory)
        .filter(place => this.selectedCounties.length === 0 || this.selectedCounties.includes(place.county))
        .filter(place => this.matchesSearch(place))
        .filter(place => bounds.contains([place.latitude, place.longitude]))
        .map(place => this.createMarker(place).addTo(map));
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
    for (const marker of this.markers) {
      marker.remove();
    }
    this.markers = [];
  }
}