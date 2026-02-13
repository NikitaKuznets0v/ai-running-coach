import type { WorkoutType } from '../domain/plan-types.js';

export type PhaseName = 'base' | 'development' | 'stabilization' | 'taper';

export const PHASE_TEMPLATES: Record<string, Record<PhaseName, WorkoutType[]>> = {
  beginner: {
    base: ['easy_run', 'easy_run', 'long_run'],
    development: ['easy_run', 'long_run', 'easy_run', 'long_run'],
    stabilization: ['easy_run', 'long_run', 'easy_run'],
    taper: ['easy_run', 'easy_run']
  },
  intermediate: {
    base: ['easy_run', 'easy_run', 'long_run'],
    development: ['easy_run', 'tempo', 'long_run'],
    stabilization: ['easy_run', 'tempo', 'long_run'],
    taper: ['easy_run', 'easy_run', 'tempo']
  },
  advanced: {
    base: ['easy_run', 'tempo', 'long_run'],
    development: ['intervals', 'tempo', 'long_run'],
    stabilization: ['intervals', 'tempo', 'long_run'],
    taper: ['easy_run', 'tempo', 'long_run']
  }
};
