export const EXTRACT_PROMPTS = {
  level: 'Extract level from user message. Return JSON: {"level":"beginner|intermediate|advanced"} or {} if unknown.',
  age: 'Extract age as integer. Return JSON: {"age": number} or {} if unknown.',
  height_weight: 'Extract height_cm and weight_kg. Return JSON: {"height_cm": number, "weight_kg": number} (nullable) or {}.',
  resting_hr: 'Extract resting_hr. If user does not know, return {"resting_hr": null}.',
  pace5k: 'Extract 5k time or pace. Return JSON: {"current_5k_pace_seconds": number} or {}.',
  lab_testing: 'Extract has_lab_testing, vo2max, lthr. Return JSON: {"has_lab_testing": boolean, "vo2max": number|null, "lthr": number|null} or {}.',
  training_freq: 'Extract weekly_runs (1-7) and preferred_training_days (free text). Return JSON: {"weekly_runs": number, "preferred_training_days": string|null} or {}.',
  race_details: 'Extract race_distance (5k|10k|half|marathon|custom), race_distance_km, race_date (YYYY-MM-DD), target_time_seconds. Return JSON with available fields.'
};
