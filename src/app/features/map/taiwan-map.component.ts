import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { LocationService, UserLocation } from '../../core/services/location.service';
import * as L from 'leaflet';
import { MapDataService } from 'src/app/core/services/map-data.service';
import { PlaceMarkerService } from 'src/app/core/services/place-marker.service';
import { WeatherService } from 'src/app/core/services/weather.service';
import { DEFAULT_MAP_VIEW, MAP_ZOOM } from 'src/app/core/constants/map.constants';

@Component({
  selector: 'app-taiwan-map',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './taiwan-map.component.html',
  styleUrls: ['./taiwan-map.component.scss']
})
export class TaiwanMapComponent implements OnInit, OnDestroy {
  currentLocation: UserLocation | null = null;
  locationLoading = false;
  locationError = '';
  private locationSubscription?: Subscription;
  private geoJsonSubscription?: Subscription;
  private locationMarker?: L.Marker;
  private accuracyCircle?: L.Circle;
  private map!: L.Map;
  private mapResizeObserver?: ResizeObserver;
  private readonly countyNameOverrides: Record<string, string> = {
    '台北市': '臺北市',
    '台中市': '臺中市',
    '台南市': '臺南市',
    '台東縣': '臺東縣',
    '桃園縣': '桃園市'
  };
  private readonly countyColors = [
    '#77c8eb', '#8dd7c0', '#f4be77', '#ee9db0', '#a9b9ef', '#b9d985',
    '#e9a978', '#88d1d9', '#d6ace2', '#f0d56d', '#91b9e8'
  ];

  constructor(
    private mapDataService: MapDataService,
    private placeMarkerService: PlaceMarkerService,
    private weatherService: WeatherService,
    private locationService: LocationService
  ) {}

  ngOnInit(): void {
    this.initMap();
    this.loadGeoJSON();
    this.startLocation();
  }

  ngOnDestroy(): void {
    this.locationSubscription?.unsubscribe();
    this.geoJsonSubscription?.unsubscribe();
    this.mapResizeObserver?.disconnect();
    this.placeMarkerService.clearMarkers();
    this.map?.remove();
  }

  get locationStatus(): string {
    if (this.locationLoading) return '正在取得目前位置…';
    if (this.locationError) return this.locationError;
    if (!this.currentLocation) return '';
    const source = this.currentLocation.source === 'device' ? '裝置定位' : 'IP 推估位置（非精確定位）';
    const accuracy = this.currentLocation.accuracy;
    if (accuracy === undefined) return source;
    const distance = accuracy >= 1000 ? (accuracy / 1000).toFixed(1) + ' 公里' : Math.round(accuracy) + ' 公尺';
    return source + '・誤差約 ' + distance;
  }

  returnToLocation(): void {
    if (this.currentLocation) {
      this.centerOnLocation(this.currentLocation, true);
    } else if (!this.locationLoading) {
      this.startLocation();
    }
  }

  private startLocation(): void {
    this.locationSubscription?.unsubscribe();
    this.locationLoading = true;
    this.locationError = '';
    this.locationSubscription = this.locationService.watchLocation().subscribe({
      next: location => {
        const firstPosition = this.currentLocation === null;
        this.currentLocation = location;
        this.locationLoading = false;
        this.locationError = '';
        this.updateLocationMarker(location);
        if (firstPosition) this.centerOnLocation(location, false);
      },
      error: () => {
        this.locationLoading = false;
        this.currentLocation = null;
        this.locationMarker?.remove();
        this.locationMarker = undefined;
        this.accuracyCircle?.remove();
        this.accuracyCircle = undefined;
        this.locationError = '無法定位，已顯示預設中心：台中火車站。可重新定位。';
        this.map.setView(DEFAULT_MAP_VIEW.center, DEFAULT_MAP_VIEW.zoom);
        this.placeMarkerService.loadMarkers(this.map);
      }
    });
  }

  private centerOnLocation(location: UserLocation, keepZoom: boolean): void {
    const zoom = keepZoom ? this.map.getZoom() : location.source === 'device' ? 15 : 10;
    this.map.setView([location.latitude, location.longitude], zoom);
    this.placeMarkerService.loadMarkers(this.map);
  }

