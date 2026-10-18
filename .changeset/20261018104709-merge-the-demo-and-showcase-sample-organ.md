---
bump: major
---
Merge the demo and showcase sample organizations into one. seed-demo now builds a single "demo" organization with both the Procesi rada and Magacin modules on: the testdata/fixtures work orders plus process- and stock-driven sample content (four templates, eight orders, warehouse stock, an operater login). In production, where the server refuses to start on the demo admin/admin123 login, seed-demo requires strong passwords via IRIS_DEMO_ADMIN_PASSWORD and IRIS_DEMO_OPERATOR_PASSWORD (or -admin-password / -operator-password). The separate seed-showcase command and the IRIS_SEED_SHOWCASE / IRIS_SHOWCASE_* server flags are removed.
