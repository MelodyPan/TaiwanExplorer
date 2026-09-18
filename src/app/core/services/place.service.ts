import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Place, PlaceCategory } from '../../models/place.model';

@Injectable({
  providedIn: 'root'
})
export class PlaceService {
  private placesUrl = 'assets/data/places.json';

  constructor(private http: HttpClient) {}

  getPlaces(): Observable<Place[]> {
    return this.http.get<Place[]>(this.placesUrl);
  }

  getPlacesByCounty(county: string): Observable<Place[]> {
    return this.http.get<Place[]>(this.placesUrl).pipe(
      map((places: Place[]) => places.filter((place: Place) => place.county === county))
    );
  }

  getPlacesByCategory(category: PlaceCategory): Observable<Place[]> {
    return this.http.get<Place[]>(this.placesUrl).pipe(
      map((places: Place[]) => places.filter((place: Place) => place.category === category))
    );
  }
}