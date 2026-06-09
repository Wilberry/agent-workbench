Security Policy

Supported Versions

Agent Workbench is currently under active development.

Security updates will be applied to the latest supported version.

Version| Supported
Latest| ✅
Older Versions| ❌

---

Reporting a Vulnerability

The security of Agent Workbench and its users is a top priority.

If you discover a security vulnerability, please do not disclose it publicly through GitHub issues, discussions, pull requests, or social media.

Instead, report the issue privately to the project maintainers.

When submitting a report, please include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Proof of concept (if available)
- Suggested remediation (optional)

We will acknowledge receipt of your report as quickly as possible and work to validate and address the issue.

---

Responsible Disclosure

We ask that security researchers:

- Provide reasonable time for investigation and remediation.
- Avoid accessing, modifying, or destroying data belonging to others.
- Avoid actions that could negatively impact users or infrastructure.
- Keep vulnerability details confidential until a fix is available.

We are committed to working collaboratively with researchers who act in good faith.

---

Security Principles

Agent Workbench is designed with the following security principles:

Authentication

- Secure user authentication through Supabase Auth
- JWT-based authorization
- Session management best practices

Authorization

- Row Level Security (RLS)
- Organization-level isolation
- Least-privilege access controls

Secrets Management

Sensitive credentials are never exposed to clients.

Examples include:

- OpenAI API keys
- Anthropic API keys
- Database credentials
- Service role keys

Secrets should be stored securely using environment variables and protected backend services.

Data Protection

- Encryption in transit
- Secure database access
- Controlled storage permissions
- Audit logging

API Security

- Request validation
- Rate limiting
- Input sanitization
- Access control enforcement

---

Security Best Practices for Contributors

Contributors should:

- Never commit secrets or credentials.
- Never commit API keys.
- Never commit service role keys.
- Use environment variables for sensitive configuration.
- Review dependencies for known vulnerabilities.
- Keep packages updated.

Before opening a pull request:

pnpm audit

and verify that no critical vulnerabilities are introduced.

---

Scope

This policy applies to:

- Source code
- Infrastructure configuration
- Documentation
- APIs
- SDKs
- MCP integrations
- Agent runtime components

---

Security Updates

Security fixes may be released outside of normal development cycles when necessary.

Users are encouraged to stay on the latest supported version.

---

Acknowledgements

We appreciate the efforts of security researchers and community members who help improve the safety and reliability of Agent Workbench.
