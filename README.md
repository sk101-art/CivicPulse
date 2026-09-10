# CivicPulse

> A civic issue reporting and municipal operations platform connecting residents with authorities through geospatial intelligence, AI-assisted prioritization, and transparent resolution workflows.

CivicPulse is a two-sided civic operations system: residents report and validate local infrastructure issues, while authorities triage, assign, monitor, and resolve those reports through a traceable workflow.

## Product flow

```text
Citizen report
      │
      ▼
Category + location + evidence
      │
      ▼
AI priority scoring and department routing
      │
      ▼
Authority confirmation and assignment
      │
      ▼
Field resolution + verification
      │
      ▼
Community visibility and reputation updates
```

## Capabilities

### Citizen experience

- Report potholes, drainage issues, streetlights, sidewalks, traffic signs, graffiti, trash, and other civic problems.
- Submit descriptions, locations, and optional photographic evidence.
- Discover nearby issues through interactive maps.
- Vote on and comment on community reports.
- Track report status and resolution progress.
- Earn reputation points and progress through citizen tiers.
- Support local client persistence through IndexedDB.

### Authority operations

- Review incoming reports through an operations dashboard.
- Prioritize issues with AI-assisted scores and civic impact signals.
- Route work to the appropriate department.
- Assign personnel and track SLA-aware workflows.
- Monitor open, confirmed, assigned, in-progress, resolved, and rejected reports.
- Record resolution details and completion evidence.

### Geospatial intelligence

- Map civic reports with Leaflet and React-Leaflet.
- Visualize hazards and report locations.
- Detect route intersections with hazard buffers.
- Surface dynamic detours for safer navigation.

## Technology

| Layer | Technology |
| --- | --- |
| Application | Next.js App Router, React, TypeScript |
| Styling | Tailwind CSS |
| Interaction | Framer Motion, Lucide React, Sonner |
| Maps | Leaflet, React-Leaflet |
| Authentication | NextAuth.js |
| Database | PostgreSQL |
| ORM | Prisma with the PostgreSQL adapter |
| Client persistence | IndexedDB through `idb` |
| AI | Local Ollama inference |
| Testing | Playwright |
| Tooling | ESLint, TypeScript, Prisma, TSX |

## Data model

The Prisma schema models the full civic workflow:

- `User` and `CitizenProfile` manage identity, roles, verification, and reputation.
- `Department` and `Personnel` represent municipal ownership and field staff.
- `Report` stores issue details, coordinates, priority, status, evidence, and SLA state.
- `Assignment` tracks personnel work and completion.
- `Vote`, `Comment`, and `PointLog` support community participation.

Report statuses follow:

`OPEN` → `CONFIRMED` → `ASSIGNED` → `IN_PROGRESS` → `RESOLVED`

Reports may also be marked `REJECTED`.

## Getting started

### Prerequisites

- Node.js 20+
- npm
- PostgreSQL
- Environment variables for the database and authentication
- Local Ollama if AI prioritization is enabled

### Install

```bash
npm install
```

### Configure the environment

Create the environment file expected by the application and provide a PostgreSQL connection string and authentication secrets. Keep credentials outside version control.

### Prepare Prisma

```bash
npx prisma generate
npx prisma migrate dev
```

Use the deployment-safe migration workflow when working against a production database.

### Start the application

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The root route redirects to `/login`.

## Available scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |

## Testing

```bash
npm run lint
npm run build
npx playwright test
```

Run Playwright tests after starting the application and configuring a test database.

## Security and operations notes

- Keep database credentials, authentication secrets, and provider tokens out of Git.
- Enforce server-side authorization for every citizen and authority mutation.
- Treat AI priority scores as decision support, not autonomous municipal judgment.
- Validate uploaded media, coordinates, and user-generated text at API boundaries.
- Use least-privilege database credentials in deployment environments.
- Configure production cookies, rate limits, logging, monitoring, and error handling before public launch.

## Project status

CivicPulse is an active application prototype. Product routes, environment variables, and deployment details may evolve as the civic workflow matures.

## License

No license file is currently included. Add a license before distributing CivicPulse publicly.
