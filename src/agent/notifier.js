const fs = require("fs");
const path = require("path");
const Injector = require("../bus/inject");
const { getUfooPaths } = require("../ufoo/paths");
const { shakeTerminalByTty } = require("../bus/shake");
const { isITerm2 } = require("../terminal/detect");
const iterm2 = require("../terminal/iterm2");

/**
 * Agent 消息通知监听器
 * 监控 pending.jsonl 队列文件，当有新消息时发出通知并自动触发
 */
class AgentNotifier {
  constructor(projectRoot, subscriber) {
    this.projectRoot = projectRoot;
    this.subscriber = subscriber;
    this.interval = 2000; // 2秒轮询一次
    this.lastCount = 0;
    this.timer = null;
    this.stopped = false;
    this.autoTrigger = process.env.UFOO_AUTO_TRIGGER !== "0"; // 默认启用自动触发
    this.lastNickname = "";

    // 计算队列文件路径
    const safeSub = subscriber.replace(/:/g, "_");
    const paths = getUfooPaths(projectRoot);
    this.queueFile = path.join(
      paths.busQueuesDir,
      safeSub,
      "pending.jsonl"
    );
    this.agentsFile = paths.agentsFile;

    // 初始化 injector
    const busDir = paths.busDir;
    this.injector = new Injector(busDir, paths.agentsFile);
  }

  /**
   * 读取当前订阅者昵称
   */
  getNickname() {
    try {
      if (!this.agentsFile || !fs.existsSync(this.agentsFile)) return "";
      const data = JSON.parse(fs.readFileSync(this.agentsFile, "utf8"));
      const meta = data.agents && data.agents[this.subscriber];
      return (meta && meta.nickname) ? String(meta.nickname) : "";
    } catch {
      return "";
    }
  }

  /**
   * 设置终端标题为昵称
   * iTerm2: 同时设置 badge 和 cwd
   */
  setTitle(nickname) {
    if (!nickname) return;
    if (!process.stdout || !process.stdout.isTTY) return;
    process.stdout.write(`\x1b]0;${nickname}\x07`);
    if (isITerm2()) {
      iterm2.setBadge(nickname);
      iterm2.setCwd(this.projectRoot);
    }
  }

  /**
   * 检查昵称变化并更新标题
   */
  refreshTitle() {
    const nickname = this.getNickname();
    if (!nickname || nickname === this.lastNickname) return;
    this.lastNickname = nickname;
    this.setTitle(nickname);
  }

  /**
   * 更新心跳时间戳（last_seen）
   */
  updateHeartbeat() {
    try {
      if (!this.agentsFile || !fs.existsSync(this.agentsFile)) return;
      const data = JSON.parse(fs.readFileSync(this.agentsFile, "utf8"));
      if (data.agents && data.agents[this.subscriber]) {
        data.agents[this.subscriber].last_seen = new Date().toISOString();
        fs.writeFileSync(this.agentsFile, JSON.stringify(data, null, 2));
      }
    } catch {
      // 心跳更新失败时静默忽略
    }
  }

  /**
   * 获取当前队列中的消息数量
   */
  getMessageCount() {
    try {
      if (!fs.existsSync(this.queueFile)) return 0;
      const content = fs.readFileSync(this.queueFile, "utf8");
      if (!content.trim()) return 0;
      return content.split("\n").filter((line) => line.trim()).length;
    } catch {
      return 0;
    }
  }

  /**
   * 发送终端通知
   * iTerm2: 使用 OSC 9 原生通知
   */
  notify(newCount) {
    if (isITerm2()) {
      const nick = this.lastNickname || this.subscriber;
      iterm2.notify(`${nick}: ${newCount} new message(s)`);
    }
    const tty = this.injector.readTty(this.subscriber);
    if (tty) {
      shakeTerminalByTty(tty);
    }
  }

  /**
   * 自动触发终端输入
   */
  async autoTriggerInput() {
    if (!this.autoTrigger) return;

    try {
      await this.injector.inject(this.subscriber);
    } catch (err) {
      // 自动触发失败时静默忽略，用户仍可手动输入
      // console.error("[notifier] Auto-trigger failed:", err.message);
    }
  }

  /**
   * 轮询检查队列
   */
  poll() {
    if (this.stopped) return;

    const currentCount = this.getMessageCount();

    // 有新消息
    if (currentCount > this.lastCount) {
      const newCount = currentCount - this.lastCount;
      this.notify(newCount);

      // 自动触发终端输入（非阻塞）
      this.autoTriggerInput().catch(() => {
        // 忽略触发失败
      });
    }

    this.lastCount = currentCount;
    this.refreshTitle();
    this.updateHeartbeat();
  }

  /**
   * 启动监听
   */
  start() {
    // 获取初始计数
    this.lastCount = this.getMessageCount();
    this.lastNickname = this.getNickname();
    if (this.lastNickname) {
      this.setTitle(this.lastNickname);
    }

    // 启动轮询
    this.timer = setInterval(() => {
      this.poll();
    }, this.interval);

    // 注册清理
    process.on("exit", () => this.stop());
    process.on("SIGINT", () => {
      this.stop();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      this.stop();
      process.exit(0);
    });
  }

  /**
   * 停止监听
   */
  stop() {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

module.exports = AgentNotifier;
