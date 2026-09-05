# CAPACITY CONNECT

**Scientific Capacity Building and Readiness Platform** for the India Meteorological
Department (IMD) and the Ministry of Earth Sciences (MoES).

A modern, secure, professional, fully responsive web platform that transforms training into
**measurable scientific capability and operational readiness** — not a generic LMS.

## Tech Stack

- React 19 + Vite
- Tailwind CSS v4 (CSS-first `@theme` design system)
- React Router (with strict role-based routing)
- Lucide React icons
- Context API state management

## Getting Started

```bash
npm install
npm run dev       # start dev server
npm run build     # production build
npm run preview   # preview production build
npm run lint      # oxlint
```

## Demo Accounts

Use these credentials on the `/auth` page.

| Role    | Email                    | Password  | Status   |
| ------- | ------------------------ | --------- | -------- |
| Trainee | `trainee@capacity.gov.in`| `password`| Approved |
| Trainer | `trainer@capacity.gov.in`| `password`| Approved |
| Admin   | `admin@capacity.gov.in`  | `admin`    | Approved |
| Pending | `pending@capacity.gov.in`| `password`| Pending  |

- **Pending** accounts land on the Pending Approval page until an Admin approves them.
- **Unauthorized access** (e.g., trainee hitting `/admin`) is redirected and never exposes
  restricted modules.

## User Flows

### Trainee
1. **Home** — welcome hero, quick access, In Progress / **Explore Catalog** toggle,
   search + domain/difficulty filters, course cards, enrollment modal.
2. **Enrollment** — review syllabus, workflow preview (20:30:50 assessment, negative
   marking, ≥75% pass), confirm enrollment → auto-opens the Course Workspace.
3. **Course Workspace** — 7-stage tracked journey:
   Study Notes → Slide Decks → Video Lectures → Practice Sets → **Assessed (locked until
   learning complete)** → Mandatory Feedback → Verified Certificate (PDF export).
4. **Progress** — completion analytics, competency levels, assessment performance.
5. **Profile** — identity/readiness, badges, completed courses, certificates.

### Trainer
- Home (summary + quick actions), My Courses, Course Management (Details, Materials,
  Slide Decks, Videos, Trainees, **Question Bank**, Analytics), Profile.

### Admin
- Strategic overview, **Verification Queue** (approve/reject accounts), **Trainer-to-Subject
  Matching** (weighted engine), **Regional Competency Heatmap**, **Broadcast Center**.

## Key Utilities (`src/utils`)

- `examGenerator.js` — dynamic **20% Easy / 30% Medium / 50% Hard** assessment generator
  with randomized selection and option ordering.
- `scoreAssessment` — **+1 correct / −0.25 incorrect / 0 unattempted**, pass threshold ≥75%.
- `matchingAlgorithm.js` — weighted trainer-to-course match percentage.
- `pdfExport.js` — client-side certificate PDF export (print-to-PDF).

## Design

Soft muted blues (`#1F5F93`, `#4E84B7`), white cards, light blue-gray background
(`#F5F8FC`), subtle borders/shadows, rounded 8–12px components, and a calm, authoritative,
scientific aesthetic. Desktop-first with responsive tablet and mobile adaptations.
