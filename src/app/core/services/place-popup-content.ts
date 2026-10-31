import { Place, PlaceCategory } from '../../models/place.model';

const categoryNames: Record<PlaceCategory, string> = {
  ATTRACTION: '景點', FOOD: '美食', CAFE: '咖啡',
  HOTEL: '住宿', CULTURE: '文化', NATURE: '自然'
};

// Leaflet 接收原始 HTML 字串，沒有 Angular 範本跳脫保護，所有資料文字都必須轉義。
function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  };
  return value.replace(/[&<>"']/g, character => entities[character]);
}

// 文字跳脫無法阻止 javascript: 等網址；另外限制可開啟的協定。
function safeHttpUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

export function createPlacePopupContent(place: Place): string {
  const location = [place.county, place.district].filter(Boolean).join(' ');
  const website = safeHttpUrl(place.websiteUrl);
  const directions = safeHttpUrl(place.googleMapUrl)
    || 'https://www.google.com/maps/search/?api=1&query='
      + encodeURIComponent(place.latitude + ',' + place.longitude);
  const tags = place.tags?.length
    ? '<div class="place-info__tags">' + place.tags.map(tag => '<span>' + escapeHtml(tag) + '</span>').join('') + '</div>'
    : '';

  return '<article class="place-info" aria-label="景點詳細資訊">'
    + '<p class="place-info__category">' + escapeHtml(categoryNames[place.category]) + '</p>'
    + '<h2>' + escapeHtml(place.name) + '</h2>'
    + '<p class="place-info__location">' + escapeHtml(location) + '</p>'
    + (place.address ? '<p><strong>地址：</strong>' + escapeHtml(place.address) + '</p>' : '')
    + (place.description ? '<p class="place-info__description">' + escapeHtml(place.description) + '</p>' : '')
    + tags
    + '<div class="place-info__links">'
    + '<a href="' + escapeHtml(directions) + '" target="_blank" rel="noopener noreferrer">Google 地圖 ↗</a>'
    + (website ? '<a href="' + escapeHtml(website) + '" target="_blank" rel="noopener noreferrer">官方網站 ↗</a>' : '')
    + '</div><button type="button" class="place-info__route">規劃路線</button><button type="button" class="place-info__record">我的地點紀錄／編輯</button></article>';
}
