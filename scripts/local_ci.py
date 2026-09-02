#!/usr/bin/env python3
"""
Local GitHub Actions runner for seed-visualization.

The script reads workflows from .github/workflows and executes their run steps
locally. Tool setup actions are mapped to local version checks and missing-tool
bootstrap steps. Existing tools are never replaced only because their version is
different; version mismatches are reported as warnings.
"""

from __future__ import annotations

import argparse
import os
import platform
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    yaml = None


REPO_ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS_DIR = REPO_ROOT / ".github" / "workflows"
DEFAULT_NODE_VERSION = "22.17.0"
DEFAULT_PNPM_VERSION = "9.15.9"
DEFAULT_GO_VERSION = "1.26.5"


def main() -> int:
    args = parse_args()

    if yaml is None:
        print(
            "[local-ci] Missing Python dependency: PyYAML.\n"
            "[local-ci] Install local CI Python dependencies first:\n"
            f"  {sys.executable} -m pip install -r scripts/requirements.txt",
            file=sys.stderr,
        )
        return 1

    workflows = list_workflows()
    if args.list:
        print_workflow_list(workflows)
        return 0

    if not args.workflow and not args.all_workflows:
        print(
            "[local-ci] Missing --workflow. Use --all-workflows to run every workflow or --list to inspect available workflows.",
            file=sys.stderr,
        )
        return 1

    selected_workflows = workflows if args.all_workflows else [select_workflow(workflows, args.workflow)]
    local_env = os.environ.copy()

    print(f"[local-ci] host: {platform.system()} {platform.machine()}")
    if args.no_tool_install:
        print("[local-ci] setup actions are version checks only; missing tools will not be installed.")
    else:
        print("[local-ci] setup actions will verify existing tools and install missing tools when possible.")

    for workflow_path in selected_workflows:
        workflow = load_workflow(workflow_path)
        selected_jobs = select_jobs(workflow, args.job, skip_missing=args.all_workflows)
        if not selected_jobs:
            print(f"\n[local-ci] workflow: {workflow.get('name', workflow_path.name)} ({workflow_path.relative_to(REPO_ROOT)})")
            print(f"[local-ci] skip: job {args.job!r} not found")
            continue

        workflow_env = normalize_env(workflow.get("env", {}))
        print(f"\n[local-ci] workflow: {workflow.get('name', workflow_path.name)} ({workflow_path.relative_to(REPO_ROOT)})")
        print(f"[local-ci] jobs: {', '.join(selected_jobs)}")
        warn_if_no_bash_for_bash_like_steps(workflow, selected_jobs)

        for job_name in selected_jobs:
            status = run_job(workflow, job_name, workflow_env, local_env, args)
            if status != 0:
                return status

    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run repository GitHub Actions workflows locally.")
    parser.add_argument("-w", "--workflow", help="Workflow YAML file name or workflow display name.")
    parser.add_argument("--all-workflows", action="store_true", help="Run every workflow under .github/workflows.")
    parser.add_argument("-j", "--job", help="Run a single job id from the selected workflow.")
    parser.add_argument("--list", action="store_true", help="List available workflows and jobs.")
    parser.add_argument("--dry-run", action="store_true", help="Print commands without executing them.")
    parser.add_argument(
        "--no-tool-install",
        action="store_true",
        help="Do not install missing setup-action tools; report missing tools as warnings instead.",
    )
    parser.add_argument("--skip-install", action="store_true", help="Skip npm/pnpm dependency install steps.")
    parser.add_argument("--skip-static", action="store_true", help="Skip lint/vet/static/format/eBPF compile steps.")
    parser.add_argument("--skip-unit", action="store_true", help="Skip unit-test steps.")
    parser.add_argument("--skip-integration", action="store_true", help="Skip integration-test steps.")
    parser.add_argument("--skip-e2e", action="store_true", help="Skip Playwright/browser E2E steps.")
    parser.add_argument("--skip-build", action="store_true", help="Skip build steps.")
    parser.add_argument("--skip-docker", action="store_true", help="Skip docker build/lifecycle steps.")
    parser.add_argument(
        "--ubuntu-install-source",
        choices=["official", "apt"],
        default="official",
        help="Install missing Node.js and Go on Ubuntu from official downloads or apt packages. Defaults to official downloads for exact versions.",
    )
    parser.add_argument(
        "--shell",
        choices=["auto", "native", "bash"],
        default="auto",
        help="Shell used for run steps. auto prefers bash for bash-like commands when available.",
    )
    return parser.parse_args()


def list_workflows() -> list[Path]:
    if not WORKFLOWS_DIR.exists():
        raise SystemExit(f"[local-ci] Workflow directory not found: {WORKFLOWS_DIR}")
    return sorted([*WORKFLOWS_DIR.glob("*.yaml"), *WORKFLOWS_DIR.glob("*.yml")], key=workflow_sort_key)


def workflow_sort_key(path: Path) -> tuple[int, str]:
    if path.name == "ci-docker-lifecycle.yaml":
        return (1, path.name)
    return (0, path.name)


def print_workflow_list(workflows: list[Path]) -> None:
    for workflow_path in workflows:
        workflow = load_workflow(workflow_path)
        print(f"{workflow_path.name}\t{workflow.get('name', workflow_path.name)}")
        for job_name in workflow.get("jobs", {}):
            print(f"  - {job_name}")


def load_workflow(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as file:
        return yaml.safe_load(file) or {}


def select_workflow(workflows: list[Path], selector: str) -> Path:
    direct = WORKFLOWS_DIR / selector
    if direct.exists():
        return direct

    for workflow_path in workflows:
        if workflow_path.name == selector:
            return workflow_path

    for workflow_path in workflows:
        if load_workflow(workflow_path).get("name") == selector:
            return workflow_path

    available = ", ".join(path.name for path in workflows)
    raise SystemExit(f"[local-ci] Workflow not found: {selector}. Available: {available}")


def select_jobs(workflow: dict[str, Any], selector: str | None, skip_missing: bool = False) -> list[str]:
    jobs = workflow.get("jobs", {})
    if selector:
        if selector not in jobs:
            if skip_missing:
                return []
            available = ", ".join(jobs)
            raise SystemExit(f"[local-ci] Job not found: {selector}. Available: {available}")
        return [selector]
    return list(jobs)


def normalize_env(env: dict[str, Any]) -> dict[str, str]:
    return {str(key): str(value) for key, value in env.items()}


def run_job(
    workflow: dict[str, Any],
    job_name: str,
    workflow_env: dict[str, str],
    local_env: dict[str, str],
    args: argparse.Namespace,
) -> int:
    job = workflow["jobs"][job_name]
    display_name = job.get("name", job_name)
    print(f"\n[local-ci] job: {display_name} ({job_name})")

    job_workdir = get_job_working_directory(job)
    job_env = {**workflow_env, **normalize_env(job.get("env", {}))}

    for step in job.get("steps", []):
        name = step.get("name") or step.get("uses") or str(step.get("run", "<unnamed step>")).splitlines()[0]

        if should_skip_step(step, args):
            print(f"[local-ci] skip: {name}")
            continue

        print(f"\n[local-ci] step: {name}")

        if "uses" in step:
            status = handle_uses_step(str(step["uses"]), job_env, local_env, args)
            if status != 0:
                return status
            continue

        command = step.get("run")
        if not command:
            print("[local-ci] no run command; skipped.")
            continue

        step_workdir = step.get("working-directory") or job_workdir
        cwd = (REPO_ROOT / step_workdir).resolve()
        step_env = {
            **local_env,
            **job_env,
            **normalize_env(step.get("env", {})),
            "CI": os.environ.get("CI", "true"),
        }

        status = run_command(str(command), cwd, step_env, args)
        if status != 0:
            return status

    return 0


def get_job_working_directory(job: dict[str, Any]) -> str:
    return job.get("defaults", {}).get("run", {}).get("working-directory", ".")


def should_skip_step(step: dict[str, Any], args: argparse.Namespace) -> bool:
    name = str(step.get("name", "")).lower()
    uses = str(step.get("uses", "")).lower()
    run = str(step.get("run", "")).lower()
    text = f"{name}\n{uses}\n{run}"

    if uses.startswith("actions/checkout") or uses.startswith("actions/upload-artifact"):
        return True
    if args.skip_install and re.search(r"\b(npm ci|npm install|pnpm install|pnpm i)\b", run):
        return True
    if args.skip_static and re.search(r"lint|vet|static|format|gofmt|compile ebpf", text):
        return True
    if args.skip_unit and re.search(r"unit test|test:unit|go test", text):
        return True
    if args.skip_integration and "integration" in text:
        return True
    if args.skip_e2e and re.search(r"e2e|playwright|browser", text):
        return True
    if args.skip_build and re.search(r"\bbuild\b|tsc|go build", text):
        return True
    if args.skip_docker and re.search(r"docker compose|probe-docker-compose|docker build", text):
        return True
    if args.no_tool_install and ("apt-get" in run or "sudo apt" in run or "playwright install" in run):
        print(f"[local-ci] skip: {step.get('name', '<unnamed>')} (tool installation is disabled)")
        return True
    if ("apt-get" in run or "sudo apt" in run) and platform.system() != "Linux":
        warn(f"Skipping {step.get('name', '<unnamed>')}: apt-get based system package install only runs on Linux.")
        return True
    return False


def handle_uses_step(uses: str, env: dict[str, str], local_env: dict[str, str], args: argparse.Namespace) -> int:
    if uses.startswith("actions/setup-node"):
        return ensure_node(env.get("NODE_VERSION"), local_env, args)
    elif uses.startswith("pnpm/action-setup"):
        return ensure_pnpm(env.get("PNPM_VERSION"), local_env, args)
    elif uses.startswith("actions/setup-go"):
        return ensure_go(env.get("GO_VERSION"), local_env, args)
    else:
        print(f"[local-ci] uses {uses}; no local equivalent, skipped.")
        return 0


def ensure_node(expected_major: str | None, local_env: dict[str, str], args: argparse.Namespace) -> int:
    expected_version = normalize_node_version(expected_major)
    actual = read_version(["node", "--version"])
    if not actual:
        return install_node(expected_version, local_env, args)
    if expected_major:
        actual_major = actual.lstrip("v").split(".")[0]
        if actual_major != str(expected_major):
            warn(f"Node.js version mismatch: local {actual}, workflow expects major {expected_major}. Continuing.")
            return 0
    print(f"[local-ci] Node.js: {actual}" + (f" (default install version {expected_version})" if expected_version else ""))
    return 0


def ensure_pnpm(expected: str | None, local_env: dict[str, str], args: argparse.Namespace) -> int:
    expected_version = expected or DEFAULT_PNPM_VERSION
    actual = read_version(["pnpm", "--version"])
    if not actual:
        return install_pnpm(expected_version, local_env, args)
    if actual != expected_version:
        warn(f"pnpm version mismatch: local {actual}, workflow expects {expected_version}. Continuing.")
        return 0
    print(f"[local-ci] pnpm: {actual}" + (f" (expected {expected_version})" if expected_version else ""))
    return 0


def ensure_go(expected: str | None, local_env: dict[str, str], args: argparse.Namespace) -> int:
    expected_version = expected or DEFAULT_GO_VERSION
    raw = read_version(["go", "version"])
    if not raw:
        return install_go(expected_version, local_env, args)
    match = re.search(r"go([0-9]+\.[0-9]+(?:\.[0-9]+)?)", raw)
    actual = match.group(1) if match else raw
    if expected_version and not actual.startswith(str(expected_version)):
        warn(f"Go version mismatch: local {actual}, workflow expects {expected_version}. Continuing.")
        return 0
    print(f"[local-ci] Go: {actual}" + (f" (expected {expected_version})" if expected_version else ""))
    return 0


def install_node(expected_version: str | None, local_env: dict[str, str], args: argparse.Namespace) -> int:
    version = expected_version or DEFAULT_NODE_VERSION
    command = system_install_command("node", version, args)
    status = install_missing_tool("Node.js", version, command, local_env, args)
    if status == 0 and not args.dry_run:
        add_tool_path(local_env, "/usr/local/bin")
    return status


def install_go(expected: str | None, local_env: dict[str, str], args: argparse.Namespace) -> int:
    version = expected or DEFAULT_GO_VERSION
    command = system_install_command("go", version, args)
    status = install_missing_tool("Go", version, command, local_env, args)
    if status == 0 and not args.dry_run:
        add_tool_path(local_env, "/usr/local/bin")
    return status


def install_pnpm(expected: str | None, local_env: dict[str, str], args: argparse.Namespace) -> int:
    version = expected or DEFAULT_PNPM_VERSION
    if find_executable("node") is None:
        status = install_node(DEFAULT_NODE_VERSION, local_env, args)
        if status != 0:
            return status

    if find_executable("npm"):
        status = install_missing_tool("pnpm", version, pnpm_install_command(version), local_env, args)
        if status == 0 and not args.dry_run:
            refresh_pnpm_path(local_env)
        return status

    warn("pnpm is missing and npm is not available to install it.")
    return 1


def install_missing_tool(
    tool_name: str,
    expected: str | None,
    command: list[str] | None,
    local_env: dict[str, str],
    args: argparse.Namespace,
) -> int:
    expected_text = f" Expected {expected}." if expected else ""
    if args.no_tool_install:
        warn(f"{tool_name} is not installed or not in PATH.{expected_text}")
        return 0
    if command is None:
        warn(f"{tool_name} is not installed or not in PATH.{expected_text} No supported local installer was found.")
        print_manual_install_hint(tool_name, expected)
        return 1

    print(f"[local-ci] {tool_name} is missing.{expected_text}")
    print(f"[local-ci] install: {format_command(command)}")
    if args.dry_run:
        return 0

    status = run_subprocess(command, REPO_ROOT, local_env)
    if status != 0:
        warn(f"Failed to install {tool_name}.")
        print_manual_install_hint(tool_name, expected)
    return status


def pnpm_install_command(version: str) -> list[str]:
    package = f"pnpm@{version}"
    if platform.system() in {"Linux", "Darwin"} and find_executable("bash"):
        return ["bash", "-lc", pnpm_install_shell_script(package)]
    return ["npm", "install", "-g", package]


def pnpm_install_shell_script(package: str) -> str:
    return (
        "set -e; "
        f"npm install -g {shell_quote(package)}; "
        "echo 'export PATH=\"$(npm prefix -g)/bin:$PATH\"' >> ~/.bashrc; "
        "export PATH=\"$(npm prefix -g)/bin:$PATH\"; "
        "pnpm --version"
    )


def system_install_command(tool_name: str, expected: str | None, args: argparse.Namespace) -> list[str] | None:
    system = platform.system()
    version = expected or default_version_for_tool(tool_name)
    if system == "Windows":
        return official_windows_install_command(tool_name, version)

    if system == "Darwin":
        if not find_executable("brew"):
            return None
        package = "node" if tool_name == "node" else "go"
        return ["brew", "install", package]

    if system == "Linux":
        if is_ubuntu_24() and args.ubuntu_install_source == "official":
            return official_linux_install_command(tool_name, version)
        if find_executable("apt-get"):
            package = "nodejs" if tool_name == "node" else "golang-go"
            sudo = ["sudo"] if find_executable("sudo") else []
            return [
                "bash",
                "-lc",
                f"{'sudo ' if sudo else ''}apt-get update && {'sudo ' if sudo else ''}apt-get install -y {package}",
            ]
        if find_executable("dnf"):
            package = "nodejs" if tool_name == "node" else "golang"
            sudo = ["sudo"] if find_executable("sudo") else []
            return [*sudo, "dnf", "install", "-y", package]
        if find_executable("yum"):
            package = "nodejs" if tool_name == "node" else "golang"
            sudo = ["sudo"] if find_executable("sudo") else []
            return [*sudo, "yum", "install", "-y", package]

    return None


def normalize_node_version(expected_major: str | None) -> str:
    if not expected_major:
        return DEFAULT_NODE_VERSION
    value = str(expected_major).strip().lstrip("v")
    if re.fullmatch(r"\d+", value):
        if value == DEFAULT_NODE_VERSION.split(".")[0]:
            return DEFAULT_NODE_VERSION
        return value
    return value


def default_version_for_tool(tool_name: str) -> str:
    if tool_name == "node":
        return DEFAULT_NODE_VERSION
    if tool_name == "go":
        return DEFAULT_GO_VERSION
    if tool_name == "pnpm":
        return DEFAULT_PNPM_VERSION
    return ""


def official_windows_install_command(tool_name: str, version: str) -> list[str] | None:
    if tool_name == "node":
        url = f"https://nodejs.org/dist/v{version}/node-v{version}-x64.msi"
        file_name = f"node-v{version}-x64.msi"
    elif tool_name == "go":
        url = f"https://go.dev/dl/go{version}.windows-amd64.msi"
        file_name = f"go{version}.windows-amd64.msi"
    else:
        return None

    ps = (
        "$ErrorActionPreference='Stop'; "
        f"$url='{url}'; "
        f"$installer=Join-Path $env:TEMP '{file_name}'; "
        "Invoke-WebRequest -Uri $url -OutFile $installer; "
        "Start-Process msiexec.exe -Wait -ArgumentList @('/i', $installer, '/qn', '/norestart')"
    )
    return ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps]


def official_linux_install_command(tool_name: str, version: str) -> list[str] | None:
    arch = linux_download_arch()
    sudo = "sudo " if find_executable("sudo") else ""
    if tool_name == "node":
        url = f"https://nodejs.org/dist/v{version}/node-v{version}-linux-{arch}.tar.xz"
        script = (
            "set -euo pipefail; "
            f"tmp=$(mktemp -d); cd \"$tmp\"; "
            f"curl -fsSLO {shell_quote(url)}; "
            f"tar -xJf node-v{version}-linux-{arch}.tar.xz; "
            f"{sudo}rm -rf /usr/local/lib/nodejs/node-v{version}-linux-{arch}; "
            f"{sudo}mkdir -p /usr/local/lib/nodejs; "
            f"{sudo}mv node-v{version}-linux-{arch} /usr/local/lib/nodejs/; "
            f"{sudo}ln -sf /usr/local/lib/nodejs/node-v{version}-linux-{arch}/bin/node /usr/local/bin/node; "
            f"{sudo}ln -sf /usr/local/lib/nodejs/node-v{version}-linux-{arch}/bin/npm /usr/local/bin/npm; "
            f"{sudo}ln -sf /usr/local/lib/nodejs/node-v{version}-linux-{arch}/bin/npx /usr/local/bin/npx; "
            "node --version"
        )
        return ["bash", "-lc", script]
    if tool_name == "go":
        go_arch = go_download_arch()
        url = f"https://go.dev/dl/go{version}.linux-{go_arch}.tar.gz"
        script = (
            "set -euo pipefail; "
            f"tmp=$(mktemp -d); cd \"$tmp\"; "
            f"curl -fsSLO {shell_quote(url)}; "
            f"{sudo}rm -rf /usr/local/go; "
            f"{sudo}tar -C /usr/local -xzf go{version}.linux-{go_arch}.tar.gz; "
            f"{sudo}ln -sf /usr/local/go/bin/go /usr/local/bin/go; "
            f"{sudo}ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt; "
            "go version"
        )
        return ["bash", "-lc", script]
    return None


