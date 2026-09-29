import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the sidebar landmark and the skip link', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('#app-sidebar')).toBeTruthy();
    expect(element.querySelector('#app-main')).toBeTruthy();
    expect(element.querySelector('a[href="#app-main"]')?.textContent).toContain('Skip to content');
  });

  it('should keep the backdrop mounted but transparent and unclickable while closed', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const backdrop = element.querySelector<HTMLElement>('button[aria-label="Close sidebar"]');

    // The backdrop is always in the DOM so it can fade; without the pointer and
    // opacity guards it would swallow every click on the view behind it.
    expect(backdrop).toBeTruthy();
    expect(backdrop?.classList).toContain('opacity-0');
    expect(backdrop?.classList).toContain('pointer-events-none');
    expect(backdrop?.inert).toBe(true);
  });

  it('should leave the sidebar interactive when it is on screen', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();
    const sidebar = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '#app-sidebar',
    );

    // The test viewport reads as desktop, so the sidebar starts expanded: it
    // must not be inert, or the drawer would trap focus while it is on screen.
    expect(sidebar?.inert).toBe(false);
  });

  it('should transition the drawer, the backdrop and the content offset together', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    const sidebar = element.querySelector('#app-sidebar');
    const main = element.querySelector('#app-main');
    const backdrop = element.querySelector<HTMLElement>('button[aria-label="Close sidebar"]');

    // `translate`, not `transform`: Tailwind v4 offsets with the `translate`
    // property, so transitioning `transform` left the drawer snapping.
    expect(sidebar?.className).toContain('transition-[width,translate]');
    expect(main?.className).toContain('transition-[padding]');
    expect(backdrop?.className).toContain('transition-opacity');

    // The shell assumes the compact layout before it can measure anything, so
    // the drawer renders off canvas. `lg:translate-x-0` is what puts it back for
    // a wide screen without waiting for hydration.
    expect(sidebar?.className).toContain('lg:translate-x-0');

    // One shared duration, so nothing overtakes anything else.
    for (const node of [sidebar, main, backdrop]) {
      expect(node?.className).toContain('duration-shell');
    }
  });

  it('should reserve the full column for the content offset, not just when expanded', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();
    const main = (fixture.nativeElement as HTMLElement).querySelector('#app-main');

    // Gating this on "is the viewport desktop" made the offset wrong on the
    // first paint, because the server cannot know the viewport.
    expect(main?.classList).toContain('lg:pl-sidebar');
    expect(main?.classList).not.toContain('lg:pl-rail');
  });
});
