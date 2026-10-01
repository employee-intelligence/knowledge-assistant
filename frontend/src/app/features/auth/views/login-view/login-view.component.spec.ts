import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { LoginViewComponent } from './login-view.component';

describe('LoginViewComponent', () => {
  let fixture: ComponentFixture<LoginViewComponent>;

  const element = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const fields = (): HTMLInputElement[] =>
    Array.from(element().querySelectorAll<HTMLInputElement>('app-form-field input'));

  const render = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  const submit = async (): Promise<void> => {
    (element().querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { cancelable: true }),
    );
    await render();
  };

  const type = (index: number, value: string): void => {
    fields()[index].value = value;
    fields()[index].dispatchEvent(new Event('input'));
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginViewComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginViewComponent);
  });

  it('asks for a work email and a password', async () => {
    await render();

    expect(element().textContent).toContain('Sign in');
    expect(fields().length).toBe(2);
    expect(fields()[0].type).toBe('email');
    expect(fields()[1].type).toBe('password');
  });

  it('says plainly that the screen is not connected to an account', async () => {
    await render();

    // Stated before anything is typed, so nobody types a real password into a form
    // that is only a drawing.
    expect(element().textContent).toContain('Accounts are not connected yet');
  });

  it('complains about empty fields only once the form is sent', async () => {
    await render();
    expect(element().textContent).not.toContain('Enter your work email');

    await submit();

    expect(element().textContent).toContain('Enter your work email');
    expect(element().textContent).toContain('Enter your password');
  });

  it('reports that a forgotten password cannot be recovered yet', async () => {
    await render();

    const forgot = Array.from(element().querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === 'Forgot your password?',
    ) as HTMLButtonElement;
    forgot.click();
    await render();

    expect(element().textContent).toContain('Password recovery is not connected yet');
  });

  it('shows a pending state, then admits it signed nobody in', async () => {
    await render();

    type(0, 'ama.mensah@acmetech.example');
    type(1, 'correct horse battery');
    await submit();

    // The pending state is real while the pretend request runs, so the button has
    // to say what it is doing rather than looking like nothing happened.
    expect(element().textContent).toContain('Signing in…');

    await new Promise((resolve) => setTimeout(resolve, 700));
    await render();

    // Nothing is sent, so the form cannot report success. It has to say what
    // actually happened instead of leaving the spinner running forever.
    expect(element().textContent).toContain('Sign-in is not connected yet');
    expect(element().textContent).not.toContain('Signing in…');
  });
});
