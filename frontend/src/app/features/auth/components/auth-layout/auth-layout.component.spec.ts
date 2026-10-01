import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuthLayoutComponent } from './auth-layout.component';

describe('AuthLayoutComponent', () => {
  let fixture: ComponentFixture<AuthLayoutComponent>;

  const text = (): string => (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AuthLayoutComponent] }).compileComponents();

    fixture = TestBed.createComponent(AuthLayoutComponent);
    fixture.detectChanges();
  });

  it('says plainly that nothing typed on a signed-out screen is sent anywhere', () => {
    expect(text()).toContain('nothing you enter is sent anywhere');
  });

  it('carries the internal-system notice the designs put on every signed-out screen', () => {
    // Kept in the shared layout rather than in each view, so the three screens
    // cannot drift apart on whether the workspace is internal.
    expect(text()).toContain('Protected internal system - SSO enabled');
  });
});
