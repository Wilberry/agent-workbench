Contributing to Agent Workbench

Thank you for your interest in contributing to Agent Workbench.

We welcome contributions of all kinds, including bug fixes, new features, documentation improvements, tests, and developer tooling enhancements.

Our goal is to build a high-quality open-source platform for building, evaluating, observing, and deploying AI agents.

---

Getting Started

Prerequisites

Before contributing, ensure you have:

- Node.js 22+
- pnpm 10+
- Git
- A Supabase account

Docker is required only for local Supabase development. Hosted Supabase development works via `.env` configuration.

---

Development Setup

Clone the repository:

git clone https://github.com/<your-username>/agent-workbench.git
cd agent-workbench

Install dependencies:

pnpm install

For local development details and Supabase setup, see `docs/local-development.md`.

Start local development:

pnpm dev

---

Branching Strategy

Create a new branch for every contribution.

Branch naming conventions:

feature/add-trace-explorer
feature/mcp-registry

fix/auth-redirect
fix/evaluation-bug

docs/update-readme

refactor/runtime-service

Avoid committing directly to the main branch.

---

Coding Standards

TypeScript

- Use strict TypeScript mode.
- Avoid the "any" type whenever possible.
- Prefer explicit types over implicit behavior.

Code Style

- Keep functions focused and small.
- Write self-documenting code.
- Prefer composition over inheritance.
- Use meaningful variable names.

Architecture

Contributors should follow the project's modular architecture:

apps/
packages/
infrastructure/
docs/

Avoid introducing tight coupling between packages.

---

Commit Messages

Use clear, descriptive commit messages.

Examples:

Add trace explorer filters

Implement evaluation result storage

Fix authentication redirect issue

Update project documentation

Avoid:

Fix stuff

Update files

Changes

---

Pull Requests

Before opening a pull request:

- Ensure tests pass.
- Ensure linting passes.
- Update documentation when necessary.
- Add tests for new functionality.

Pull requests should include:

- Summary of changes
- Motivation
- Screenshots (if applicable)
- Related issue references

---

Testing

All contributions should include appropriate test coverage.

Run the hermetic contributor checks without service credentials:

```bash
pnpm validate
```

Unit Tests

pnpm test

Integration Tests

pnpm test:integration

Integration, security, and reliability suites require the external environment
documented in `docs/local-development.md`. `pnpm test:all` runs all Vitest
suites and is not hermetic.

End-to-End Tests

pnpm test:e2e

---

Documentation

Documentation is a first-class part of the project.

If your contribution changes behavior, APIs, workflows, or architecture, please update the relevant documentation.

Documentation contributions are always welcome.

---

Reporting Bugs

When reporting a bug, please include:

- Description
- Expected behavior
- Actual behavior
- Steps to reproduce
- Environment details

Creating a minimal reproducible example is highly encouraged.

---

Feature Requests

Feature requests should include:

- Problem statement
- Proposed solution
- Alternative approaches considered
- Potential implementation details

---

Security Issues

Please do not disclose security vulnerabilities publicly.

Instead, follow the process described in SECURITY.md.

---

Code of Conduct

By participating in this project, you agree to abide by the Code of Conduct.

Please read CODE_OF_CONDUCT.md before contributing.

---

Questions

If you have questions about contributing, feel free to open a discussion or issue.

We appreciate your time and effort in helping make Agent Workbench better.
