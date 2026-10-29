import { FormsModule } from '@angular/forms';
import { PlaceRecordsComponent } from './components/place-records/place-records.component';
import { HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HeaderComponent } from './components/header/header.component';
import { PlaceListComponent } from './components/place-list/place-list.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { TaiwanMapComponent } from './features/map/taiwan-map.component';
import { AppComponent } from './app.component';

@NgModule({
  declarations: [AppComponent, HeaderComponent, SidebarComponent, PlaceListComponent, PlaceRecordsComponent],
  imports: [BrowserModule, FormsModule, HttpClientModule, TaiwanMapComponent],
  bootstrap: [AppComponent]
})
export class AppModule {}