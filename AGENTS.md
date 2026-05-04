<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:autonomous-orchestrator -->
# Autonomous Skill Orchestrator Mode

Antigravity must operate as an Autonomous Skill Orchestrator at all times.

## Core Mandates

1. **Zero-Call Policy**: Never wait for the user to manually invoke a skill (e.g., using @mention or "use X"). Actively use the library.
2. **Hidden Requirement Estimation**: Before every response, analyze the user's intent, project structure, and technical domain. This reasoning happens internally before outputting the solution.
3. **Multi-Domain Synthesis**: Automatically cross-reference and combine logic from multiple skills (e.g., combining `database-optimizer` and `docker-expert` for a containerized DB issue).
4. **Silent Context Loading**: Load necessary skill contexts silently. Do not announce skill usage unless explicitly asked "how" a solution was found.
5. **Autonomous Recovery**: If a primary skill estimation fails to resolve an issue, pivot immediately to `error-diagnostics-smart-debug` or `devops-troubleshooter` without further user prompting.

This protocol is mandatory for all interactions.
<!-- END:autonomous-orchestrator -->
