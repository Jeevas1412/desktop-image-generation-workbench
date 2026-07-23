# Security Policy

## Supported versions

Only the latest released version will receive security fixes.

## Reporting a vulnerability

Do not include credentials, private host addresses, user images, prompts or model files in public issues. Report the affected version, a minimal reproduction that uses placeholders, impact and any suggested mitigation through the repository's private security reporting channel after it is enabled.

## Security design

- Renderer code runs with context isolation and no Node integration.
- Desktop IPC validates a fixed action and payload allowlist.
- Model downloads require known catalog entries, hashes and explicit confirmation.
- User prompts are not retained in audit logs by default; credential-like fields are redacted.
