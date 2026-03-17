---
description: Multi-agent review of the current architecture evolvability
argument-hint: Optional scope or subsystem to review
allowed-tools: ["Read", "Grep", "Glob", "TodoWrite", "Task", "Skill"]
---

# Evolution Architecture Review

**FIRST: Load the `evolution-architecture-review` skill** using the Skill tool.

Analyze the repository's architecture evolvability.

Scope from user: `$ARGUMENTS`

## Process

1. Create a todo list for discovery, parallel review, synthesis, and final recommendations.
2. Read the core architecture and fitness documents identified by the skill.
3. Launch 4 parallel agents with the `Task` tool. Each agent must return only:
   - concrete findings
   - supporting file paths
   - top risks
   - no speculation without evidence

### Agent 1: Boundaries
Review module boundaries, ownership seams, dependency direction, and semantic duplication.

### Agent 2: Runtime Flow
Review orchestration, lifecycle, task flow, failure handling, tracing, and operational visibility.

### Agent 3: Fitness
Review tests, hard gates, parity checks, contracts, and other executable architecture constraints.

### Agent 4: Evolution Path
Review where the system can evolve incrementally, what to avoid, and what smallest safe next steps exist.

4. Read any additional files needed to verify high-signal findings from the agents.
5. Synthesize the result into one architecture review.

## Output Requirements

- Use the structure defined in the skill.
- Separate facts from inferences.
- Prefer incremental evolution recommendations.
- Suggest concrete fitness functions when gaps exist.
- Cite repository paths for every major claim.
