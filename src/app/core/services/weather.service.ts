import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

export interface CountyWeather {
  county: string;
  high: number;
  low: number;
  rainProbability: number;
  summary: string;
}

interface ForecastResponse {
  current_weather: { weathercode: number };
  daily: {
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
  };
}

@Injectable({ providedIn: 'root' })
export class WeatherService {
  private readonly selectedCountySubject = new BehaviorSubject<string | null>(null);
  private readonly countyCoordinates: Record<string, [number, number]> = {
    '臺北市': [25.033, 121.5654], '新北市': [25.0169, 121.4628], '桃園市': [24.9937, 121.301],
    '臺中市': [24.1477, 120.6736], '臺南市': [22.9999, 120.2269], '高雄市': [22.6273, 120.3014],
    '基隆市': [25.1276, 121.7392], '新竹市': [24.8138, 120.9675], '嘉義市': [23.4801, 120.4491],
    '新竹縣': [24.8387, 121.0177], '苗栗縣': [24.5602, 120.8214], '彰化縣': [24.0756, 120.544],
    '南投縣': [23.9609, 120.9719], '雲林縣': [23.7092, 120.4313], '嘉義縣': [23.4518, 120.2555],
    '屏東縣': [22.5519, 120.5488], '宜蘭縣': [24.7021, 121.7378], '花蓮縣': [23.9911, 121.6112],
    '臺東縣': [22.7554, 121.15], '澎湖縣': [23.5712, 119.5793], '金門縣': [24.4327, 118.3171], '連江縣': [26.1605, 119.9499]
  };

  readonly weather$ = this.selectedCountySubject.pipe(
    switchMap(county => county ? this.getTodayWeather(county) : of(null))
  );

  constructor(private http: HttpClient) {}

  selectCounty(county: string): void {
    this.selectedCountySubject.next(county);
  }

  private getTodayWeather(county: string): Observable<CountyWeather | null> {
    const coordinates = this.countyCoordinates[county];
    if (!coordinates) {
      return of(null);
    }

    const [latitude, longitude] = coordinates;
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + latitude
      + '&longitude=' + longitude
      + '&current_weather=true&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTaipei';

    return this.http.get<ForecastResponse>(url).pipe(
      switchMap(forecast => of({
        county,
        high: Math.round(forecast.daily.temperature_2m_max[0]),
        low: Math.round(forecast.daily.temperature_2m_min[0]),
        rainProbability: forecast.daily.precipitation_probability_max[0],
        summary: this.getWeatherSummary(forecast.current_weather.weathercode)
      })),
      catchError(() => of(null))
    );
  }

  private getWeatherSummary(weatherCode: number): string {
    if (weatherCode === 0) return '晴朗';
    if (weatherCode <= 3) return '多雲';
    if (weatherCode <= 48) return '有霧';
    if (weatherCode <= 67) return '有雨';
    if (weatherCode <= 77) return '降雪';
    return '雷雨';
  }
}