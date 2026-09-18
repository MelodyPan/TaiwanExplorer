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

  constructor(private placeMarkerService: PlaceMarkerService) {}

  selectCategory(category: string): void {
    this.selectedCategory = category;
    this.placeMarkerService.setCategoryFilter(category);
  }

  filterByCategory(category: string): void {
    this.selectCategory(category);
  }
}