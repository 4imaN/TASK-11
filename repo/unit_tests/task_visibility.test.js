import { describe, test, expect } from '@jest/globals';
import { canUserSeeTask, computeTaskScore } from '../backend/src/services/tasks.js';

describe('Task Visibility (production canUserSeeTask)', () => {
  test('admin can see any task', () => {
    expect(canUserSeeTask({ assigned_user_id: 'other', status: 'accepted' }, 'me', true)).toBe(true);
    expect(canUserSeeTask({ assigned_user_id: null, status: 'open' }, 'me', true)).toBe(true);
  });

  test('non-admin can see own assigned task', () => {
    expect(canUserSeeTask({ assigned_user_id: 'user-1', status: 'assigned' }, 'user-1', false)).toBe(true);
  });

  test('non-admin can see open unassigned (grabbable) task', () => {
    expect(canUserSeeTask({ assigned_user_id: null, status: 'open' }, 'user-1', false)).toBe(true);
  });

  test('non-admin cannot see task assigned to someone else', () => {
    expect(canUserSeeTask({ assigned_user_id: 'user-2', status: 'accepted' }, 'user-1', false)).toBe(false);
  });

  test('non-admin cannot see completed task of another user', () => {
    expect(canUserSeeTask({ assigned_user_id: 'user-2', status: 'completed' }, 'user-1', false)).toBe(false);
  });
});

describe('Task Scoring (production computeTaskScore)', () => {
  const defaultWeights = { time_window: 0.4, workload: 0.3, reputation: 0.3 };
  const defaultWorker = { active_task_count: 0, reputation_score: 50 };

  test('returns object with total score', () => {
    const task = { due_window_end: new Date(Date.now() + 3600_000).toISOString(), priority: 5 };
    const score = computeTaskScore(task, defaultWorker, defaultWeights);
    expect(score).toHaveProperty('total');
    expect(typeof score.total).toBe('number');
  });

  test('scoring returns numeric total', () => {
    const task = { due_window_end: new Date(Date.now() + 3600_000).toISOString(), priority: 5 };
    const score = computeTaskScore(task, defaultWorker, defaultWeights);
    expect(typeof score.total).toBe('number');
    expect(score.total).toBeGreaterThanOrEqual(0);
  });
});