  private updateLocationMarker(location: UserLocation): void {
    const point: L.LatLngExpression = [location.latitude, location.longitude];
    const label = location.source === 'device' ? '目前位置' : '目前位置（IP 推估）';
    if (this.locationMarker) {
      this.locationMarker.setLatLng(point).setTooltipContent(label);
    } else {
      this.locationMarker = L.marker(point, {
        icon: L.divIcon({ className: 'current-location-marker', html: '<span></span>', iconSize: [24, 24], iconAnchor: [12, 12] }),
        title: label,
        alt: label,
        zIndexOffset: 1000
      }).bindTooltip(label, { direction: 'top' }).addTo(this.map);
    }
    this.accuracyCircle?.remove();
    this.accuracyCircle = undefined;
    if (location.accuracy !== undefined && location.accuracy > 0) {
      this.accuracyCircle = L.circle(point, {
        radius: location.accuracy,
        color: '#2387b5',
        weight: 1,
        fillColor: '#3da6d7',
        fillOpacity: 0.1,
        dashArray: location.source === 'ip' ? '5 5' : undefined,
        interactive: false
      }).addTo(this.map);
    }
  }

  private initMap(): void {
    this.map = L.map('map').setView(DEFAULT_MAP_VIEW.center, DEFAULT_MAP_VIEW.zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    this.map.on('zoomend', this.onZoomChange.bind(this));
    this.placeMarkerService.loadMarkers(this.map);
    if (typeof ResizeObserver !== 'undefined') {
      this.mapResizeObserver = new ResizeObserver(() => this.map.invalidateSize({ animate: false }));
      this.mapResizeObserver.observe(this.map.getContainer());
    }
  }

  private loadGeoJSON(): void {
    this.geoJsonSubscription = this.mapDataService.getTaiwanCountiesGeoJSON().subscribe(geojson => {
      const countyLayer = L.geoJSON(geojson, {
        onEachFeature: this.onEachCountyFeature.bind(this),
        style: this.getCountyStyle.bind(this)
      }).addTo(this.map);
    });
  }

  private onEachCountyFeature(feature: any, layer: L.GeoJSON<any>): void {
    layer.on({
      mouseover: this.highlightCounty.bind(this),
      mouseout: this.resetHighlight.bind(this),
      click: this.zoomToCounty.bind(this)
    });

    const label = L.divIcon({
      className: 'county-label',
      html: this.getCountyName(feature.properties.name),
      iconSize: L.point(100, 40)
    });
    L.marker(layer.getBounds().getCenter(), { icon: label }).addTo(this.map);
  }

  private highlightCounty(e: L.LeafletMouseEvent): void {
    const layer = e.target;
    layer.setStyle({
      fillOpacity: 0.7,
      weight: 3
    });
  }

  private resetHighlight(e: L.LeafletMouseEvent): void {
    const layer = e.target;
    layer.setStyle(this.getCountyStyle(layer.feature));
  }

  private zoomToCounty(e: L.LeafletMouseEvent): void {
    this.map.fitBounds(e.target.getBounds());
    this.weatherService.selectCounty(this.getCountyName(e.target.feature.properties.name));
  }

  private getCountyStyle(feature: any): L.PathOptions {
    return {
      fillColor: this.getCountyColor(feature.properties.COUNTYSN),
      weight: 1.5,
      opacity: 1,
      color: '#ffffff',
      fillOpacity: 0.72
    };
  }

  private getCountyName(name: string): string {
    return this.countyNameOverrides[name] ?? name;
  }

  private getCountyColor(countyId: string): string {
    const colorIndex = Array.from(countyId).reduce(
      (total, character) => total + character.charCodeAt(0),
      0
    ) % this.countyColors.length;
    return this.countyColors[colorIndex];
  }

  private onZoomChange(): void {
    const zoomLevel = this.map.getZoom();
    if (zoomLevel >= MAP_ZOOM.COUNTY) {
      this.placeMarkerService.loadMarkers(this.map);
    } else {
      this.placeMarkerService.clearMarkers();
    }
  }
}