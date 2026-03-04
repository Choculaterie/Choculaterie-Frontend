import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { FooterComponent } from './shared/components/footer/footer.component';
import { NavbarComponent } from './shared/components/navbar/navbar.component';
import { AdminService } from './api/admin';
import { RealtimeService } from './core/services/realtime.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent, FooterComponent, MatIconModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private adminApi = inject(AdminService);
  readonly realtime = inject(RealtimeService);

  // Expose announcements from the shared realtime service
  readonly announcements = this.realtime.announcements;

  ngOnInit(): void {
    // Seed initial announcements via HTTP, then real-time hub keeps them live
    this.adminApi.getApiAdminLiveMessages().subscribe({
      next: (res) => {
        this.realtime.seedAnnouncements(res);
        this.realtime.connect();
      },
      error: () => this.realtime.connect(),
    });
  }
}
