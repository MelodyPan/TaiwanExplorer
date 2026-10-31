export type RouteMode = 'driving' | 'scooter' | 'walking';
export interface RoutePoint { latitude: number; longitude: number; }
export interface RouteResult {
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
}

export function validRoutePoint(point: RoutePoint | null | undefined): point is RoutePoint {
  return !!point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
    && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180
    && (point.latitude !== 0 || point.longitude !== 0);
}

export function buildRouteRequest(origin: RoutePoint, destination: RoutePoint, mode: RouteMode): object {
  const costing = {driving: 'auto', scooter: 'motor_scooter', walking: 'pedestrian'}[mode];
  if (!validRoutePoint(origin) || !validRoutePoint(destination) || !costing) {
    throw new Error('請先取得有效定位，並選擇有效的目的地與交通方式。');
  }
  return {
    locations: [origin, destination].map(point => ({lat: point.latitude, lon: point.longitude})),
    costing, format: 'osrm', shape_format: 'geojson', units: 'kilometers',
    // 一般機車使用獨立的通行限制，不能用汽車路線改速度冒充；不啟用忽略禁行等選項。
    ...(mode === 'scooter' ? {costing_options: {motor_scooter: {use_highways: 0, use_tolls: 0}}} : {})
  };
}

export function parseRouteResult(data: any): RouteResult {
  const route = data?.routes?.[0], geometry = route?.geometry;
  if (data?.code !== 'Ok' || !Number.isFinite(route?.distance) || route.distance < 0
    || !Number.isFinite(route?.duration) || route.duration < 0
    || geometry?.type !== 'LineString' || !Array.isArray(geometry.coordinates)
    || geometry.coordinates.length < 2
    || !geometry.coordinates.every((point: any) => Array.isArray(point) && point.length >= 2
      && validRoutePoint({latitude: point[1], longitude: point[0]}))) {
    throw new Error('目前無法取得此交通方式的路線，請稍後重試或改選目的地。');
  }
  // GeoJSON 是經度、緯度；Leaflet 則需要緯度、經度，不能直接把陣列交給 polyline。
  return {distanceMeters: route.distance, durationSeconds: route.duration,
    coordinates: geometry.coordinates.map((point: number[]) => [point[1], point[0]])};
}

export function formatRouteDistance(meters: number): string {
  return meters < 1000 ? Math.round(meters) + ' 公尺' : (meters / 1000).toFixed(1) + ' 公里';
}
export function formatRouteDuration(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes < 60 ? minutes + ' 分鐘' : Math.floor(minutes / 60) + ' 小時' + (minutes % 60 ? ' ' + minutes % 60 + ' 分鐘' : '');
}
