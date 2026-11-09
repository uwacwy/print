import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { EnrollSetupComponent } from './enroll-setup.component';

describe('EnrollSetupComponent', () => {
  const create = (inputs: Record<string, unknown>) => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(EnrollSetupComponent);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    return fixture;
  };

  it('asks for a command before one exists and emits create', () => {
    const fixture = create({});
    let created = 0;
    fixture.componentInstance.create.subscribe(() => created++);
    fixture.nativeElement.querySelector('button').click();
    expect(created).toBe(1);
  });

  it('shows "Creating..." while busy', () => {
    const fixture = create({ busy: true });
    const button: HTMLButtonElement =
      fixture.nativeElement.querySelector('button');
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Creating...');
  });

  it('shows the setup commands once a token exists', () => {
    const fixture = create({
      token: {
        token: 'e'.repeat(44),
        expiresAt: '2030-01-01T00:00:00.000Z',
        serverUrl: 'https://print.example.org',
      },
    });
    expect(fixture.nativeElement.textContent).toContain(
      `https://print.example.org/printer/${'e'.repeat(44)}/install`,
    );
  });
});
