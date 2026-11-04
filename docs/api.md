# API overview

FastAPI provides OpenAPI documentation at `/docs` on the local development entry point.

| Endpoint | Purpose |
| --- | --- |
| GET `/v1/health` | API health |
| POST `/v1/devices` | Register an installation and obtain a device token |
| POST `/v1/analyze` | Interpret a typed or transcribed request |
| GET, POST `/v1/reminders` | List or create confirmed reminders |
| PATCH, DELETE `/v1/reminders/{id}` | Edit or delete reminders |
| POST `/v1/reminders/{id}/events` | Backend dose event API, separate from the app's local history |
| GET `/v1/languages`, GET `/v1/help` | Language metadata and command help |
| DELETE `/v1/me` | Delete server data associated with the device |

Use `Authorization: Bearer <device-token>` for protected routes. Device tokens belong in secure storage. The hosted wrapper also provides `/v1/ready`.
