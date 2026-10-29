import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { PlaceMarkerService } from '../../core/services/place-marker.service';
import { CountyWeather, WeatherService } from '../../core/services/weather.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit {
  @Input() filtersOpen = false;
  @Output() filtersToggle = new EventEmitter<void>();
  title: string = 'Taiwan Explorer';
  subtitle: string = '探索台灣';
  weather: CountyWeather | null = null;
  weatherIcon = '';
  today = new Intl.DateTimeFormat('zh-TW', {
    month: 'long',
    day: 'numeric',
    weekday: 'short'
  }).format(new Date());

  constructor(
    private placeMarkerService: PlaceMarkerService,
    private weatherService: WeatherService
  ) {}

  ngOnInit(): void {
    this.weatherService.weather$.subscribe(weather => {
      this.weather = weather;
      this.weatherIcon = weather ? this.getWeatherIcon(weather.summary) : '';
    });
  }

  private getWeatherIcon(summary: string): string {
    if (summary === '晴朗') return '☀';
    if (summary === '有雨' || summary === '雷雨') return '☂';
    if (summary === '降雪') return '❄';
    if (summary === '有霧') return '≋';
    return '☁';
  }

  searchPlaces(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.placeMarkerService.setSearchFilter(input.value);
  }
}