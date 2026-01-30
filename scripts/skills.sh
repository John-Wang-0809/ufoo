#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
skills_src="$repo_root/modules/context/SKILLS"

usage() {
  cat <<'EOFU'
skills

Usage:
  ufoo skills list
  ufoo skills install <name|all> [--target <dir> | --codex | --agents]
EOFU
}

cmd="${1:-}"
shift || true

case "$cmd" in
  list)
    find "$skills_src" -mindepth 1 -maxdepth 1 -type d -print | sed 's|.*/||' | sort
    ;;
  install)
    name="${1:-}"
    shift || true
    if [[ -z "$name" ]]; then
      echo "FAIL: install requires <name|all>" >&2
      exit 1
    fi

    target=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --target)
          target="$2"; shift 2 ;;
        --codex)
          target="${CODEX_HOME:-$HOME/.codex}/skills"; shift ;;
        --agents)
          target="$HOME/.agents/skills"; shift ;;
        *)
          echo "Unknown option: $1" >&2
          usage >&2
          exit 1
          ;;
      esac
    done

    if [[ -z "$target" ]]; then
      echo "FAIL: specify --target/--codex/--agents" >&2
      exit 1
    fi

    mkdir -p "$target"

    install_one() {
      local skill_name="$1"
      local src_file="$skills_src/$skill_name/SKILL.md"
      local dst_dir="$target/$skill_name"
      local dst_file="$dst_dir/SKILL.md"

      if [[ ! -f "$src_file" ]]; then
        echo "FAIL: missing $src_file" >&2
        exit 1
      fi

      mkdir -p "$dst_dir"
      cp "$src_file" "$dst_file"
      echo "Installed: $skill_name"
    }

    if [[ "$name" == "all" ]]; then
      while IFS= read -r d; do
        install_one "$d"
      done < <(find "$skills_src" -mindepth 1 -maxdepth 1 -type d -print | sed 's|.*/||' | sort)
    else
      install_one "$name"
    fi
    ;;
  *)
    usage
    exit 1
    ;;
esac
