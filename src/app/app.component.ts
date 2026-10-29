import { Component, HostListener } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'Taiwan Explorer';
  filtersOpen = false;
  showBackToTop = false;

  @HostListener('window:scroll')
  @HostListener('window:pageshow')
  updateScrollPosition(): void {
    // 只依整頁捲動顯示，避免首屏就出現；地圖拖曳與清單內部捲動不算。
    this.showBackToTop = window.scrollY > 300;
  }

  scrollToTop(): void {
    // 尊重作業系統的減少動畫偏好，不能一律強制平滑捲動。
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({top: 0, behavior: reducedMotion ? 'auto' : 'smooth'});
  }
}