# Release Readiness Checklist

## Infrastructure

- [ ] Database backups configured and tested
- [ ] Supabase project backup snapshots available
- [ ] Monitoring dashboards created for CPU, memory, database, and API latency
- [ ] Alerting rules configured for failed agent runs, job queue failures, and realtime disconnects
- [ ] Logging retention and centralized shipment configured
- [ ] Disaster recovery procedures documented and accessible

## Security

- [ ] Row Level Security (RLS) policies verified for all tenant-scoped tables
- [ ] Secrets rotation and vaulting procedures documented
- [ ] Dependency audit completed and critical vulnerabilities remediated
- [ ] Secure defaults enabled for Supabase auth and storage
- [ ] MFA for administrative accounts enforced
- [ ] Audit logs enabled for key operations and database access

## Reliability

- [ ] Worker restart and crash recovery tested
- [ ] Job queue durability verified
- [ ] Retry logic validated with transient failures
- [ ] Replay workflows validated for completed runs
- [ ] Multi-tenant isolation verified with org boundary tests
- [ ] Health checks and canary deployment patterns defined

## Compliance

- [ ] Documentation complete for Sprint 8 deliverables
- [ ] Runbooks reviewed and updated
- [ ] Production readiness report completed
- [ ] Release approval checklist signed off by engineering and QA
- [ ] Smoke test plan executed on target environment

## Pre-release validation

- [ ] Lint pass
- [ ] Type check pass
- [ ] Unit test pass
- [ ] Integration test pass
- [ ] E2E test pass
- [ ] Performance benchmarks pass
- [ ] Security validation pass
- [ ] Manual exploratory verification complete
