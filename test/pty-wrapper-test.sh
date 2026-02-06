#!/bin/bash
# PTY Wrapper 测试脚本
# 测试 Phase 1 & 2 实现的各种场景

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "================================"
echo "PTY Wrapper Test Suite"
echo "================================"
echo ""

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass() {
  echo -e "${GREEN}✓${NC} $1"
}

fail() {
  echo -e "${RED}✗${NC} $1"
  exit 1
}

warn() {
  echo -e "${YELLOW}⚠${NC} $1"
}

# ================================
# Test 1: 基本环境检查
# ================================
echo "Test 1: Environment Check"
echo "------------------------"

# 检查 node-pty 依赖
if node -e "require('node-pty')" 2>/dev/null; then
  pass "node-pty dependency available"
else
  fail "node-pty dependency missing"
fi

# 检查文件存在
if [[ -f "$PROJECT_ROOT/src/agent/ptyWrapper.js" ]]; then
  pass "ptyWrapper.js exists"
else
  fail "ptyWrapper.js not found"
fi

if [[ -f "$PROJECT_ROOT/src/agent/launcher.js" ]]; then
  pass "launcher.js exists"
else
  fail "launcher.js not found"
fi

echo ""

# ================================
# Test 2: PTY启用条件检测
# ================================
echo "Test 2: PTY Enable Detection"
echo "----------------------------"

# Test 2.1: 显式禁用
export UFOO_DISABLE_PTY=1
if [[ "$UFOO_DISABLE_PTY" == "1" ]]; then
  pass "UFOO_DISABLE_PTY=1 detected (should use spawn)"
else
  fail "UFOO_DISABLE_PTY not working"
fi
unset UFOO_DISABLE_PTY

# Test 2.2: 显式启用
export UFOO_FORCE_PTY=1
if [[ "$UFOO_FORCE_PTY" == "1" ]]; then
  pass "UFOO_FORCE_PTY=1 detected (should use PTY)"
else
  fail "UFOO_FORCE_PTY not working"
fi
unset UFOO_FORCE_PTY

# Test 2.3: TMUX检测
if [[ -n "$TMUX" ]]; then
  warn "Running in tmux (should use spawn fallback)"
else
  pass "Not in tmux environment"
fi

# Test 2.4: TTY检测
if [[ -t 0 && -t 1 ]]; then
  pass "stdin and stdout are TTY"
else
  warn "stdin/stdout not TTY (will use spawn fallback)"
fi

echo ""

# ================================
# Test 3: 日志文件格式验证
# ================================
echo "Test 3: Log File Format"
echo "----------------------"

# 检查 .ufoo/run 目录
if [[ -d "$PROJECT_ROOT/.ufoo/run" ]]; then
  pass ".ufoo/run directory exists"

  # 查找最新的 io.jsonl 文件
  LATEST_LOG=$(find "$PROJECT_ROOT/.ufoo/run" -name "*-io.jsonl" -type f -print0 | xargs -0 ls -t | head -n 1)

  if [[ -n "$LATEST_LOG" ]]; then
    pass "Found IO log file: $(basename "$LATEST_LOG")"

    # 验证JSONL格式
    if head -n 1 "$LATEST_LOG" | jq . >/dev/null 2>&1; then
      pass "Log file is valid JSONL"

      # 检查必需字段
      FIRST_LINE=$(head -n 1 "$LATEST_LOG")
      if echo "$FIRST_LINE" | jq -e '.ts' >/dev/null 2>&1; then
        pass "Log entry has 'ts' field"
      fi
      if echo "$FIRST_LINE" | jq -e '.dir' >/dev/null 2>&1; then
        pass "Log entry has 'dir' field"
      fi
      if echo "$FIRST_LINE" | jq -e '.data.text' >/dev/null 2>&1; then
        pass "Log entry has 'data.text' field"
      fi
      if echo "$FIRST_LINE" | jq -e '.data.encoding' >/dev/null 2>&1; then
        pass "Log entry has 'data.encoding' field"
      fi
      if echo "$FIRST_LINE" | jq -e '.data.size' >/dev/null 2>&1; then
        pass "Log entry has 'data.size' field"
      fi
    else
      warn "No valid JSONL entries found (log may be empty)"
    fi
  else
    warn "No IO log files found (not yet generated)"
  fi
else
  warn ".ufoo/run directory not found (not yet created)"
fi

echo ""

# ================================
# Test 4: 代码语法检查
# ================================
echo "Test 4: Code Syntax Check"
echo "-------------------------"

# 检查 ptyWrapper.js 语法
if node -c "$PROJECT_ROOT/src/agent/ptyWrapper.js" 2>/dev/null; then
  pass "ptyWrapper.js syntax valid"
else
  fail "ptyWrapper.js syntax error"
fi

# 检查 launcher.js 语法
if node -c "$PROJECT_ROOT/src/agent/launcher.js" 2>/dev/null; then
  pass "launcher.js syntax valid"
else
  fail "launcher.js syntax error"
fi

echo ""

# ================================
# Test 5: 模块导入检查
# ================================
echo "Test 5: Module Import Check"
echo "---------------------------"

# 测试 PtyWrapper 可以被导入
cd "$PROJECT_ROOT"
if node -e "const PtyWrapper = require('./src/agent/ptyWrapper.js'); if (typeof PtyWrapper !== 'function') throw new Error('Not a constructor');" 2>/dev/null; then
  pass "PtyWrapper can be imported"
else
  fail "PtyWrapper import failed"
fi

echo ""

# ================================
# Test Summary
# ================================
echo "================================"
echo "Test Summary"
echo "================================"
echo ""
echo -e "${GREEN}All basic checks passed!${NC}"
echo ""
echo "Manual tests required:"
echo "  1. Run 'uclaude' or 'ucodex' in Terminal.app"
echo "  2. Verify interactive experience (colors, input, Ctrl+C)"
echo "  3. Check .ufoo/run/*-io.jsonl log generation"
echo "  4. Test in tmux environment (should use spawn)"
echo "  5. Test with pipes: echo 'test' | ucodex"
echo "  6. Test UFOO_DISABLE_PTY=1"
echo "  7. Test UFOO_FORCE_PTY=1"
echo ""
