# Security Policy

This is an academic project (PFE). It is not intended for production deployment without a proper security review.

## Reporting a vulnerability

Open a private GitHub issue or contact the repository owner directly via GitHub.

## Scope

- No public-facing deployment exists.
- `.env.example` credentials are placeholders for local development only — never use them in any deployed environment.
- The seed script creates accounts with predictable passwords (`Admin1234!`) — change all of them before any non-local deployment.
- JWT secrets, MinIO credentials, and database passwords in `.env.example` are examples only.
