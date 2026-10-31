import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { defer, Observable, of, timer } from 'rxjs';
import { map, switchMap, tap, timeout } from 'rxjs/operators';
import { buildRouteRequest, parseRouteResult, RouteMode, RoutePoint, RouteResult } from '../utils/route';

@Injectable({providedIn: 'root'})
export class RoutingService {
  private nextRequestAt = 0;
  private readonly cache = new Map<string, {expires: number; result: RouteResult}>();
  constructor(private http: HttpClient) {}

  route(origin: RoutePoint, destination: RoutePoint, mode: RouteMode): Observable<RouteResult> {
    return defer(() => {
      const request = buildRouteRequest(origin, destination, mode);
      const key = JSON.stringify(request), cached = this.cache.get(key);
      if (cached && cached.expires > Date.now()) return of(cached.result);
      // 公共服務只接受少量互動查詢；全服務共用間距，切換模式也不可瞬間連發。
      // 取消訂閱會取消等待及 HttpClient 請求，不做背景 GPS 自動重算或重試。
      const now = Date.now(), wait = Math.max(0, this.nextRequestAt - now);
      this.nextRequestAt = now + wait + 1100;
      return timer(wait).pipe(
        switchMap(() => this.http.get('https://valhalla1.openstreetmap.de/route', {
          params: {json: key},
          headers: {'X-Client-Id': 'melodypan.github.io/TaiwanExplorer'}
        }).pipe(timeout(20000))),
        map(parseRouteResult),
        tap(result => {
          this.cache.delete(key);
          this.cache.set(key, {expires: Date.now() + 5 * 60 * 1000, result});
          if (this.cache.size > 20) this.cache.delete(this.cache.keys().next().value);
        })
      );
    });
  }
}
