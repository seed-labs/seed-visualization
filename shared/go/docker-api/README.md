# Docker API Go Module

Go implementation of the shared Docker API capability for the SEED visualization tooling.

The language-neutral schemas live in `shared/schemas/docker-api/`.

The goal is not to wrap every Docker API endpoint. The shared contract should expose only the Docker operations that SEED tooling actually needs.

## Boundary

This module owns Docker daemon communication:

- connect to Docker through Unix socket or future TCP endpoint;
- list running containers;
- inspect a container;
- expose stable DTOs used by other components.

It should not own higher-level SEED semantics such as:

- container-to-veth mapping;
- eBPF attach logic;
- topology visualization;
- packet filtering;
- frontend event models.

Those belong to the caller. For example, `traffic-observer` uses this package to get container PID/labels/network settings, then performs netns/veth discovery locally.

## Current operations

| Operation | Docker endpoint | Used by |
|---|---|---|
| `ListContainers` | `GET /containers/json` | traffic-observer |
| `InspectContainer` | `GET /containers/{id}/json` | traffic-observer |

## Language bindings

The Go binding is implemented first because `traffic-observer` is Go and needs direct Unix socket access.

TypeScript and Python bindings should follow the same DTO shape as the schemas under `shared/schemas/docker-api/`.

## Versioning guideline

Treat this package as a small internal contract:

- additive fields are safe;
- renaming/removing fields should be avoided;
- keep raw Docker field names at the boundary where useful, but expose stable typed wrappers in each language.
