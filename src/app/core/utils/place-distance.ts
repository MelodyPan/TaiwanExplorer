import { Place } from '../../models/place.model';
import { UserLocation } from '../services/location.service';

function validPoint(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    && (latitude !== 0 || longitude !== 0);
}

export function sortPlacesByDistance(places: readonly Place[], position: UserLocation | null): Place[] {
  // 沒有有效定位就維持來源順序；預設地圖中心不會傳入此處當作使用者位置。
  if (!position || !validPoint(position.latitude, position.longitude)) return [...places];
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitude = radians(position.latitude);
  const distance = (place: Place): number => {
    if (!validPoint(place.latitude, place.longitude)) return Infinity;
    // Haversine 計算球面直線距離，不是步行／開車路程；不另呼叫外部路線服務。
    const dLat = radians(place.latitude - position.latitude);
    const dLng = radians(place.longitude - position.longitude);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(latitude) * Math.cos(radians(place.latitude)) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a))));
  };
  // 排序副本，不能改動公開資料；同距離及無效座標維持原順序，避免清單跳動。
  return places.map((place, index) => ({place, index, distance: distance(place)}))
    .sort((a, b) => (a.distance - b.distance) || (a.index - b.index))
    .map(item => item.place);
}
