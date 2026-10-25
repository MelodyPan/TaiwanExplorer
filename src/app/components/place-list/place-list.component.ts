import { Component, OnInit } from '@angular/core';
import { combineLatest } from 'rxjs';
import { Place } from '../../models/place.model';
import { PlaceMarkerService } from '../../core/services/place-marker.service';
import { PlaceService } from '../../core/services/place.service';

@Component({
  selector: 'app-place-list',
  templateUrl: './place-list.component.html',
  styleUrls: ['./place-list.component.scss']
})
export class PlaceListComponent implements OnInit {
  places: Place[] = [];
  selectedCategory = 'ALL';
  selectedCounties: readonly string[] = [];

  constructor(
    private placeService: PlaceService,
    private placeMarkerService: PlaceMarkerService
  ) {}

  ngOnInit(): void {
    combineLatest([
      this.placeService.getPlaces(),
      this.placeMarkerService.categoryFilter$,
      this.placeMarkerService.searchFilter$,
      this.placeMarkerService.countyFilter$
    ]).subscribe(([places, category, searchTerm, counties]) => {
      this.selectedCounties = counties;
      this.selectedCategory = category;
      const categoryPlaces = category === 'ALL'
        ? places
        : places.filter(place => place.category === category);
      this.places = categoryPlaces
        .filter(place => counties.length === 0 || counties.includes(place.county))
        .filter(place => this.matchesSearch(place, searchTerm));
    });
  }

  private matchesSearch(place: Place, searchTerm: string): boolean {
    if (!searchTerm) {
      return true;
    }

    const searchableText = [
      place.name,
      place.county,
      place.district,
      place.address,
      place.description,
      ...(place.tags || [])
    ].filter(Boolean).join(' ').toLocaleLowerCase();

    return searchableText.includes(searchTerm);
  }
}