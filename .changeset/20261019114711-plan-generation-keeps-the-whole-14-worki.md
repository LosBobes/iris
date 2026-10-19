---
bump: minor
---
Plan generation keeps the whole 14-working-day horizon on the plan (new horizonEnd field and admin GET /planning/plan/horizon grouped by day); the plan date remains what is published and shown. Planning a later day pins the still-open steps of the days published before it, and the forecast pins the published plans, so consecutive days and the forecast never contradict each other.
