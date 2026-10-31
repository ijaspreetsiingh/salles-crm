# Traveldesk Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

Please report security vulnerabilities to **security@yourdomain.com**.

Do not disclose vulnerabilities publicly until they have been addressed.

## Security Features

### Authentication & Authorization
- JWT access tokens (15 min TTL) + refresh tokens (30 day TTL)
- Refresh token rotation with hash storage
- API key authentication with prefix `tdk_`
- Role-Based Access Control (RBAC) with 6 built-in roles
- Branch scoping for multi-office organizations
- Per-endpoint permission middleware

### Transport Security
- HTTPS enforcement via HSTS (1 year, production)
- TLS 1.2+ only with strong cipher suites
- HTTP/2 support

### Content Security
- Content Security Policy (CSP) restricting scripts, styles, fonts, images
- X-Frame-Options: DENY (clickjacking protection)
- X-Content-Type-Options: nosniff (MIME sniffing protection)
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: disables camera, mic, geolocation, payment, USB, sensors

### Data Protection
- bcrypt password hashing
- JWT secrets validated (min 32 chars in production)
- Backup encryption at rest (optional, via BACKUP_ENCRYPTION_KEY)
- Soft deletes with audit trail for all record changes

### Rate Limiting
- General API: 5000 requests / 15 min
- Auth endpoints: 40 requests / 15 min

### Audit Trail
- Every create/update/delete/export action logged with actor, timestamp, IP
- Workflow execution history
- API key last-used tracking

## Deployment Checklist

- [ ] Set NODE_ENV=production
- [ ] Generate strong JWT_ACCESS_SECRET and JWT_REFRESH_SECRET (32+ chars)
- [ ] Set CORS_ORIGINS to your actual domain(s)
- [ ] Configure PostgreSQL (not SQLite for production)
- [ ] Configure SMTP for email delivery
- [ ] Set up SSL/TLS via Let's Encrypt (certbot)
- [ ] Set BACKUP_ENCRYPTION_KEY for encrypted backups
- [ ] Change default admin passwords
- [ ] Configure PLATFORM_ADMIN_EMAILS
- [ ] Set up daily backup cron job
- [ ] Monitor /api/v1/health endpoint
