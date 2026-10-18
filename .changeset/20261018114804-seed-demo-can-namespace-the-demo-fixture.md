---
bump: minor
---
seed-demo can namespace the demo fixture record ids with -id-prefix (or IRIS_DEMO_ID_PREFIX), so the demo organization can be seeded into a database that already holds another tenant using the same fixed fixture ids (e.g. the real Grafika Čobanović data, whose customers are also cust-N) without an id collision. Default behavior is unchanged.
