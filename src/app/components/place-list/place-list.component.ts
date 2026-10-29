import { PlaceRecordsService } from '../../core/services/place-records.service';
import { Component, OnInit } from '@angular/core';
import { combineLatest } from 'rxjs';
import { Place, PlaceCategory } from '../../models/place.model';
import { PlaceMarkerService } from '../../core/services/place-marker.service';
import { PlaceService } from '../../core/services/place.service';

@Component({
  selector: 'app-place-list',
  templateUrl: './place-list.component.html',
  styleUrls: ['./place-list.component.scss']
})
export class PlaceListComponent implements OnInit {
  places: Place[] = [];
  selectedCategories: readonly PlaceCategory[] = [];
  selectedCounties: readonly string[] = [];

  constructor(
    private placeService: PlaceService,
    private placeMarkerService: PlaceMarkerService,
    public records: PlaceRecordsService
  ) {}

  ngOnInit(): void {
    combineLatest([
      this.placeService.getPlaces(),
      this.placeMarkerService.categoryFilter$,
      this.placeMarkerService.searchFilter$,
      this.placeMarkerService.countyFilter$
    ]).subscribe(([places, categories, searchTerm, counties]) => {
      this.selectedCounties = counties;
      this.selectedCategories = categories;
      const categoryPlaces = categories.length === 0
        ? places
        : places.filter(place => categories.includes(place.category));
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