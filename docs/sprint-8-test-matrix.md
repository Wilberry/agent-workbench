# Sprint 8 Test Matrix

This test matrix captures Sprint 8 end-to-end validation scenarios for Agent Workbench.

## Agent Lifecycle

| Test ID | Feature | Preconditions | Steps | Expected Result | Failure Conditions | Priority | Automation Status |
|---|---|---|---|---|---|---|---|
| S8-E2E-001 | Create Agent | Authenticated org member | Navigate to agent creation, enter name/description/prompt, save | Agent appears in list and is persisted in DB | Agent not saved or visible | High | Automated |
| S8-E2E-002 | Update Agent | Existing agent | Open agent edit page, change prompt/model, save | Updated values persist | Change lost or error | High | Automated |
| S8-E2E-003 | Delete Agent | Agent exists | Delete agent, confirm | Agent removed from list, cannot access | Agent still accessible | High | Automated |
| S8-E2E-004 | Archive Agent | Agent exists | Archive agent via UI or API | Agent marked archived and hidden | Agent active or state mismatch | Medium | Automated |
| S8-E2E-005 | Restore Agent | Archived agent | Restore from archive list | Agent visible in active list | Agent remains archived | Medium | Automated |

## Conversation Lifecycle

| S8-E2E-006 | Create Conversation | Existing agent and user | Open agent page, start chat | Conversation created in DB | No conversation record | High | Automated |
| S8-E2E-007 | Send Message | Open chat | Type message, send | Message saved, displayed in UI | Missing message or error | High | Automated |
| S8-E2E-008 | Receive Response | Active conversation | Send message and await response | Assistant response appears | No response or timeout | High | Automated |
| S8-E2E-009 | Message Persistence | Conversation with messages | Reload page | All messages reload correctly | Missing messages | High | Automated |
| S8-E2E-010 | Conversation History | Multiple messages exist | View transcript | Full history visible | History truncated | Medium | Automated |

## Agent Run Lifecycle

| S8-E2E-011 | Start Run | Conversation exists | Enqueue run through API or UI | Run created with pending status | Run not created | High | Automated |
| S8-E2E-012 | Execute Run | Pending run | Process run job | Status becomes completed | Run fails unexpectedly | High | Automated |
| S8-E2E-013 | Complete Run | Active workflow | Observe run completion event | Run status completed | Stuck in running state | High | Automated |
| S8-E2E-014 | Failed Run | Faulty tool or workflow | Force tool failure | Run status failed, error persisted | Run incorrectly marked success | High | Automated |
| S8-E2E-015 | Retry Run | Failed run exists | Re-enqueue or retry | Run reprocesses and updates status | Retry not allowed or fails | Medium | Automated |
| S8-E2E-016 | Replay Run | Completed run exists | Open replay page | Execution trace loads | Replay data missing | Medium | Automated |

## Tool Execution

| S8-E2E-017 | Single Tool | Registered tool exists | Trigger tool call in agent response | Tool output used | Tool call ignored | High | Automated |
| S8-E2E-018 | Multiple Tools | Workflow calls several tools | Trigger tool sequence | All tool results recorded | Missing tool execution | High | Automated |
| S8-E2E-019 | Sequential Calls | Agent requests tools in order | Execute one tool after another | System follows sequence | Out-of-order execution | Medium | Automated |
| S8-E2E-020 | Parallel Calls | Multiple tools invoked | Simulate concurrent tool requests | Each tool result captured | Race conditions break result | Medium | Automated |
| S8-E2E-021 | Tool Failure | External tool returns error | Model handles failure | Run fails gracefully | Crash or uncaught error | High | Automated |
| S8-E2E-022 | Timeout Handling | External service slow | Worker retry/backoff triggers | Timeout is handled | Hang or infinite wait | High | Automated |

## Tracing

| S8-E2E-023 | Trace Creation | Run processed | Check run trace | Trace exists in DB | No trace recorded | High | Automated |
| S8-E2E-024 | Step Recording | Multi-agent workflow | Verify steps saved | Each role step recorded | Missing step entries | High | Automated |
| S8-E2E-025 | Error Recording | Step fails | Inspect error trace | Error details logged | Missing error details | High | Automated |
| S8-E2E-026 | Replay Trace | Completed run | Open replay page | Trace visualization appears | Trace not rendered | Medium | Automated |

## Multi-Tenant Isolation

| S8-E2E-027 | Org A access | Two orgs exist | Access resource from org A | Allowed | Denied incorrectly | Critical | Automated |
| S8-E2E-028 | Org B access | Two orgs exist | Access resource from org B | Allowed | Denied incorrectly | Critical | Automated |
| S8-E2E-029 | Cross-org denial | Org A user tries org B resource | Attempt access | Access denied | Resource available | Critical | Automated |
| S8-E2E-030 | Shared resources validation | Shared tool agent exists | Access tool from both orgs if public | Correct access controls | Unauthorized access | High | Automated |

## UI Validation

| S8-E2E-031 | Dashboard | Logged in user | Open dashboard | Metrics visible | Missing dashboard data | Medium | Automated |
| S8-E2E-032 | Agent List | User has agents | Open list page | Agents listed | Empty list incorrectly | Medium | Automated |
| S8-E2E-033 | Agent Detail | Agent exists | Open detail page | Agent data shown | Missing prompt/model | Medium | Automated |
| S8-E2E-034 | Run Detail | Run exists | Open run page | Run status and trace visible | Missing run details | Medium | Automated |
| S8-E2E-035 | Trace Timeline | Run has steps | View timeline | Timeline updates | No timeline update | Medium | Automated |

## Additional Validation Scenarios

| S8-E2E-036 | Org Role Restriction | User with limited role | Attempt admin action | Action blocked | Unauthorized action succeeds | High | Automated |
| S8-E2E-037 | Billing Quota | Org on free tier with max runs | Start new run | Quota rejected | Run allowed | High | Automated |
| S8-E2E-038 | Marketplace Publish | Agent published | External org views agent | Visibility enforced | Incorrect exposure | Medium | Automated |
| S8-E2E-039 | Versioned Agent | Agent version exists | Execute version workflow | Runs follow version workflow | Default workflow used | High | Automated |
| S8-E2E-040 | Memory Retrieval | Conversation with history | Start run | Relevant memory reused | Memory missing | Medium | Automated |
| S8-E2E-041 | Session Expiry | User session invalid | Access UI | Redirect to login | Access granted | High | Automated |
| S8-E2E-042 | API Validation | Invalid payload | Call API | Validation error | Crash or server error | High | Automated |
| S8-E2E-043 | Rate Limit Guard | Many requests | Trigger endpoints | Graceful error | Throttling bypassed | Medium | Automated |
| S8-E2E-044 | Audit Logging | Run events occur | Inspect logs | Event exists | No audit entry | Medium | Automated |
| S8-E2E-045 | Backup Workflow | DB backup available | Validate restore process | Restore succeeds | Backup invalid | Medium | Manual |
| S8-E2E-046 | Deploy Canary | New release deployed | Verify smoke tests | Release stable | Regression found | Medium | Manual |
| S8-E2E-047 | Secret Rotation | Secrets replaced | Service restarted | No failure | Secret leak | Medium | Manual |
| S8-E2E-048 | Incident Response | Worker fails | Failover triggers | Recovery path executes | Downtime persists | Medium | Manual |
| S8-E2E-049 | Documentation | Release docs present | Review docs | Complete and accurate | Missing docs | Medium | Manual |
| S8-E2E-050 | Production Readiness | All tests pass | Review checklist | Green light | Blocking findings | Critical | Manual |
