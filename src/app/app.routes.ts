import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TaiwanMapComponent } from './features/map/taiwan-map.component';
import { PlaceDetailComponent } from './features/place-detail/place-detail.component';

const routes: Routes = [
  { path: '', component: TaiwanMapComponent },
  { path: 'place/:id', component: PlaceDetailComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }