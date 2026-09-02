# Local CI Runner

This repository has multiple GitHub Actions workflows under `.github/workflows`.
Use the local CI runner to reproduce those jobs on a development machine.

```bash
python scripts/local_ci.py --list
python scripts/local_ci.py --all-workflows
python scripts/local_ci.py --workflow ci-internet-map.yaml
python scripts/local_ci.py --workflow ci-satellite-emulator.yaml --skip-e2e
python scripts/local_ci.py --workflow ci-traffic-observer-service.yaml --dry-run
```

When `--all-workflows` is used, project-specific workflows run first and
`ci-docker-lifecycle.yaml` runs last as the final compose lifecycle probe.

## Behavior

- Parses `.github/workflows/*.yaml` with PyYAML.
- Executes `run:` steps from the selected workflow and job.
- Honors `defaults.run.working-directory`.
- Skips `actions/checkout` and `actions/upload-artifact`.
- Converts `actions/setup-node`, `actions/setup-go`, and `pnpm/action-setup` into local tool bootstrap steps.
- Uses existing Node.js, Go, or pnpm when they are already available.
- Warns when local tool versions differ from workflow expectations, but does not replace an already installed tool only because of a version mismatch.
- Installs missing tools when a supported local installer is available.
- Supports `--no-tool-install` to turn setup actions back into version checks only.

Install Python dependencies before running the local CI runner:

```bash
python -m pip install -r scripts/requirements.txt
```

The local CI runner does not install its own Python dependencies at runtime.

Missing setup tools are handled as follows:

| Tool | Local install strategy |
| --- | --- |
| Node.js | Defaults to `22.17.0`. Windows downloads the official `.msi` from `nodejs.org`. Ubuntu 24 defaults to the official Linux tarball for exact versions, or apt when `--ubuntu-install-source apt` is used. macOS uses `brew`. |
| Go | Defaults to `1.26.5`. Windows downloads the official `.msi` from `go.dev`. Ubuntu 24 defaults to the official Linux tarball for exact versions, or apt when `--ubuntu-install-source apt` is used. macOS uses `brew`. |
| pnpm | Defaults to `9.15.9`. Installs missing pnpm with `npm install -g pnpm@<version>`. On Linux and macOS, the runner also adds npm's global bin directory to `~/.bashrc` and refreshes `PATH` for the current local CI process. |
| Playwright browsers | The workflow's `pnpm exec playwright install ...` step runs unless `--skip-e2e` or `--no-tool-install` is used |

## Docker image prerequisites

Docker-based jobs and `docker compose build` steps may need to pull base images
the first time they run. To make local CI runs more predictable, pull the common
base images before running Docker workflows:

```bash
docker pull node:22-slim
docker pull golang:1.22-bookworm
docker pull debian:bookworm-slim
```

## Common commands

```bash
python scripts/local_ci.py --workflow ci-internet-map.yaml --dry-run
python scripts/local_ci.py --workflow ci-internet-map.yaml --skip-install
python scripts/local_ci.py --workflow ci-internet-map.yaml --skip-e2e
python scripts/local_ci.py --workflow ci-internet-map.yaml --no-tool-install
python scripts/local_ci.py --all-workflows --dry-run
python scripts/local_ci.py --all-workflows --skip-e2e --skip-docker
python scripts/local_ci.py --workflow ci-traffic-observer-service.yaml --ubuntu-install-source apt
python scripts/local_ci.py --workflow ci-docker-lifecycle.yaml --skip-docker
python scripts/local_ci.py --workflow ci-traffic-observer-service.yaml --skip-static
```

## Notes

GitHub-hosted runners use Ubuntu. Local Windows runs may differ:

- `bash ci/probe-docker-compose.sh` requires Bash, such as Git Bash or WSL.
- `sudo apt-get ...` steps run only on Linux. They are skipped on Windows and macOS.
- Ubuntu 24 official downloads are preferred for exact Node.js and Go versions. Use `--ubuntu-install-source apt` only when apt packages are acceptable for local validation.
- `traffic-observer-service` eBPF and ring buffer checks are best validated on Linux.
- Playwright browser installation may download browsers into the related frontend project cache. Use `--skip-e2e` or `--no-tool-install` to avoid this.

## FAQ

### npm or pnpm install is slow or times out

For users in China, `npm install`, `npm i`, `pnpm install`, or `pnpm i` may be
slow or time out when the default registry is used.

For local runs, configure a registry before running local CI:

```bash
npm config set registry https://registry.npmmirror.com
pnpm config set registry https://registry.npmmirror.com/
```

For Docker builds, add the registry configuration before dependency
installation steps in the related Dockerfile:

```dockerfile
RUN npm config set registry https://registry.npmmirror.com
RUN npm install
```

or:

```dockerfile
RUN pnpm config set registry https://registry.npmmirror.com/
RUN pnpm install
```

### pnpm is installed but the terminal cannot find it

On Linux, `npm install -g pnpm@9.15.9` may install `pnpm` into npm's global bin
directory while that directory is not part of the shell `PATH`.

The local CI runner now appends npm's global bin directory to `~/.bashrc` after
installing pnpm:

```bash
echo 'export PATH="$(npm prefix -g)/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
pnpm --version
```

If the current shell still cannot find `pnpm`, refresh `PATH` manually:

```bash
export PATH="$(npm prefix -g)/bin:$PATH"
pnpm --version
```

### Docker API integration tests need a running emulator example

Docker API related tests, especially `emulator-service` integration tests, use
the Docker daemon configured by `DOCKER_HOST` in
`emulator-service/env/.env.development`. You can update `DOCKER_HOST` to point
to the target emulator host.

The selected Docker host should already have a running SEED emulator example,
such as:

```text
seed-emulator/examples/internet/B00_mini_internet/
```

If the emulator example is not running on the configured Docker host, Docker API
tests may fail because no expected emulator containers or network state can be
discovered.
