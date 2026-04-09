import { describe, test, expect } from '@jest/globals';
import { computeTaskScore } from '../backend/src/services/tasks.js';

describe('Task Recommendation Scoring', () => {
  test('overdue task gets highest time window score', () => {
    const task = { due_window_end: new Date(Date.now() - 3600000).toISOString() };
    const metrics = { active_task_count: 0, reputation_score: 50 };
    const score = computeTaskScore(task, metrics);
    expect(score.breakdown.time_window).toBe(100);
  });

  test('task due in 30 min gets 90 time score', () => {
    const task = { due_window_end: new Date(Date.now() + 30 * 60000).toISOString() };
    const metrics = { active_task_count: 0, reputation_score: 50 };
    const score = computeTaskScore(task, metrics);
    expect(score.breakdown.time_window).toBe(90);
  });

  test('no due window gives default 50', () => {
    const task = {};
    const metrics = { active_task_count: 0, reputation_score: 50 };
    const score = computeTaskScore(task, metrics);
    expect(score.breakdown.time_window).toBe(50);
  });

  test('zero active tasks gives 100 workload score', () => {
    const task = {};
    const metrics = { active_task_count: 0, reputation_score: 50 };
    const score = computeTaskScore(task, metrics);
    expect(score.breakdown.workload).toBe(100);
  });

  test('many active tasks gives low workload score', () => {
    const task = {};
    const metrics = { active_task_count: 10, reputation_score: 50 };
    const score = computeTaskScore(task, metrics);
    expect(score.breakdown.workload).toBe(10);
  });

  test('reputation score passes through', () => {
    const task = {};
    const metrics = { active_task_count: 0, reputation_score: 85 };
    const score = computeTaskScore(task, metrics);
    expect(score.breakdown.reputation).toBe(85);
  });

  test('total score is weighted sum', () => {
    const task = {};
    const metrics = { active_task_count: 0, reputation_score: 100 };
    const weights = { time_window: 0.4, workload: 0.3, reputation: 0.3 };
    const score = computeTaskScore(task, metrics, weights);
    // time=50, workload=100, reputation=100
    // 50*0.4 + 100*0.3 + 100*0.3 = 20 + 30 + 30 = 80
    expect(score.total).toBe(80);
  });

  test('custom weights are applied', () => {
    const task = {};
    const metrics = { active_task_count: 0, reputation_score: 0 };
    const weights = { time_window: 1.0, workload: 0, reputation: 0 };
    const score = computeTaskScore(task, metrics, weights);
    expect(score.total).toBe(50); // only time window, default 50
  });
});
