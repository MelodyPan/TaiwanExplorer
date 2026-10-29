import { Component } from '@angular/core';
import { PlaceMarkerService } from '../../core/services/place-marker.service';
import { PlaceCategory } from '../../models/place.model';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent {
  readonly categories: { value: PlaceCategory; name: string; icon: string }[] = [
    { value: 'ATTRACTION', name: '景點', icon: '🏞' },
    { value: 'FOOD', name: '美食', icon: '🍜' },
    { value: 'CAFE', name: '咖啡', icon: '☕' },
    { value: 'HOTEL', name: '住宿', icon: '🏨' },
    { value: 'CULTURE', name: '文化', icon: '🏛' },
    { value: 'NATURE', name: '自然', icon: '🌲' }
  ];
  selectedCategories: PlaceCategory[] = [];
  readonly counties = [
    '基隆市', '臺北市', '新北市', '桃園市', '新竹市', '新竹縣',
    '苗栗縣', '臺中市', '彰化縣', '南投縣', '雲林縣',
    '嘉義市', '嘉義縣', '臺南市', '高雄市', '屏東縣',
    '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣'
  ];
  selectedCounties: string[] = [];

  constructor(private placeMarkerService: PlaceMarkerService) {}

  toggleCategory(category: PlaceCategory): void {
    this.selectedCategories = this.selectedCategories.includes(category)
      ? this.selectedCategories.filter(selected => selected !== category)
      : [...this.selectedCategories, category];
    this.placeMarkerService.setCategoryFilter(this.selectedCategories);
  }

  clearCategories(): void {
    this.selectedCategories = [];
    this.placeMarkerService.setCategoryFilter([]);
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
}
