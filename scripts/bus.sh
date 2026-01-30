#!/usr/bin/env bash
set -euo pipefail

# bus: 项目级 Agent 事件总线
# 独立模块，存储在 .ufoo/bus/ 中
#
# 用法: bus <command> [options]
#
# 命令:
#   init                    初始化事件总线
#   join [session-id]       加入总线（注册当前 Claude Code 实例）
#   send <target> <message> 发送定向消息
#   broadcast <message>     广播消息
#   check                   检查待处理事件
#   status                  查看总线状态
#   consume                 消费事件
#   leave                   离开总线

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUS_DIR=".ufoo/bus"
DATE_FORMAT="%Y-%m-%dT%H:%M:%S.000Z"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[bus]${NC} $*"; }
log_ok()    { echo -e "${GREEN}[bus]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[bus]${NC} $*"; }
log_error() { echo -e "${RED}[bus]${NC} $*" >&2; }

# ============================================================================
# 工具函数
# ============================================================================

get_timestamp() {
  date -u +"$DATE_FORMAT"
}

get_date() {
  date -u +"%Y-%m-%d"
}

generate_instance_id() {
  echo "$(date +%s%N | shasum | head -c 8)"
}

ensure_bus() {
  if [[ ! -d "$BUS_DIR" ]]; then
    log_error "事件总线未初始化。请先运行: bus init 或 /ufoo-init"
    exit 1
  fi
}

subscriber_to_safe_name() {
  echo "${1//:/_}"
}

