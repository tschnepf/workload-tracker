Gmail SMTP setup for Workload Tracker

Overview
- Uses Django SMTP backend configured via environment variables.
- Recommended for quick start and low-volume emails (invites, password resets).
- For Gmail, use a Google App Password (requires 2FA) — do not use your normal password.

1) Create an App Password
- Enable 2‑Step Verification on your Google account.
- Visit Google Account → Security → App passwords → Create new.
- Choose App: Mail, Device: Other, copy the 16‑character password.

2) Set environment variables (e.g., in .env)

EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=true
EMAIL_HOST_USER=youraccount@gmail.com
EMAIL_HOST_PASSWORD=your-16-character-app-password
DEFAULT_FROM_EMAIL=Workload Tracker <youraccount@gmail.com>
SERVER_EMAIL=youraccount@gmail.com
EMAIL_TIMEOUT=10

Notes
- In development without these vars, the backend uses the console backend (prints emails to logs).
- If you see “534-5.7.9 Application-specific password required”, your app password is missing/invalid.

3) Restart backend
- Rebuild or restart the backend service for env changes to take effect.

4) Send a test email
- Inside the backend container or virtualenv:
  python manage.py send_test_email you@example.com

5) Next steps
- Once SMTP is verified, wire signup invitations and password reset flows using Django views.