def linux_download_arch() -> str:
    machine = platform.machine().lower()
    if machine in {"x86_64", "amd64"}:
        return "x64"
    if machine in {"aarch64", "arm64"}:
        return "arm64"
    return machine


def go_download_arch() -> str:
    machine = platform.machine().lower()
    if machine in {"x86_64", "amd64"}:
        return "amd64"
    if machine in {"aarch64", "arm64"}:
        return "arm64"
    return machine


def is_ubuntu_24() -> bool:
    if platform.system() != "Linux":
        return False
    os_release = Path("/etc/os-release")
    if not os_release.exists():
        return False
    content = os_release.read_text(encoding="utf-8", errors="ignore")
    return 'ID=ubuntu' in content and re.search(r'VERSION_ID="?24\.', content) is not None


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def print_manual_install_hint(tool_name: str, expected: str | None) -> None:
    version = f" {expected}" if expected else ""
    hints = {
        "Node.js": f"Install Node.js{version} manually, then rerun local_ci.py.",
        "Go": f"Install Go{version} manually, then rerun local_ci.py.",
        "pnpm": f"Install pnpm{version} manually, for example: npm install -g pnpm@{expected or DEFAULT_PNPM_VERSION}",
    }
    warn(hints.get(tool_name, f"Install {tool_name}{version} manually, then rerun local_ci.py."))


