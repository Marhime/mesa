// Ready pushes for Plan my week and Ask Mesa (sent after a long wait).
import { describe, expect, it } from 'vitest';

import { askedReadyPush } from '../src/ready-pushes';

describe('askedReadyPush for the kitchen jobs', () => {
  it('plan: "Your week: N dinners", the dinners in the body', () => {
    const dinner = (title: string) => ({ recipe_id: title, title, day: null, why: '', uses_soon: [] });
    const push = askedReadyPush('plan', 'job-1', { wishes: null, dinners: ['Tinga', 'Lentil soup', 'Pasta', 'Curry'].map(dinner), note: null }, null);
    expect(push).toEqual({ title: 'Your week: 4 dinners', body: 'Tinga · Lentil soup · Pasta · Curry', data: { jobId: 'job-1', kind: 'plan' } });
    expect(askedReadyPush('plan', 'job-1', { wishes: null, dinners: [dinner('Tinga')], note: null }, null).title).toBe('Your week: 1 dinner');
  });

  it('ask: the first ~60 characters of the answer', () => {
    const answer = 'You can make the spinach omelette tonight: everything is at home, and it takes fifteen minutes.';
    const push = askedReadyPush('ask', 'job-3', { answer, recipes: [], actions: [] }, null);
    expect(push.title).toBe('Mesa answered');
    expect(push.body).toBe('You can make the spinach omelette tonight: everything is…');
    expect(push.data).toEqual({ jobId: 'job-3', kind: 'ask' });
    expect(askedReadyPush('ask', 'job-3', { answer: 'Yes, rice is at home.' }, null).body).toBe('Yes, rice is at home.');
  });

  it('ask about a recipe: reopens that recipe', () => {
    const push = askedReadyPush('ask', 'job-4', { answer: 'Use Greek yogurt instead.', recipes: [], actions: [] }, 'r1');
    expect(push).toEqual({ title: 'Mesa answered', body: 'Use Greek yogurt instead.', data: { jobId: 'job-4', kind: 'ask', recipeId: 'r1' } });
  });
});
