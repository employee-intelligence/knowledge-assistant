import { TestBed } from '@angular/core/testing';

import { HistoryService } from './history.service';
import { AnswerResponse } from '../models/message.model';
import { Question } from '../models/question.model';

const question = (id: string, title: string): Question => {
  const askedAt = new Date().toISOString();

  return {
    id,
    title,
    topic: title,
    askedAt,
    updatedAt: askedAt,
    answerStatus: 'answered',
    documentCount: 1,
    documentsUpdatedAt: askedAt,
  };
};

const answer = (text: string): AnswerResponse => ({
  text,
  status: 'answered',
  sources: [],
  documentCount: 0,
});

describe('HistoryService', () => {
  let history: HistoryService;

  const entry = (id: string, title: string, preview: string) => ({
    question: question(id, title),
    answerPreview: preview,
  });

  beforeEach(() => {
    history = TestBed.inject(HistoryService);
    history.setSearchTerm('');
  });

  it('starts empty and reports no history', () => {
    // The mock data layer resolves asynchronously, so nothing has landed yet.
    expect(history.entries()).toEqual([]);
    expect(history.hasHistory()).toBe(false);
  });

  it('adds a newly asked question to the top of the list', () => {
    history.upsert(entry('q-9', 'How do I claim expenses?', 'Submit the form'));

    expect(history.entries().map((item) => item.question.id)).toEqual(['q-9']);
    expect(history.hasHistory()).toBe(true);
  });

  it('moves a refreshed question back to the top instead of duplicating it', () => {
    history.upsert(entry('q-1', 'Annual leave', 'Twenty-five days'));
    history.upsert(entry('q-2', 'Password reset', 'Use the reset link'));
    history.upsert({ ...entry('q-1', 'Annual leave', 'Twenty-five days, rising to 30') });

    expect(history.entries().map((item) => item.question.id)).toEqual(['q-1', 'q-2']);
  });

  it('matches the search term against both the question and the answer', () => {
    history.upsert(entry('q-1', 'Annual leave policy', 'Twenty-five days per year'));
    history.upsert(entry('q-2', 'Password reset', 'Use the self-service portal'));

    history.setSearchTerm('annual');
    expect(history.filteredEntries().map((item) => item.question.id)).toEqual(['q-1']);

    history.setSearchTerm('self-service');
    expect(history.filteredEntries().map((item) => item.question.id)).toEqual(['q-2']);

    history.setSearchTerm('  ANNUAL  ');
    expect(history.filteredEntries()).toHaveLength(1);
  });

  it('flags a search that matched nothing, but not an empty history', () => {
    expect(history.hasNoResults()).toBe(false);

    history.setSearchTerm('nothing matches this');
    expect(history.hasNoResults()).toBe(true);

    history.clearSearch();
    expect(history.hasNoResults()).toBe(false);
  });

  it('stores the answer against the question that asked it', () => {
    history.upsert(entry('q-1', 'Annual leave', ''));

    history.updateAnswer('q-1', { ...answer('You get twenty-five days'), documentCount: 3 });

    const [updated] = history.entries();
    expect(updated.answerPreview).toBe('You get twenty-five days');
    expect(updated.question.documentCount).toBe(3);
  });

  it('groups entries into Recent and Old, recent first', () => {
    const old = new Date(Date.now() - 30 * 86_400_000).toISOString();
    history.upsert({
      question: { ...question('q-old', 'Old question'), askedAt: old },
      answerPreview: '',
    });
    history.upsert(entry('q-new', 'New question', ''));

    expect(history.groups().map((group) => group.bucket)).toEqual(['Recent', 'Old']);
    expect(history.groups().map((group) => group.entries.length)).toEqual([1, 1]);
  });

  it('keeps Recent first even when a search only matches old questions', () => {
    const old = new Date(Date.now() - 30 * 86_400_000).toISOString();
    history.upsert({
      question: { ...question('q-old', 'Old question'), askedAt: old },
      answerPreview: '',
    });
    history.upsert(entry('q-new', 'New question', ''));

    history.setSearchTerm('old');

    expect(history.groups().map((group) => group.bucket)).toEqual(['Old']);
  });
});
