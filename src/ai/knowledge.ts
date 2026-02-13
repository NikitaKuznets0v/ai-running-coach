import fs from 'node:fs';
import path from 'node:path';

type Knowledge = {
  trainingTypes: Record<string, any>;
  paceZones: Record<string, any>;
  coreRules: Record<string, any>;
  goalTemplates: Record<string, any>;
  levelParameters: Record<string, any>;
};

let cached: Knowledge | null = null;

function loadJson(file: string) {
  const p = path.join(process.cwd(), 'docs', 'coach-knowledge', file);
  const raw = fs.readFileSync(p, 'utf-8');
  return JSON.parse(raw);
}

export function getKnowledge(): Knowledge {
  if (cached) return cached;
  cached = {
    trainingTypes: loadJson('training-types.json'),
    paceZones: loadJson('pace-zones.json'),
    coreRules: loadJson('core-rules.json'),
    goalTemplates: loadJson('goal-templates.json'),
    levelParameters: loadJson('level-parameters.json')
  };
  return cached;
}
