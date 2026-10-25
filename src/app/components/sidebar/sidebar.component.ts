import { Component } from '@angular/core';
import { PlaceMarkerService } from '../../core/services/place-marker.service';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent {
  categories = [
    { name: '全部', icon: '' },
    { name: '🏞 景點', icon: 'attraction' },
    { name: '🍜 美食', icon: 'food' },
    { name: '☕ 咖啡', icon: 'cafe' },
    { name: '🏨 住宿', icon: 'hotel' },
    { name: '🏛 文化', icon: 'culture' },
    { name: '🌲 自然', icon: 'nature' }
  ];

  selectedCategory = 'ALL';
  readonly counties = [
    '基隆市', '臺北市', '新北市', '桃園市', '新竹市', '新竹縣',
    '苗栗縣', '臺中市', '彰化縣', '南投縣', '雲林縣',
    '嘉義市', '嘉義縣', '臺南市', '高雄市', '屏東縣',
    '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣'
  ];
  selectedCounties: string[] = [];

  constructor(private placeMarkerService: PlaceMarkerService) {}

  selectCategory(category: string): void {
    this.selectedCategory = category;
    this.placeMarkerService.setCategoryFilter(category);
  }

  toggleCounty(county: string): void {
    this.selectedCounties = this.selectedCounties.includes(county)
      ? this.selectedCounties.filter(selected => selected !== county)
      : [...this.selectedCounties, county];
    this.placeMarkerService.setCountyFilter(this.selectedCounties);
  }

  clearCounties(): void {
    this.selectedCounties = [];
    this.placeMarkerService.setCountyFilter([]);
  }

  filterByCategory(category: string): void {
    this.selectCategory(category);
  }
}