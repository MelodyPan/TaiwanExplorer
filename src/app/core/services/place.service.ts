import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { combineLatest, Observable } from 'rxjs';
import { distinctUntilChanged, map, shareReplay } from 'rxjs/operators';
import { Place, PlaceCategory } from '../../models/place.model';
import { PlaceRecordsService } from './place-records.service';

@Injectable({providedIn: 'root'})
export class PlaceService {
  private readonly places$: Observable<Place[]>;

  constructor(http: HttpClient, records: PlaceRecordsService) {
    // 只快取公開景點，供地圖與清單共用；私人資料不可寫回這份來源。
    const publicPlaces$ = http.get<Place[]>('assets/data/places.json').pipe(shareReplay(1));
    this.places$ = combineLatest([publicPlaces$, records.changes$]).pipe(
      map(([places]) => places.map(place => {
        // null 或登出都使用公開類別；建立副本，才能在清除覆寫後還原。
        const category = records.record(place.id).category;
        return category && category !== place.category ? {...place, category} : place;
      })),
      // 授權、讀取與儲存狀態也會發通知；分類未變時不重畫，避免地圖閃動。
      // 公開來源只載入一次，其餘欄位不變，因此以原物件或 id／類別比較即可。
      distinctUntilChanged((a, b) => a.length === b.length && a.every((place, i) =>
        place === b[i] || place.id === b[i].id && place.category === b[i].category)),
      shareReplay({bufferSize: 1, refCount: true})
    );
  }

  getPlaces(): Observable<Place[]> { return this.places$; }

  getPlacesByCounty(county: string): Observable<Place[]> {
    return this.getPlaces().pipe(map(places => places.filter(place => place.county === county)));
  }

  getPlacesByCategory(category: PlaceCategory): Observable<Place[]> {
    return this.getPlaces().pipe(map(places => places.filter(place => place.category === category)));
  }
}
