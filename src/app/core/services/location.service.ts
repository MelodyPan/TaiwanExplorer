import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map, timeout } from 'rxjs/operators';

export interface UserLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  source: 'device' | 'ip';
}

@Injectable({ providedIn: 'root' })
export class LocationService {
  constructor(private http: HttpClient, @Inject(DOCUMENT) private document: Document) {}

  watchLocation(): Observable<UserLocation> {
    const navigator = this.document.defaultView?.navigator;
    if (!navigator || !this.isMobile(navigator) || !navigator.geolocation) {
      return this.getIpLocation();
    }

    return new Observable<UserLocation>(observer => {
      const watchId = navigator.geolocation.watchPosition(position => {
        try {
          const coordinates = this.coordinates(position.coords.latitude, position.coords.longitude);
          observer.next({ ...coordinates, accuracy: this.accuracy(position.coords.accuracy), source: 'device' });
        } catch (error) {
          observer.error(error);
        }
      }, error => observer.error(error), {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000
      });
      return () => navigator.geolocation.clearWatch(watchId);
    }).pipe(catchError(() => this.getIpLocation()));
  }

  private isMobile(navigator: Navigator): boolean {
    const device = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
    return device.userAgentData?.mobile === true
      || /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent)
      || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  }

  private getIpLocation(): Observable<UserLocation> {
    return this.http.get<{ latitude: unknown; longitude: unknown; accuracy?: number }>(
      'https://get.geojs.io/v1/ip/geo.json'
    ).pipe(
      timeout(10000),
      map(response => ({
        ...this.coordinates(response.latitude, response.longitude),
        accuracy: this.accuracy(response.accuracy === undefined ? undefined : response.accuracy * 1000),
        source: 'ip' as const
      })),
      catchError(() => throwError(new Error('無法取得目前位置，請檢查網路後重試。')))
    );
  }

  private coordinates(latitude: unknown, longitude: unknown): { latitude: number; longitude: number } {
    const number = (value: unknown): number => {
      if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return NaN;
      return Number(value);
    };
    const lat = number(latitude);
    const lng = number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) {
      throw new Error('定位資料不正確。');
    }
    return { latitude: lat, longitude: lng };
  }

  private accuracy(value: number | undefined): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
  }
}