get_next_seq() {
  local today_file="$BUS_DIR/events/$(get_date).jsonl"
  if [[ -f "$today_file" ]]; then
    local last_seq
    last_seq=$(tail -1 "$today_file" 2>/dev/null | jq -r '.seq // 0' 2>/dev/null || echo "0")
    echo $((last_seq + 1))
  else
    local max_seq=0
    shopt -s nullglob
    for f in "$BUS_DIR/events"/*.jsonl; do
      if [[ -f "$f" ]]; then
        local file_max
        file_max=$(tail -1 "$f" 2>/dev/null | jq -r '.seq // 0' 2>/dev/null || echo "0")
        if [[ $file_max -gt $max_seq ]]; then
          max_seq=$file_max
        fi
      fi
    done
    echo $((max_seq + 1))
  fi
}

# 检查 target 是否匹配 subscriber
target_matches() {
  local target="$1"
  local subscriber="$2"

  [[ -z "$target" || "$target" == "*" ]] && return 0
  [[ "$target" == "$subscriber" ]] && return 0

  local target_type="${target%%:*}"
  local target_instance="${target#*:}"
  local sub_type="${subscriber%%:*}"

  [[ "$target" == "$target_type" && "$target_type" == "$sub_type" ]] && return 0
  [[ "$target_instance" == "*" && "$target_type" == "$sub_type" ]] && return 0

  return 1
}

# ============================================================================
# 命令: init
# ============================================================================

cmd_init() {
  if [[ -d "$BUS_DIR" ]]; then
    log_warn "事件总线已存在"
    return 0
  fi

  log_info "初始化事件总线..."

  mkdir -p "$BUS_DIR"/{events,offsets,queues}

  local project_name
  project_name=$(basename "$(pwd)")

  cat > "$BUS_DIR/bus.json" << EOF
{
  "bus_id": "${project_name}-bus",
  "created_at": "$(get_timestamp)",
  "subscribers": {},
  "agent_types": {},
  "config": {
    "poll_interval_ms": 3000,
    "heartbeat_timeout_ms": 30000
  }
}
EOF

  # 记录初始化事件
  local today_file="$BUS_DIR/events/$(get_date).jsonl"
  echo "{\"seq\":1,\"ts\":\"$(get_timestamp)\",\"type\":\"system\",\"event\":\"bus_created\",\"publisher\":\"system\",\"data\":{}}" >> "$today_file"

  log_ok "事件总线初始化完成: $BUS_DIR"
}

# ============================================================================
# 命令: join (加入总线)
# ============================================================================

cmd_join() {
  local session_id="${1:-}"
  local agent_type="${2:-claude-code}"
  local nickname="${3:-}"

  ensure_bus

  # 如果没有提供 session_id，尝试从环境变量获取或生成
  if [[ -z "$session_id" ]]; then
    session_id="${CLAUDE_SESSION_ID:-${CODEX_SESSION_ID:-$(generate_instance_id)}}"
  fi

  local subscriber="${agent_type}:${session_id}"
  local safe_name
  safe_name=$(subscriber_to_safe_name "$subscriber")

  log_info "加入事件总线: $subscriber"

  # 设置终端窗口标题，包含 session id 和 nickname
  if [[ -n "$nickname" ]]; then
    local title="[bus:${session_id}] ${nickname}"
  else
    local title="[bus:${session_id}]"
  fi

  # 可选：设置终端标题（用于人类辨识；避免污染 stdout，默认关闭）
  if [[ "${AI_BUS_SET_TITLE:-0}" == "1" ]]; then
    echo -ne "\\033]0;${title}\\007"
  fi

  # 更新 bus.json
  local tmp_file
  tmp_file=$(mktemp)

  local tmux_pane="${TMUX_PANE:-}"
  local tmux_session="${TMUX_SESSION:-}"
  local tty_path=""
  tty_path="$(tty 2>/dev/null || true)"
  if [[ "$tty_path" == "not a tty" ]]; then
    tty_path=""
  fi

  jq --arg name "$subscriber" \
     --arg agent_type "$agent_type" \
     --arg instance_id "$session_id" \
     --arg nickname "$nickname" \
     --arg tmux_pane "$tmux_pane" \
     --arg tmux_session "$tmux_session" \
     --arg tty "$tty_path" \
     --arg ts "$(get_timestamp)" \
     --arg pid "$$" \
     --arg cwd "$(pwd)" \
     '
     .subscribers[$name] = {
        "agent_type": $agent_type,
        "instance_id": $instance_id,
        "nickname": $nickname,
        "tmux_pane": (if $tmux_pane != "" then $tmux_pane else null end),
        "tmux_session": (if $tmux_session != "" then $tmux_session else null end),
        "tty": (if $tty != "" then $tty else null end),
        "pid": ($pid | tonumber),
        "joined_at": $ts,
        "status": "active",
        "last_heartbeat": $ts
      }
     |
     .agent_types[$agent_type].instances = (
       (.agent_types[$agent_type].instances // []) + [$instance_id] | unique
     )
     |
     .agent_types[$agent_type].active_count = (
       .subscribers | to_entries | map(select(.value.agent_type == $agent_type and .value.status == "active")) | length
     )
     ' "$BUS_DIR/bus.json" > "$tmp_file"

  mv "$tmp_file" "$BUS_DIR/bus.json"

  # 创建 offset 文件
  cat > "$BUS_DIR/offsets/${safe_name}.offset" << EOF
{
  "subscriber": "$subscriber",
  "current_seq": 0,
  "last_consumed_at": "$(get_timestamp)"
}
EOF

  # 创建队列目录
  mkdir -p "$BUS_DIR/queues/${safe_name}"
  # Best-effort: persist tty for other scripts (e.g. injection) without parsing bus.json
  if [[ -n "$tty_path" ]]; then
    echo "$tty_path" > "$BUS_DIR/queues/${safe_name}/tty"
  fi

  # 记录 tty 设备（用于后续 inject 定位）
  local current_tty
  current_tty=$(tty 2>/dev/null || echo "")
  if [[ -n "$current_tty" && "$current_tty" != "not a tty" ]]; then
    echo "$current_tty" > "$BUS_DIR/queues/${safe_name}/tty"
  fi

  # 发布加入事件
  local seq
  seq=$(get_next_seq)
  local today_file="$BUS_DIR/events/$(get_date).jsonl"
  echo "{\"seq\":$seq,\"ts\":\"$(get_timestamp)\",\"type\":\"system\",\"event\":\"agent_joined\",\"publisher\":\"$subscriber\",\"data\":{\"agent_type\":\"$agent_type\",\"instance_id\":\"$session_id\"}}" >> "$today_file"

  log_ok "已加入事件总线"
  echo ""
  echo -e "${CYAN}我的身份: $subscriber${NC}"
  echo ""

  # 检查待处理事件
  cmd_check "$subscriber"

  # 输出订阅者 ID
  echo "$subscriber"
}

# ============================================================================
# 命令: check (检查待处理事件)
# ============================================================================

cmd_check() {
  local subscriber="${1:-}"

  if [[ -z "$subscriber" ]]; then
    log_error "用法: context-bus check <subscriber-id>"
    exit 1
  fi

  ensure_bus

  local safe_name
  safe_name=$(subscriber_to_safe_name "$subscriber")
  local queue_file="$BUS_DIR/queues/${safe_name}/pending.jsonl"

  if [[ -f "$queue_file" && -s "$queue_file" ]]; then
    local count
    count=$(wc -l < "$queue_file" | tr -d ' ')
    log_warn "有 $count 条待处理事件:"
    echo ""
    while IFS= read -r event; do
      local publisher type event_name data
      publisher=$(echo "$event" | jq -r '.publisher')
      type=$(echo "$event" | jq -r '.type')
      event_name=$(echo "$event" | jq -r '.event')
      data=$(echo "$event" | jq -c '.data')
      echo -e "  ${YELLOW}@你${NC} from ${CYAN}$publisher${NC}"
      echo -e "  类型: $type/$event_name"
      echo -e "  内容: $data"
      echo ""
    done < "$queue_file"
  else
    log_ok "没有待处理事件"
  fi
}

# ============================================================================
# 命令: send (发送定向消息)
# ============================================================================

cmd_send() {
  local target="${1:-}"
  local message="${2:-}"
  local publisher="${AI_BUS_PUBLISHER:-unknown}"

  if [[ -z "$target" || -z "$message" ]]; then
    log_error "用法: context-bus send <target> <message>"
    log_error "示例: context-bus send claude-code:abc123 '请帮我 review'"
    exit 1
  fi

  ensure_bus

  local seq
  seq=$(get_next_seq)
  local today_file="$BUS_DIR/events/$(get_date).jsonl"

  # 构建事件
  local event_json
  event_json=$(jq -cn \
    --argjson seq "$seq" \
    --arg ts "$(get_timestamp)" \
    --arg publisher "$publisher" \
    --arg target "$target" \
    --arg message "$message" \
    '{
      seq: $seq,
      ts: $ts,
      type: "message",
      event: "targeted",
      publisher: $publisher,
      target: $target,
      data: { message: $message }
    }')

  echo "$event_json" >> "$today_file"

  # 写入目标队列
  local matching_subscribers
  matching_subscribers=$(jq -r '.subscribers | keys[]' "$BUS_DIR/bus.json")

  for sub in $matching_subscribers; do
    if target_matches "$target" "$sub"; then
      local safe_name
      safe_name=$(subscriber_to_safe_name "$sub")
      mkdir -p "$BUS_DIR/queues/${safe_name}"
      echo "$event_json" >> "$BUS_DIR/queues/${safe_name}/pending.jsonl"
    fi
  done

  log_ok "消息已发送: seq=$seq → $target"
}

# ============================================================================
# 命令: broadcast (广播消息)
# ============================================================================

cmd_broadcast() {
  local message="${1:-}"
  local publisher="${AI_BUS_PUBLISHER:-unknown}"

  if [[ -z "$message" ]]; then
    log_error "用法: context-bus broadcast <message>"
    exit 1
  fi

  ensure_bus

  local seq
  seq=$(get_next_seq)
  local today_file="$BUS_DIR/events/$(get_date).jsonl"

  local event_json
  event_json=$(jq -cn \
    --argjson seq "$seq" \
    --arg ts "$(get_timestamp)" \
    --arg publisher "$publisher" \
    --arg message "$message" \
    '{
      seq: $seq,
      ts: $ts,
      type: "message",
      event: "broadcast",
      publisher: $publisher,
      data: { message: $message }
    }')

  echo "$event_json" >> "$today_file"

  log_ok "广播已发送: seq=$seq"
}

# ============================================================================
# 命令: status
# ============================================================================

cmd_status() {
  ensure_bus

  echo ""
  echo -e "${CYAN}=== 事件总线状态 ===${NC}"
  echo ""

  local bus_id
  bus_id=$(jq -r '.bus_id' "$BUS_DIR/bus.json")
  echo "总线 ID: $bus_id"
  echo ""

  echo -e "${CYAN}在线订阅者:${NC}"
  jq -r '.subscribers | to_entries[] | select(.value.status == "active") | "  \(.key)\(if .value.nickname != "" and .value.nickname != null then " (\(.value.nickname))" else "" end)"' "$BUS_DIR/bus.json"
  echo ""

  echo -e "${CYAN}事件统计:${NC}"
  local total=0
  shopt -s nullglob
  for f in "$BUS_DIR/events"/*.jsonl; do
    if [[ -f "$f" ]]; then
      local count
      count=$(wc -l < "$f" | tr -d ' ')
      total=$((total + count))
      echo "  $(basename "$f"): $count 条"
    fi
  done
  echo "  总计: $total 条"
}

# ============================================================================
# 命令: consume
# ============================================================================

cmd_consume() {
  local subscriber="${1:-}"
  local limit="${2:-10}"

  if [[ -z "$subscriber" ]]; then
    log_error "用法: context-bus consume <subscriber-id> [limit]"
    exit 1
  fi

  ensure_bus

  local safe_name
  safe_name=$(subscriber_to_safe_name "$subscriber")
  local offset_file="$BUS_DIR/offsets/${safe_name}.offset"

  if [[ ! -f "$offset_file" ]]; then
    log_error "订阅者未注册: $subscriber"
    exit 1
  fi

  local current_seq
  current_seq=$(jq -r '.current_seq' "$offset_file")

  local events=()
  local max_seq=$current_seq

  shopt -s nullglob
  for event_file in "$BUS_DIR/events"/*.jsonl; do
    while IFS= read -r line; do
      local seq target
      seq=$(echo "$line" | jq -r '.seq')
      target=$(echo "$line" | jq -r '.target // ""')

      if [[ $seq -gt $current_seq ]]; then
        if target_matches "$target" "$subscriber"; then
          events+=("$line")
          [[ $seq -gt $max_seq ]] && max_seq=$seq
        fi
      fi
    done < "$event_file"
  done

  local count=0
  for event in "${events[@]}"; do
    [[ $count -ge $limit ]] && break
    echo "$event"
    ((count++))
  done

  if [[ $max_seq -gt $current_seq ]]; then
    jq --argjson seq "$max_seq" --arg ts "$(get_timestamp)" \
       '.current_seq = $seq | .last_consumed_at = $ts' \
       "$offset_file" > "${offset_file}.tmp"
    mv "${offset_file}.tmp" "$offset_file"
  fi
}

# ============================================================================
# 命令: leave
# ============================================================================

cmd_leave() {
  local subscriber="${1:-}"

  if [[ -z "$subscriber" ]]; then
    log_error "用法: context-bus leave <subscriber-id>"
    exit 1
  fi

  ensure_bus

  log_info "离开事件总线: $subscriber"

  # 更新状态为 offline
  local tmp_file
  tmp_file=$(mktemp)

  jq --arg name "$subscriber" \
     '.subscribers[$name].status = "offline"' \
     "$BUS_DIR/bus.json" > "$tmp_file"

  mv "$tmp_file" "$BUS_DIR/bus.json"

  log_ok "已离开事件总线"
}

# ============================================================================
# 命令: alert/listen/autotrigger (helpers)
# ============================================================================

cmd_alert() {
  local subscriber="${1:-}"
  if [[ -z "$subscriber" ]]; then
    log_error "用法: bus alert <subscriber-id> [interval] [--notify|--daemon|--stop|...]"
    exit 1
  fi
  if [[ ! -x "$SCRIPT_DIR/bus-alert.sh" ]]; then
    log_error "缺少脚本: $SCRIPT_DIR/bus-alert.sh"
    exit 1
  fi
  exec bash "$SCRIPT_DIR/bus-alert.sh" "$@"
}

cmd_listen() {
  local subscriber="${1:-}"
  if [[ -z "$subscriber" ]]; then
    log_error "用法: bus listen <subscriber-id> [--from-beginning|--reset|...]"
    exit 1
  fi
  if [[ ! -x "$SCRIPT_DIR/bus-listen.sh" ]]; then
    log_error "缺少脚本: $SCRIPT_DIR/bus-listen.sh"
    exit 1
  fi
  exec bash "$SCRIPT_DIR/bus-listen.sh" "$@"
}

cmd_autotrigger() {
  if [[ ! -x "$SCRIPT_DIR/bus-autotrigger.sh" ]]; then
    log_error "缺少脚本: $SCRIPT_DIR/bus-autotrigger.sh"
    exit 1
  fi
  exec bash "$SCRIPT_DIR/bus-autotrigger.sh" "$@"
}

# ============================================================================
# 主入口
# ============================================================================

main() {
  local cmd="${1:-help}"
  shift || true

  case "$cmd" in
    init)      cmd_init "$@" ;;
    join)      cmd_join "$@" ;;
    check)     cmd_check "$@" ;;
    send)      cmd_send "$@" ;;
    broadcast) cmd_broadcast "$@" ;;
    status)    cmd_status "$@" ;;
    consume)   cmd_consume "$@" ;;
    leave)     cmd_leave "$@" ;;
    alert)     cmd_alert "$@" ;;
    listen)    cmd_listen "$@" ;;
    autotrigger) cmd_autotrigger "$@" ;;
    help|--help|-h)
      echo "bus - 项目级 Agent 事件总线"
      echo ""
      echo "用法: bus <command> [options]"
      echo ""
      echo "命令:"
      echo "  init                              初始化事件总线"
      echo "  join [session-id] [type] [nick]   加入总线（设置窗口标题）"
      echo "  check <subscriber>                检查待处理事件"
      echo "  send <target> <message>           发送定向消息"
      echo "  broadcast <message>               广播消息"
      echo "  status                            查看总线状态"
      echo "  consume <subscriber>              消费事件"
      echo "  leave <subscriber>                离开总线"
      echo "  alert <subscriber>                后台提醒（不自动执行）"
      echo "  listen <subscriber>               前台监听并打印新消息"
      echo "  autotrigger start|stop|status     无人干预自动执行（tmux）"
      echo ""
      echo "示例:"
      echo "  bus join abc123 claude-code \"架构师\""
      echo "  bus send claude-code:abc123 \"请帮我 review\""
      ;;
    *)
      log_error "未知命令: $cmd"
      exit 1
      ;;
  esac
}

main "$@"
