import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ViewHeaderComponent } from './view-header.component';

@Component({
  selector: 'app-test-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ViewHeaderComponent],
  template: `<app-view-header title="Annual leave entitlement" />`,
})
class TestHostComponent {}

describe('ViewHeaderComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TestHostComponent] }).compileComponents();
  });

  it('should let the breakpoint pick the glyph rather than reading the viewport', async () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    await fixture.whenStable();
    const icons = (fixture.nativeElement as HTMLElement).querySelectorAll('app-icon');

    // Both glyphs ship and CSS reveals one per breakpoint. Computing the icon
    // from the measured viewport meant phones painted the panel glyph first and
    // swapped it once hydration caught up.
    expect(icons.length).toBe(2);
    expect(icons[0].classList).toContain('lg:hidden');
    expect(icons[1].classList).toContain('hidden');
    expect(icons[1].classList).toContain('lg:block');
  });

  it('should name the product below lg and show the view title from lg up', async () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const productName = element.querySelector('span');
    const title = element.querySelector('h1');

    expect(productName?.textContent).toContain('Knowledge Assistant');
    expect(productName?.classList).toContain('lg:hidden');
    expect(title?.textContent?.trim()).toBe('Annual leave entitlement');
    expect(title?.classList).toContain('hidden');
    expect(title?.classList).toContain('lg:block');
  });

  it('should send the toggle to the trailing edge on small screens', async () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    await fixture.whenStable();
    const toggle = (fixture.nativeElement as HTMLElement).querySelector('button');

    // `ml-auto` parks it opposite the product name; from lg it returns to the
    // leading edge, beside the sidebar it controls.
    expect(toggle?.classList).toContain('ml-auto');
    expect(toggle?.classList).toContain('lg:absolute');
    expect(toggle?.classList).toContain('lg:left-6');
  });
});