def refresh_pnpm_path(local_env: dict[str, str]) -> None:
    npm_bin = read_command_output(["npm", "bin", "-g"], local_env)
    if npm_bin:
        add_tool_path(local_env, npm_bin)

    npm_prefix = read_command_output(["npm", "prefix", "-g"], local_env)
    if npm_prefix:
        if os.name == "nt":
            add_tool_path(local_env, npm_prefix)
        else:
            add_tool_path(local_env, str(Path(npm_prefix) / "bin"))

    pnpm_path = find_executable("pnpm", local_env)
    if pnpm_path:
        add_tool_path(local_env, str(Path(pnpm_path).parent))
        print(f"[local-ci] pnpm path: {pnpm_path}")
    else:
        warn("pnpm was installed, but it is still not visible in PATH for later workflow steps.")


def add_tool_path(env: dict[str, str], path: str) -> None:
    value = str(Path(path).expanduser())
    if not value:
        return

    current = env.get("PATH", "")
    parts = [part for part in current.split(os.pathsep) if part]
    normalized = {os.path.normcase(os.path.abspath(part)) for part in parts}
    normalized_value = os.path.normcase(os.path.abspath(value))
    if normalized_value not in normalized:
        env["PATH"] = value + (os.pathsep + current if current else "")


def read_command_output(command: list[str], env: dict[str, str]) -> str:
    executable = find_executable(command[0], env)
    if executable is None:
        return ""
    try:
        result = subprocess.run(
            [executable, *command[1:]],
            cwd=REPO_ROOT,
            env=env,
            text=True,
            capture_output=True,
        )
    except OSError:
        return ""
    if result.returncode != 0:
        return ""
    return (result.stdout or result.stderr).strip().splitlines()[0].strip()


