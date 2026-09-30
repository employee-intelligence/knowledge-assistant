import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { ChatService } from '../../core/services/chat.service';
import { ResponseViewComponent } from './response-view.component';

/** The parts of the chat service this view reads. */
interface ChatStub {
  threadTitle: () => string;
  isResolving: () => boolean;
  isEmpty: () => boolean;
  hasMessages: () => boolean;
  messages: () => unknown[];
  isLoading: () => boolean;
  sessionExpired: () => boolean;
  openTurn: (turnId: string | null) => void;
  ask: (question: string) => void;
  retry: (turnId: string) => void;
}

describe('ResponseViewComponent', () => {
  let expired: ReturnType<typeof signal<boolean>>;
  let chat: ChatStub;
  let router: Router;
  let fixture: ComponentFixture<ResponseViewComponent>;

  beforeEach(async () => {
    expired = signal(false);
    chat = {
      threadTitle: () => 'Annual leave entitlement',
      isResolving: () => false,
      isEmpty: () => false,
      hasMessages: () => true,
      messages: () => [],
      isLoading: () => false,
      sessionExpired: () => expired(),
      openTurn: () => undefined,
      ask: () => undefined,
      retry: () => undefined,
    };

    await TestBed.configureTestingModule({
      imports: [ResponseViewComponent],
      providers: [
        provideRouter([]),
        { provide: ChatService, useValue: chat },
        {
          provide: ActivatedRoute,
          // The route's id is a turn's position. Absent here, so the view follows
          // the newest turn the way a question sent from the dashboard arrives.
          useValue: { paramMap: of(convertToParamMap({})) },
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(ResponseViewComponent);
    await fixture.whenStable();
  });

  /** The rendered element, for what the screen is showing. */
  const element = (): HTMLElement => fixture.nativeElement as HTMLElement;

  it('goes home when the session behind the conversation ends', async () => {
    expect(router.navigate).not.toHaveBeenCalled();

    expired.set(true);
    await fixture.whenStable();

    // The route change is the whole of the recovery: the user lands in front of
    // the dashboard's composer, where the next question opens a fresh session.
    expect(router.navigate).toHaveBeenCalledWith(['/']);
  });

  it('stays put while the conversation is intact', async () => {
    // Reading an old turn is not a reason to bounce the user off it.
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('never puts an expiry screen in front of the user', async () => {
    expired.set(true);
    await fixture.whenStable();

    // The conversation is gone, so the view holds nothing about it. A page
    // explaining that would stand where a working composer should be.
    expect(element().textContent).not.toContain('Session expired');
  });

  it('leaves a composer behind rather than stranding the user', async () => {
    // The service resets to an empty conversation, so there is somewhere to ask
    // the next question even before the route finishes changing.
    chat.hasMessages = () => false;
    chat.isEmpty = () => true;
    expired.set(true);

    await fixture.whenStable();

    expect(element().querySelector('app-question-input')).toBeTruthy();
  });
});
