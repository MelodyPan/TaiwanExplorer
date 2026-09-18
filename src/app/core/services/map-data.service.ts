import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { County } from '../../models/county.model';
import { Place } from '../../models/place.model';

@Injectable({
  providedIn: 'root'
})
export class MapDataService {
  private geoJsonUrl = 'assets/geojson/taiwan-counties.geojson';

  constructor(private http: HttpClient) {}

  loadGeoJson(): Observable<any> {
    return this.http.get(this.geoJsonUrl);
  }

  getTaiwanCountiesGeoJSON(): Observable<any> {
    return this.loadGeoJson();
  }

  getCounties(): Observable<County[]> {
    return this.loadGeoJson().pipe(
      map((data: any) => data.features.map((feature: any) => ({
        name: feature.properties.name,
        boundaries: feature.geometry.coordinates
      })))
    );
  }
}