---
bump: minor
---
The app version is shown in the sidebar and in the Backoffice Sistem panel together with the API version, commit and database engine (with a warning when the web app and API versions differ); sign-in screens now scroll on small phones and with the keyboard open; and irisctl migrate-to-postgres -check reports foreign-key violations, which the migration now refuses up front with the cleanup statement instead of failing mid-copy.
