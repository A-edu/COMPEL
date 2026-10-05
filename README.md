# COMPEL

**Multi-agent PDPL compliance verification for inter-governmental data-sharing requests**

SWE 444 Software Construction Laboratory, Section 94390
King Saud University, College of Computer and Information Sciences, Department of Software Engineering
Instructor: Dr. Abdulaziz Alrashidi | Fall 2026

## What is COMPEL?

Saudi Arabia's Personal Data Protection Law (PDPL) has been fully enforceable since 14 September 2024. When one government entity shares personal data with another, a compliance officer has to confirm the sharing is lawful. Today they do it by hand: they read each document, compare it against PDPL articles, and write a justification. It is slow, it does not scale, and two officers can reach different conclusions on the same request.

COMPEL is a web-based review console, built on an API, that does the first pass of that review. It reads the documents submitted for a request, checks them against the PDPL and its Implementing Regulation, and either clears the request or sends it to a human officer with the evidence already collected.

The system reviews documentation only. It never accesses the underlying personal data.

## How it works

The requesting entity submits a data-sharing request form. The providing entity submits a Record of Processing Activities (RoPA) entry and its position on the request (endorse or object). Three single-purpose agents then process them:

| Agent | Job |
|---|---|
| **Extract** | Pulls out the legally relevant fields (purpose, legal basis, data categories, retention period) once, so later checks reuse them. |
| **Compare** | Runs field-level checks against specific PDPL clauses, cross-document consistency checks, and a purpose compatibility check between the requesting entity's purpose and the original collection purpose. |
| **Decide** | Auto-clears a request only if every check passes and the providing entity endorsed it. Otherwise it flags the request for human review and writes a report that traces each finding to its clause. |

Two principles shape the design:

- **A human has the final say.** The system never rejects a request on its own. Anything ambiguous, inconsistent or incompatible goes to a compliance officer.
- **Everything is traceable.** Every conclusion points to a PDPL clause, and every report and decision is stored in an audit trail.

## Users

- **Requesting entity DPOs** submit data-sharing requests and supporting documents.
- **Providing entity DPOs** submit the RoPA entry and record their position.
- **Compliance/security officers** review flagged and pending requests and record the final approve or reject decision.

Each user type signs in with an OTP, and each entity can only see its own requests and documents.

## Tech stack

| Category | Tools |
|---|---|
| Front end | React 19, Next.js, TypeScript 5, Tailwind CSS 4 |
| Back end | Node.js 24, NestJS 12, TypeScript 5 |
| Database | PostgreSQL 18 |
| Testing | Vitest 3 (unit and integration), Playwright (end-to-end), k6 (load) |
| Hosting | Replit / Vercel |
| Version control | Git, GitHub |

## Roadmap

| Sprint | Dates | Focus |
|---|---|---|
| 0 | 20 Sep to 5 Oct 2026 | Planning: backlog, environment, architecture, roadmap |
| 1 | 6 Oct to 19 Oct 2026 | Secure intake and extraction: repository and environment setup, OTP login for all user types, data isolation, request and RoPA submission, field extraction |
| 2 | 20 Oct to 2 Nov 2026 | Verification, decision and review: compliance, consistency and purpose checks, auto-clear or flag outcome, reports, reviewer queue and manual decision, notifications |

Target release: November 2026.

## Repository layout

The layout will be finalised in Sprint 1. The planned structure is:

```
.
├── frontend/     # Next.js review console and entity screens
├── backend/      # NestJS API, agents, checks and audit writes
├── docs/         # Sprint reports and design files
└── README.md
```

## Getting started

Setup instructions will be added once the environment is in place during Sprint 1. They will cover prerequisites (Node.js 24, PostgreSQL 18), environment variables, and how to run the app and the tests.

## Project links

- Trello board: https://trello.com/b/xApugHVo/sprint-0-pdpl-compliance-board
## Team

| Name | Student ID |
|---|---|
| Abdulaziz Alfuraih | 445101582 |
| Naif Alsmari | 445102991 |
| Abdulmajeed Alnashwan | 445102167 |
| Khalid Alhaidary | 445101067 |

## References

- Saudi Data and Artificial Intelligence Authority. (2023). *Personal Data Protection Law*. https://sdaia.gov.sa/en/SDAIA/about/Documents/PersonalDataProtectionLaw.pdf
- Saudi Data and Artificial Intelligence Authority. (2023). *Implementing regulation of the Personal Data Protection Law*. https://sdaia.gov.sa/en/SDAIA/about/Documents/ExecutiveRegulationsEn.pdf

## License

Academic coursework for SWE 444 at King Saud University. Not for production use.
