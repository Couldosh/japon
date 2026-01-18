import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="footer-container">
      <div class="footer-copyright">2026 Faburisu</div>
      <div class="footer-links">
      </div>
    </div>
  `,
  host: {
    class: 'footer',
  },
})
export class AppFooter {}
