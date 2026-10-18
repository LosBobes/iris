---
bump: minor
---
Sign-in sessions now stay alive while in use (12 h idle, 24 h at most) and "Zapamti me na ovom uređaju" keeps you signed in for up to 30 days. Session tokens are stored hashed (everyone signs in once more after the upgrade), failed sign-ins are rate limited, a password change signs that user out elsewhere, cross-site write requests are refused, and IRIS_SESSION_SECRET is no longer required.
