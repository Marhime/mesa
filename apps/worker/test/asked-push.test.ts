import { describe, expect, it } from 'vitest';

import { askedReadyPush } from '../src/ready-pushes';

describe('askedReadyPush', () => {
  it('says how many new recipe videos a creator has, and reopens the job', () => {
    const push = askedReadyPush(
      'creator',
      'job-1',
      {
        creator: { name: 'Food is Love', url: 'https://www.youtube.com/channel/UC1', channel_id: 'UC1', platform: 'youtube' },
        videos: [
          { url: 'a', title: 'A', dish: null, views: 1, duration_s: 300, thumbnail: null, saved: false },
          { url: 'b', title: 'B', dish: null, views: 1, duration_s: 300, thumbnail: null, saved: true },
        ],
      },
      null,
    );
    expect(push.title).toBe('Food is Love: 1 recipe to pick');
    expect(push.data).toEqual({ jobId: 'job-1', kind: 'creator' });
  });

  it('lists the ideas, and opens the recipe for a translation', () => {
    const ideas = askedReadyPush('idea', 'job-2', { food: 'Tomato', ideas: [{ title: 'Pico de gallo', uses: [], to_buy: [], minutes: 10, why: '' }] }, null);
    expect(ideas.title).toBe('Ideas for Tomato');
    expect(ideas.body).toBe('Pico de gallo');
    expect(askedReadyPush('translate', 'job-3', null, 'recipe-9').data).toEqual({ jobId: 'job-3', kind: 'translate', recipeId: 'recipe-9' });
  });
});
