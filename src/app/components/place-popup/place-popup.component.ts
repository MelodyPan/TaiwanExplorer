import { Component, Input } from '@angular/core';
import { Place } from 'src/app/models/place.model';

@Component({
  selector: 'app-place-popup',
  templateUrl: './place-popup.component.html',
  styleUrls: ['./place-popup.component.scss'],
})
export class PlacePopupComponent {
  @Input() place!: Place;

  constructor() {}
}