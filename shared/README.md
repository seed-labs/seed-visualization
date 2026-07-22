# Shared Modules

This directory contains reusable internal capabilities for the SEED visualization stack.

The important design rule is:

```text
shared/<language>/<library>
```

So `shared` is organized by implementation language first. This keeps each language's package-management conventions natural and avoids mixing Go/TS/Python project layouts inside one capability folder.

Examples:

```text
shared/
  go/
    docker-api/
    traffic-events/
    seed-metadata/
  ts/
    docker-api/
    traffic-events/
    seed-metadata/
  python/
    docker-api/
    traffic-events/
    seed-metadata/
  schemas/
    docker-api/
    traffic-events/
    seed-metadata/
```

## Directory meaning

| Path | Meaning |
|---|---|
| `go/<library>/` | Go module or package for a shared capability. |
| `ts/<library>/` | TypeScript package for a shared capability. |
| `python/<library>/` | Python package for a shared capability. |
| `schemas/<library>/` | Language-neutral DTO/schema definitions shared by all language implementations. |

Not every library needs every language on day one. Missing language implementations are fine. Placeholder directories should contain a short `README.md` explaining whether that binding is planned or intentionally absent.

## Boundary rule

Shared modules should expose stable, reusable primitives. They should not contain one application's business flow.

Good shared module responsibilities:

- Docker daemon client DTOs;
- packet event schemas;
- SEED metadata parsing;
- common time/event models;
- generated API clients.

Poor shared module responsibilities:

- eBPF attach policy;
- frontend UI state;
- one service's route handlers;
- experiment-specific orchestration.

For example, `shared/go/docker-api` owns Docker daemon communication for Go callers. `traffic-observer` still owns container netns/veth discovery because that is observer-specific host instrumentation logic.
