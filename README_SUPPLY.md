# Fork 协作流程 SOP（README_SUPPLY）

> 本文档记录 `John-Wang-0809/ufoo`（fork）与 `Icyoung/ufoo`（upstream）之间的协作流程。

---

## 1. Remote 配置

| Remote   | 用途           | URL                                        |
|----------|----------------|--------------------------------------------|
| origin   | 自己的 fork    | `https://github.com/John-Wang-0809/ufoo.git` |
| upstream | 上游原始仓库   | `https://github.com/Icyoung/ufoo.git`       |

> **注意**：upstream 的 push URL 已设为 `no_push`，防止误推到上游仓库。

```bash
# 查看 remote 配置
git remote -v

# 如需重新配置
git remote add upstream https://github.com/Icyoung/ufoo.git
git remote set-url --push upstream no_push
```

---

## 2. 同步上游代码（使用 --rebase 保持线性历史）

**在同步前，务必确保工作区干净：**

```bash
# 检查工作区是否干净（输出必须为空）
git status --porcelain

# 如果有未提交的修改，先 stash 或 commit
git stash   # 暂存
```

**执行同步：**

```bash
# 拉取上游最新代码（--prune 清理已删除的远端分支）
git fetch upstream --prune

# 用 rebase 方式合并上游变更，保持线性历史
git checkout master
git rebase upstream/master

# 推送到自己的 fork
git push origin master
```

> **为什么用 `--rebase` 而不是 merge？**
> - Rebase 产生线性提交历史，没有多余的 merge commit
> - 代码审查更清晰，`git log` 更易读
> - 如果遇到冲突，逐个 commit 解决，更容易定位问题

---

## 3. 功能开发流程

### 3.1 创建功能分支

**始终基于最新的 master 创建功能分支：**

```bash
# 先同步上游（参考第 2 节）
git fetch upstream --prune
git checkout master
git rebase upstream/master

# 基于 master 创建功能分支
git checkout -b feature/xxx master
```

### 3.2 开发与提交

```bash
# 在功能分支上开发
git add <files>
git commit -m "feat: 描述你的改动"

# 推送功能分支到 fork
git push origin feature/xxx
```

### 3.3 提交 Pull Request

```bash
# 使用 gh CLI 创建 PR（从 fork 到 upstream）
gh pr create --repo Icyoung/ufoo \
  --base master \
  --head John-Wang-0809:feature/xxx \
  --title "feat: 功能描述" \
  --body "详细说明改动内容和原因"
```

或在 GitHub 网页上手动创建 Pull Request。

---

## 4. 安全守则

| 规则 | 说明 |
|------|------|
| 禁止推送到 upstream | `git remote set-url --push upstream no_push` 已配置 |
| 同步前检查工作区 | `git status --porcelain` 输出必须为空 |
| fetch 加 `--prune` | 清理已删除的远端分支，避免引用过时分支 |
| 用 `--rebase` 同步 | 保持线性历史，避免不必要的 merge commit |
| 功能分支基于 master | `git checkout -b feature/xxx master`，避免基于过时代码开发 |

---

## 5. 常用命令速查

```bash
# 查看所有 remote
git remote -v

# 同步上游（完整流程）
git status --porcelain          # 确认工作区干净
git fetch upstream --prune      # 拉取上游 + 清理
git checkout master             # 切到 master
git rebase upstream/master      # rebase 同步
git push origin master          # 推到 fork

# 创建功能分支
git checkout -b feature/xxx master

# 查看与上游的差异
git log upstream/master..master --oneline

# 查看 PR 状态
gh pr list --repo Icyoung/ufoo
gh pr status
```

---

## 6. 故障排查

### Rebase 冲突

```bash
# 解决冲突后继续 rebase
git add <resolved-files>
git rebase --continue

# 如果想放弃 rebase
git rebase --abort
```

### 误推到错误分支

```bash
# 如果误推到 upstream（正常情况下 no_push 会阻止）
# 联系上游仓库管理员处理

# 如果推到 origin 的错误分支
git push origin --delete wrong-branch
```

---

*本文档由 Claude 协助生成，随项目演进持续更新。*