def read_version(command: list[str]) -> str:
    executable = find_executable(command[0])
    if executable is None:
        return ""
    try:
        result = subprocess.run([executable, *command[1:]], cwd=REPO_ROOT, text=True, capture_output=True)
    except OSError:
        return ""
    if result.returncode != 0:
        return ""
    return (result.stdout or result.stderr).strip().splitlines()[0].strip()


def find_executable(name: str, env: dict[str, str] | None = None) -> str | None:
    search_path = env.get("PATH") if env is not None else None
    if os.name == "nt":
        for candidate in (f"{name}.cmd", f"{name}.exe", name):
            path = shutil.which(candidate, path=search_path)
            if path:
                return path
        return None
    return shutil.which(name, path=search_path)


def run_command(command: str, cwd: Path, env: dict[str, str], args: argparse.Namespace) -> int:
    print(f"[local-ci] cwd: {relative_to_repo(cwd)}")
    print(f"[local-ci] run:\n{command}")

    if args.dry_run:
        return 0

    shell_command, shell_name = build_shell_command(command, args.shell)
    if shell_command is None:
        warn("bash is required for this command but was not found. Falling back to native shell may fail.")
        shell_command, shell_name = build_native_shell_command(command)

    print(f"[local-ci] shell: {shell_name}")
    return run_subprocess(shell_command, cwd, env)


def run_subprocess(command: list[str], cwd: Path, env: dict[str, str]) -> int:
    executable = find_executable(command[0], env) if not os.path.isabs(command[0]) else command[0]
    if executable is None:
        warn(f"Command not found: {command[0]}")
        return 1
    try:
        return subprocess.run([executable, *command[1:]], cwd=cwd, env=env).returncode
    except OSError as exc:
        warn(f"Failed to run command {format_command(command)}: {exc}")
        return 1


def format_command(command: list[str]) -> str:
    return " ".join(quote_command_part(part) for part in command)


def quote_command_part(value: str) -> str:
    if not value or re.search(r"\s", value):
        escaped = value.replace('"', '\\"')
        return f'"{escaped}"'
    return value


def build_shell_command(command: str, shell_mode: str) -> tuple[list[str] | None, str]:
    if shell_mode == "bash":
        return build_bash_shell_command(command)
    if shell_mode == "native":
        return build_native_shell_command(command)
    if command_looks_bash_like(command) and shutil.which("bash"):
        return build_bash_shell_command(command)
    return build_native_shell_command(command)


def build_bash_shell_command(command: str) -> tuple[list[str] | None, str]:
    bash = shutil.which("bash")
    if not bash:
        return None, "bash"
    return [bash, "-lc", command], "bash"


def build_native_shell_command(command: str) -> tuple[list[str], str]:
    if os.name == "nt":
        powershell = shutil.which("powershell") or shutil.which("pwsh") or "powershell"
        return [powershell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], "powershell"
    return ["/bin/sh", "-lc", command], "sh"


def command_looks_bash_like(command: str) -> bool:
    return bool(re.search(r"\$\(|\bif \[|files=\"|\\\n|sudo |apt-get|bash ", command))


def warn_if_no_bash_for_bash_like_steps(workflow: dict[str, Any], job_names: list[str]) -> None:
    if shutil.which("bash"):
        return
    for job_name in job_names:
        for step in workflow["jobs"][job_name].get("steps", []):
            if command_looks_bash_like(str(step.get("run", ""))):
                warn("Some workflow steps use Bash syntax, but bash is not in PATH. Use Git Bash/WSL or skip related steps.")
                return


def relative_to_repo(path_value: Path) -> str:
    try:
        return str(path_value.relative_to(REPO_ROOT))
    except ValueError:
        return str(path_value)


def warn(message: str) -> None:
    print(f"[local-ci] warning: {message}", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
