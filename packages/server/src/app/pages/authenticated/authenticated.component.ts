import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  imports: [RouterOutlet],
  selector: 'app-authenticated',
  template: `
    <section>
      <router-outlet></router-outlet>
    </section>
  `,
})
export class AuthenticatedComponent {}
