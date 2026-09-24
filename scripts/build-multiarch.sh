#!/usr/bin/env bash

set -Eeuo pipefail

readonly DEFAULT_USERNAME="handsonsecurity"
readonly DEFAULT_TAG="1.0"
readonly DEFAULT_BUILDER="seed-multiarch"

DOCKER_USERNAME="$DEFAULT_USERNAME"
DOCKER_PASSWORD=""
IMAGE_TAG="$DEFAULT_TAG"
BUILDER_NAME="$DEFAULT_BUILDER"
BUILDX_VERSION="latest"
REGISTRY_MIRROR=""
PROXY_URL=""

print_help() {
    cat <<EOF
Build and push all Compose images for linux/amd64 and linux/arm64.

Usage:
  $0 --password <password-or-token> [options]

Required:
  -p, --password <value>   Docker Hub password or access token

Options:
  -u, --username <value>   Docker Hub username (default: ${DEFAULT_USERNAME})
  -t, --tag <value>        Tag applied to every image (default: ${DEFAULT_TAG})
  -b, --builder <value>    Buildx builder name (default: ${DEFAULT_BUILDER})
      --buildx-version <v> Buildx version installed when missing (default: latest)
      --registry-mirror <host>
                           Docker Hub HTTPS mirror used by BuildKit
      --proxy <url>        Proxy used only by the BuildKit daemon
  -h, --help               Show this help message

Example:
  $0 --password "\${DOCKER_PASSWORD}" --tag 1.0
  $0 --password "\${DOCKER_PASSWORD}" --registry-mirror mirror.example.com
  $0 --password "\${DOCKER_PASSWORD}" --proxy http://192.168.1.10:7890

The password is sent to 'docker login' through standard input. Prefer a Docker
Hub access token over an account password.
EOF
}

require_value() {
    local option="$1"
    local value="${2:-}"
    if [[ -z "$value" || "$value" == -* ]]; then
        echo "Error: ${option} requires a value." >&2
        exit 2
    fi
}

install_buildx() {
    if ! command -v curl >/dev/null 2>&1; then
        echo "Error: curl is required to install Docker Buildx automatically." >&2
        exit 1
    fi

    local version="$BUILDX_VERSION"
    if [[ "$version" == "latest" ]]; then
        echo "Docker Buildx was not found; resolving the latest stable release..."
        version="$(
            curl --fail --silent --show-error --location \
                https://api.github.com/repos/docker/buildx/releases/latest \
                | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
                | head -n 1
        )"
        if [[ -z "$version" ]]; then
            echo "Error: unable to determine the latest Docker Buildx version." >&2
            exit 1
        fi
    elif [[ "$version" != v* ]]; then
        version="v${version}"
    fi

    local os
    case "$(uname -s)" in
        Linux*) os="linux" ;;
        Darwin*) os="darwin" ;;
        MINGW*|MSYS*|CYGWIN*) os="windows" ;;
        *)
            echo "Error: automatic Buildx installation does not support $(uname -s)." >&2
            exit 1
            ;;
    esac

    local arch
    case "$(uname -m)" in
        x86_64|amd64) arch="amd64" ;;
        aarch64|arm64) arch="arm64" ;;
        armv7l|armv7) arch="arm-v7" ;;
        *)
            echo "Error: automatic Buildx installation does not support $(uname -m)." >&2
            exit 1
            ;;
    esac

    local extension=""
    if [[ "$os" == "windows" ]]; then
        extension=".exe"
    fi

    local plugin_dir="${DOCKER_CONFIG:-$HOME/.docker}/cli-plugins"
    local plugin_path="${plugin_dir}/docker-buildx${extension}"
    local download_url="https://github.com/docker/buildx/releases/download/${version}/buildx-${version}.${os}-${arch}${extension}"

    echo "Installing Docker Buildx ${version} for ${os}/${arch}..."
    mkdir -p "$plugin_dir"
    curl --fail --silent --show-error --location \
        "$download_url" \
        --output "$plugin_path"
    chmod +x "$plugin_path"

    if ! docker buildx version >/dev/null 2>&1; then
        echo "Error: Docker Buildx installation completed, but the plugin cannot be executed." >&2
        echo "Plugin path: ${plugin_path}" >&2
        exit 1
    fi

    echo "Docker Buildx ${version} installed at ${plugin_path}."
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -p|--password)
            require_value "$1" "${2:-}"
            DOCKER_PASSWORD="$2"
            shift 2
            ;;
        -u|--username)
            require_value "$1" "${2:-}"
            DOCKER_USERNAME="$2"
            shift 2
            ;;
        -t|--tag)
            require_value "$1" "${2:-}"
            IMAGE_TAG="$2"
            shift 2
            ;;
        -b|--builder)
            require_value "$1" "${2:-}"
            BUILDER_NAME="$2"
            shift 2
            ;;
        --buildx-version)
            require_value "$1" "${2:-}"
            BUILDX_VERSION="$2"
            shift 2
            ;;
        --registry-mirror)
            require_value "$1" "${2:-}"
            REGISTRY_MIRROR="$2"
            shift 2
            ;;
        --proxy)
            require_value "$1" "${2:-}"
            PROXY_URL="$2"
            shift 2
            ;;
        -h|--help)
            print_help
            exit 0
            ;;
        *)
            echo "Error: unknown option: $1" >&2
            print_help >&2
            exit 2
            ;;
    esac
