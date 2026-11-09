import { TestBed } from '@angular/core/testing';
import type { SetupCommand } from '@uwacwy/print-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SetupCommandsComponent } from './setup-commands.component';

const commands = [
  { id: 'install', label: 'Install the agent', command: 'npm i -g agent' },
  { id: 'start', label: 'Start it', command: 'agent start\n  --now' },
] as SetupCommand[];

describe('SetupCommandsComponent', () => {
  const original = Object.getOwnPropertyDescriptor(
    navigator,
    'clipboard',
  );
  const setClipboard = (value: unknown) =>
    Object.defineProperty(navigator, 'clipboard', {
      value,
      configurable: true,
    });
  afterEach(() => {
    if (original) {
      Object.defineProperty(navigator, 'clipboard', original);
    } else {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  const create = () => {
    const fixture = TestBed.createComponent(SetupCommandsComponent);
    fixture.componentRef.setInput('commands', commands);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const buttons = () =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('button'));
    const status = () => el.querySelector('[role=status]')!.textContent;
    const flush = async () => {
      await new Promise((resolve) => setTimeout(resolve));
      fixture.detectChanges();
    };
    return { fixture, el, buttons, status, flush };
  };

  const mockClipboard = (writeText: (text: string) => Promise<void>) =>
    setClipboard({ writeText });

  it('renders each label and command, linked for assistive tech', () => {
    const { el, buttons } = create();
    const labels = el.querySelectorAll('li > p');
    const pres = el.querySelectorAll('pre');
    expect(labels).toHaveLength(2);
    expect(labels[0].textContent).toContain('Install the agent');
    expect(pres[1].textContent).toBe('agent start\n  --now');
    expect(pres[0].getAttribute('aria-labelledby')).toBe(labels[0].id);
    expect(buttons()[1].getAttribute('aria-describedby')).toBe(
      labels[1].id,
    );
    expect(buttons().map((b) => b.textContent?.trim())).toEqual([
      'Copy',
      'Copy',
    ]);
  });

  it('gives each instance unique element ids', () => {
    const a = create().el.querySelector('li > p')!.id;
    const b = create().el.querySelector('li > p')!.id;
    expect(a).not.toBe(b);
  });

  it('copies the command and announces success on that item only', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    mockClipboard(writeText);
    const { buttons, status, flush } = create();
    buttons()[1].click();
    await flush();
    expect(writeText).toHaveBeenCalledWith('agent start\n  --now');
    expect(buttons().map((b) => b.textContent?.trim())).toEqual([
      'Copy',
      'Copied',
    ]);
    expect(status()).toBe('Copied: Start it');
  });

  it('suggests manual copying when the clipboard rejects', async () => {
    mockClipboard(() => Promise.reject(new Error('denied')));
    const { buttons, status, flush } = create();
    buttons()[0].click();
    await flush();
    expect(status()).toContain('Could not copy');
    expect(buttons()[0].textContent?.trim()).toBe('Copy');
  });

  it('handles a missing clipboard API', async () => {
    setClipboard(undefined);
    const { buttons, status, flush } = create();
    buttons()[0].click();
    await flush();
    expect(status()).toContain('Could not copy');
  });
});
