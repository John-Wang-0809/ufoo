const fs = require("fs");
const path = require("path");
const Injector = require("../bus/inject");

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

    // 计算队列文件路径
    const safeSub = subscriber.replace(/:/g, "_");
    this.queueFile = path.join(
      projectRoot,
      ".ufoo/bus/queues",
      safeSub,
      "pending.jsonl"
    );

    // 初始化 injector
    const busDir = path.join(projectRoot, ".ufoo", "bus");
    this.injector = new Injector(busDir);
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
   */
  notify(newCount) {
    // 终端 bell
    process.stdout.write("\x07");

    // 终端标题栏显示未读数 - 使用小铃铛emoji
    const totalCount = this.getMessageCount();
    if (totalCount > 0) {
      process.stdout.write(`\x1b]0;🔔(${totalCount})\x07`);
    } else {
      // 清除标题栏的未读提示
      process.stdout.write(`\x1b]0;\x07`);
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
  }

  /**
   * 启动监听
   */
  start() {
    // 获取初始计数
    this.lastCount = this.getMessageCount();

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
