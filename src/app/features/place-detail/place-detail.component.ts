import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PlaceService } from 'src/app/core/services/place.service';
import { Place } from 'src/app/models/place.model';

@Component({
  selector: 'app-place-detail',
  standalone: true,
  templateUrl: './place-detail.component.html',
  styleUrls: ['./place-detail.component.scss']
})
export class PlaceDetailComponent implements OnInit {
  place!: Place | null;

  constructor(
    private route: ActivatedRoute,
    private placeService: PlaceService
  ) {}

  ngOnInit(): void {
    const placeId = this.route.snapshot.paramMap.get('id');
    if (placeId) {
      this.loadPlaceDetail(+placeId);
    }
  }

  private loadPlaceDetail(id: number): void {
    this.placeService.getPlaces().subscribe(places => {
      this.place = places.find(place => place.id === id) || null;
    });
  }
}