done

if [[ -z "$DOCKER_PASSWORD" ]]; then
    echo "Error: --password is required." >&2
    exit 2
fi

for command in docker; do
    if ! command -v "$command" >/dev/null 2>&1; then
        echo "Error: ${command} is not installed or is not in PATH." >&2
        exit 1
    fi
done

if ! docker compose version >/dev/null 2>&1; then
    echo "Error: Docker Compose v2 is required." >&2
    exit 1
fi

if ! docker buildx version >/dev/null 2>&1; then
    install_buildx
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

echo "Logging in to Docker Hub as ${DOCKER_USERNAME}..."
printf '%s' "$DOCKER_PASSWORD" | docker login --username "$DOCKER_USERNAME" --password-stdin
unset DOCKER_PASSWORD

effective_builder="$BUILDER_NAME"
buildkit_config=""
builder_key=""
mirror_host=""
if [[ -n "$REGISTRY_MIRROR" ]]; then
    mirror_host="${REGISTRY_MIRROR#https://}"
    mirror_host="${mirror_host%/}"
    if [[ "$mirror_host" == http://* ]]; then
        echo "Error: --registry-mirror requires an HTTPS mirror." >&2
        exit 2
    fi
    if [[ ! "$mirror_host" =~ ^[A-Za-z0-9._-]+(:[0-9]+)?$ ]]; then
        echo "Error: invalid registry mirror host: ${REGISTRY_MIRROR}" >&2
        exit 2
    fi

    builder_key="mirror=${mirror_host}"
fi

if [[ -n "$PROXY_URL" ]]; then
    if [[ ! "$PROXY_URL" =~ ^https?://[^[:space:]]+$ ]]; then
        echo "Error: --proxy must be an HTTP or HTTPS URL." >&2
        exit 2
    fi
    builder_key="${builder_key}|buildkit-proxy-v1=${PROXY_URL}"
fi

if [[ -n "$builder_key" ]]; then
    builder_id="$(printf '%s' "$builder_key" | cksum | awk '{print $1}')"
    effective_builder="${BUILDER_NAME}"
fi

if docker buildx inspect "$effective_builder" >/dev/null 2>&1; then
    docker buildx use "$effective_builder"
else
    if [[ -n "$mirror_host" ]]; then
        buildkit_config="$(mktemp)"
        trap '[[ -z "${buildkit_config:-}" ]] || rm -f "$buildkit_config"' EXIT
        cat >"$buildkit_config" <<EOF
[registry."docker.io"]
  mirrors = ["${mirror_host}"]
EOF
    fi

    create_args=(
        --name "$effective_builder"
        --driver docker-container
        --use
    )
    if [[ -n "$buildkit_config" ]]; then
        create_args+=(--buildkitd-config "$buildkit_config")
    fi
    if [[ -n "$PROXY_URL" ]]; then
        create_args+=(
            --driver-opt "env.HTTP_PROXY=${PROXY_URL}"
            --driver-opt "env.HTTPS_PROXY=${PROXY_URL}"
            --driver-opt "env.http_proxy=${PROXY_URL}"
            --driver-opt "env.https_proxy=${PROXY_URL}"
        )
    fi
    docker buildx create "${create_args[@]}"
fi

docker buildx inspect --bootstrap >/dev/null

export DOCKER_USERNAME
export EMULATOR_SERVICE_TAG="${EMULATOR_SERVICE_TAG:-$IMAGE_TAG}"
export INTERNET_TOPLOGY_TAG="${INTERNET_TOPLOGY_TAG:-$IMAGE_TAG}"
export INTERNET_GEOGRAPHIC_TAG="${INTERNET_GEOGRAPHIC_TAG:-$IMAGE_TAG}"
export INTERNET_SATELLITE_TAG="${INTERNET_SATELLITE_TAG:-$IMAGE_TAG}"
export SATELLITE_EMULATOR_TAG="${SATELLITE_EMULATOR_TAG:-$IMAGE_TAG}"
export TRAFFIC_OBSERVER_TAG="${TRAFFIC_OBSERVER_TAG:-$IMAGE_TAG}"

echo "Building and pushing linux/amd64 and linux/arm64 images..."
docker buildx bake \
    --file docker-compose.yml \
    --file docker-bake.hcl \
    --push

echo "Multi-architecture images were pushed successfully."
