import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { ViewerService } from '../../../../core/services/viewer.service';
import { ChatSidebarComponent } from './chat-sidebar.component';

describe('ChatSidebarComponent', () => {
  let fixture: ComponentFixture<ChatSidebarComponent>;
  let viewer: ViewerService;

  const element = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const render = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  /** The label of the administration link, or null when it is not there. */
  const administrationLink = (): string | null =>
    Array.from(element().querySelectorAll('a'))
      .find((link) => link.textContent?.trim() === 'Administration')
      ?.getAttribute('href') ?? null;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatSidebarComponent],
      // The sidebar reaches the conversation services, which reach `HttpClient`.
      // Without a backend behind it they fail to construct, and the failure lands
      // whenever the injection error surfaces rather than where it is caused.
      providers: [
        // Signing out navigates, so `/login` has to be routable. The real route
        // lazy-loads the sign-in view, which is not what this test is about.
        provideRouter([{ path: 'login', children: [] }]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ChatSidebarComponent);
    viewer = TestBed.inject(ViewerService);
  });

  it('hides the administration link from an employee', async () => {
    viewer.setPreviewRole('employee');
    await render();

    // The link is the whole visible difference between the two roles, so it must
    // not be present rather than merely disabled.
    expect(administrationLink()).toBeNull();
  });

  it('offers the administration link to an administrator', async () => {
    viewer.setPreviewRole('administrator');
    await render();

    expect(administrationLink()).toBe('/admin');
  });

  it('names the viewer and their role', async () => {
    viewer.setPreviewRole('administrator');
    await render();

    expect(element().textContent).toContain('Ama Mensah');
    expect(element().textContent).toContain('Administrator');
  });

  it('asks for confirmation before signing out, then returns to the sign-in screen', async () => {
    await render();

    (element().querySelector('button[aria-label="Sign out"]') as HTMLButtonElement).click();
    await render();

    const dialog = element().querySelector('app-confirm-dialog');
    expect(dialog?.textContent).toContain('Sign out?');

    const confirm = Array.from(dialog?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
      (button) => button.textContent?.trim() === 'Sign out',
    ) as HTMLButtonElement;
    confirm.click();
    await render();

    expect(TestBed.inject(Router).url).toBe('/login');
  });
});
