# Local CI Runner

`local_ci.py` runs the repository's GitHub Actions workflow commands on a
development machine. It reads workflow files from `.github/workflows` and runs
their `run:` steps in the same working directories defined by the workflows.

Run all commands below from the repository root.

## Setup

Install the Python dependency:

```bash
python -m pip install -r test-ci-local/requirements.txt
```

The selected workflows may also require Node.js, pnpm, Go, Docker, or
Playwright. Setup actions in a workflow are converted into local version checks
and, where supported, missing-tool installation. Existing tools are retained
when their versions differ; the runner prints a warning instead of replacing
them.

## Basic usage

List available workflows and jobs:

```bash
python test-ci-local/local_ci.py --list
```

Run one workflow:

```bash
python test-ci-local/local_ci.py --workflow ci-internet-map-geographic.yaml
```

Run one job from a workflow:

```bash
python test-ci-local/local_ci.py \
  --workflow ci-internet-map-geographic.yaml \
  --job internet-map-geographic
```

Use `--list` to obtain the actual job IDs before using `--job`.

Run every workflow:

```bash
python test-ci-local/local_ci.py --all-workflows
```

Project workflows run first and `ci-docker-lifecycle.yaml` runs last. Running
every workflow can take a long time and may build or start Docker services.

Preview commands without executing them:

```bash
python test-ci-local/local_ci.py \
  --workflow ci-internet-map-geographic.yaml \
  --dry-run
```

## Selective execution

The following options skip categories of workflow steps:

| Option | Skipped steps |
| --- | --- |
| `--skip-install` | npm and pnpm dependency installation |
| `--skip-static` | lint, formatting, vet, static analysis, and eBPF compilation |
| `--skip-unit` | unit tests |
| `--skip-integration` | integration tests |
| `--skip-e2e` | Playwright and browser E2E tests |
| `--skip-build` | application build steps |
| `--skip-docker` | Docker build and lifecycle steps |
| `--no-tool-install` | installation of tools referenced by setup actions |

Examples:

```bash
python test-ci-local/local_ci.py \
  --workflow ci-internet-map-geographic.yaml \
  --skip-e2e

python test-ci-local/local_ci.py \
  --workflow ci-traffic-observer-service.yaml \
  --skip-static

python test-ci-local/local_ci.py \
  --all-workflows \
  --skip-e2e \
  --skip-docker
```

InternetMap-Geographic E2E steps are disabled on GitHub Actions but remain
available through this runner. Running its workflow locally without
`--skip-e2e` executes those tests.

## Shell selection

`--shell` accepts the following values:

- `auto` (default): uses Bash for Bash-like commands when Bash is available;
  otherwise it uses the native shell.
- `native`: uses PowerShell on Windows and the platform shell elsewhere.
- `bash`: requires Bash and uses it for workflow commands.

Examples:

```bash
python test-ci-local/local_ci.py \
  --workflow ci-internet-map-geographic.yaml \
  --shell bash
```

On Windows, install Git Bash or use WSL for workflows containing Linux shell
syntax. Linux-only steps such as `sudo apt-get` are skipped on Windows and
macOS.

## Tool installation

The runner uses workflow setup versions when present and otherwise defaults to
Node.js `22.17.0`, pnpm `9.15.9`, and Go `1.26.5`. To report missing tools
without trying to install them, use:

```bash
python test-ci-local/local_ci.py \
  --workflow ci-internet-map-geographic.yaml \
  --no-tool-install
```

On Ubuntu, missing Node.js and Go are installed from official distributions by
default. To use apt packages instead:

```bash
python test-ci-local/local_ci.py \
  --workflow ci-traffic-observer-service.yaml \
  --ubuntu-install-source apt
```

## Docker workflows

Docker jobs require Docker Engine and Docker Compose v2. Images may need to be
downloaded during the first run. The lifecycle probe starts services, checks
frontend and backend endpoints, writes logs under
`ci-artifacts/docker-lifecycle/logs/`, and then runs
`docker compose down --remove-orphans`.

Run it through the local runner:

```bash
python test-ci-local/local_ci.py --workflow ci-docker-lifecycle.yaml
```

The Docker lifecycle workflow uses fixed ports and container names, so run it
on a host without a conflicting deployment. Traffic observer kernel and eBPF
checks should be run on Linux.

See [`ci/README.md`](../ci/README.md) for the lifecycle probe's environment
variables, ports, and manual commands.

## Limitations

This script is a lightweight workflow command runner, not a complete GitHub
Actions emulator. It skips actions without a local equivalent, including
checkout and artifact upload actions. GitHub-hosted runner services, secrets,
permissions, matrices, and event context may differ from the local environment.
Use the corresponding GitHub Actions run as the final CI result.

Run `--help` for the complete current option list:

```bash
python test-ci-local/local_ci.py --help
```

## Test run log

Record manually completed local CI runs in
[`test-ci-local-run-log.md`](./test-ci-local-run-log.md). The log records the
executor, execution time, and workflow or test case that was run. The runner
does not update this file automatically.
