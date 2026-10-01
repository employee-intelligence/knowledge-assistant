import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { RegisterViewComponent } from './register-view.component';

describe('RegisterViewComponent', () => {
  let fixture: ComponentFixture<RegisterViewComponent>;

  const element = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const render = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  /** The form's fields, in the order they are declared. */
  const field = (index: number): HTMLInputElement =>
    element().querySelectorAll<HTMLInputElement>('app-form-field input')[index];

  const type = (index: number, value: string): void => {
    field(index).value = value;
    field(index).dispatchEvent(new Event('input'));
  };

  const submit = async (): Promise<void> => {
    (element().querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { cancelable: true }),
    );
    await render();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegisterViewComponent],
      // The link back to sign-in is a real routerLink, so the router has to exist.
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(RegisterViewComponent);
  });

  it('asks for the four things the design lists, in order', async () => {
    await render();

    // The required marker is stripped so the assertion is about which fields
    // exist and in what order, not about how the required state is drawn.
    const labels = Array.from(element().querySelectorAll('app-form-field label')).map((label) =>
      (label.textContent ?? '').replace('*', '').trim(),
    );

    expect(labels).toEqual(['Full name', 'Work email', 'Password', 'Confirm']);
  });

  it('names every empty field on the first attempt', async () => {
    await render();
    await submit();

    expect(element().textContent).toContain('Enter your name');
    expect(element().textContent).toContain('Enter your work email');
    expect(element().textContent).toContain('Choose a password');
    expect(element().textContent).toContain('Repeat your password');
  });

  it('says a confirmation does not match rather than that it is missing', async () => {
    await render();

    type(0, 'Sarah Mensah');
    type(1, 'sarah.mensah@company.com');
    type(2, 'correct horse');
    type(3, 'battery staple');
    await submit();

    // A mismatch is a different mistake from an empty field, and telling somebody
    // their confirmation is missing when they filled it in sends them looking in
    // the wrong place.
    expect(element().textContent).toContain('Those passwords do not match');
    expect(element().textContent).not.toContain('Repeat your password');
  });

  it('rejects a short password before the confirmation is even looked at', async () => {
    await render();

    type(0, 'Sarah Mensah');
    type(1, 'sarah.mensah@company.com');
    type(2, 'short');
    type(3, 'short');
    await submit();

    expect(element().textContent).toContain('Use at least 8 characters');
  });

  it('rejects an address with no @ without demanding a stricter shape', async () => {
    await render();

    type(0, 'Sarah Mensah');
    type(1, 'sarah at company');
    type(2, 'correct horse');
    type(3, 'correct horse');
    await submit();

    // Deliberately loose. A pattern strict enough to be sure is also strict enough
    // to refuse an address that works, which is the worse failure.
    expect(element().textContent).toContain('does not look like an email address');
  });

  it('admits that no account was created', async () => {
    await render();

    type(0, 'Sarah Mensah');
    type(1, 'sarah.mensah@company.com');
    type(2, 'correct horse');
    type(3, 'correct horse');
    await submit();

    expect(element().textContent).toContain('Creating account…');

    await new Promise((resolve) => setTimeout(resolve, 700));
    await render();

    expect(element().textContent).toContain('no account was created');
    expect(element().textContent).not.toContain('Creating account…');
  });

  it('offers a way back to signing in', async () => {
    await render();

    expect(element().querySelector('a[href="/login"]')?.textContent).toContain('Log in');
  });
});
