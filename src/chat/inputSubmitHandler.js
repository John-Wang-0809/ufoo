function createInputSubmitHandler(options = {}) {
  const {
    state,
    parseAtTarget = () => null,
    resolveAgentId = () => null,
    executeCommand = async () => false,
    queueStatusLine = () => {},
    send = () => {},
    logMessage = () => {},
    getAgentLabel = (id) => id,
    escapeBlessed = (value) => String(value || ""),
    markPendingDelivery = () => {},
    clearTargetAgent = () => {},
    enterAgentView = () => {},
    activateAgent = async () => {},
    getInjectSockPath = () => "",
    existsSync = () => false,
    commitInputHistory = () => {},
    focusInput = () => {},
  } = options;

  if (!state || typeof state !== "object") {
    throw new Error("createInputSubmitHandler requires a mutable state object");
  }

  async function tryActivateTargetAgent(agentId) {
    const meta = state.activeAgentMetaMap.get(agentId);
    const agentLaunchMode = (meta && meta.launch_mode) || "";
    const sockPath = getInjectSockPath(agentId);

    if (existsSync(sockPath)) {
      clearTargetAgent();
      enterAgentView(agentId);
      return true;
    }

    if (agentLaunchMode === "tmux" || agentLaunchMode === "terminal") {
      clearTargetAgent();
      try {
        const pendingActivation = activateAgent(agentId);
        if (pendingActivation && typeof pendingActivation.catch === "function") {
          pendingActivation.catch(() => {});
        }
      } catch {
        // Best-effort activation.
      }
      return true;
    }

    if (agentLaunchMode === "internal" || agentLaunchMode === "internal-pty") {
      clearTargetAgent();
      enterAgentView(agentId, { useBus: true });
      return true;
    }

    return false;
  }

  async function handleSubmit(value) {
    const text = String(value || "").trim();

    if (!text) {
      if (state.targetAgent) {
        const handled = await tryActivateTargetAgent(state.targetAgent);
        if (handled) return;
      }
      focusInput();
      return;
    }

    commitInputHistory(text);

    if (state.targetAgent) {
      const label = getAgentLabel(state.targetAgent);
      logMessage(
        "user",
        `{cyan-fg}→{/cyan-fg} {magenta-fg}@${escapeBlessed(label)}{/magenta-fg} ${escapeBlessed(text)}`
      );
      markPendingDelivery(state.targetAgent);
      send({ type: "bus_send", target: state.targetAgent, message: text });
      clearTargetAgent();
      focusInput();
      return;
    }

    const atTarget = parseAtTarget(text);
    if (atTarget) {
      if (!atTarget.message) {
        logMessage("error", "{white-fg}✗{/white-fg} @target requires a message");
        focusInput();
        return;
      }
      const resolvedTarget = resolveAgentId(atTarget.target) || atTarget.target;
      logMessage(
        "user",
        `{cyan-fg}→{/cyan-fg} {magenta-fg}@${escapeBlessed(atTarget.target)}{/magenta-fg} ${escapeBlessed(atTarget.message)}`
      );
      markPendingDelivery(resolvedTarget);
      send({ type: "bus_send", target: atTarget.target, message: atTarget.message });
      focusInput();
      return;
    }

    if (text.startsWith("/")) {
      logMessage("user", `{white-fg}→{/white-fg} ${escapeBlessed(text)}`);
      try {
        await executeCommand(text);
      } catch (err) {
        logMessage("error", `{white-fg}✗{/white-fg} Command error: ${escapeBlessed(err.message)}`);
      }
      focusInput();
      return;
    }

    if (state.pending && state.pending.disambiguate) {
      const idx = parseInt(text, 10);
      const choice = state.pending.disambiguate.candidates[idx - 1];
      if (choice) {
        queueStatusLine(`ufoo-agent processing (assigning ${choice.agent_id})`);
        send({
          type: "prompt",
          text: `Use agent ${choice.agent_id} to handle: ${state.pending.original || "the request"}`,
        });
        state.pending = null;
      } else {
        logMessage("error", "Invalid selection.");
      }
    } else {
      state.pending = { original: text };
      queueStatusLine("ufoo-agent processing");
      send({ type: "prompt", text });
      logMessage("user", `{white-fg}→{/white-fg} ${escapeBlessed(text)}`);
    }

    focusInput();
  }

  return {
    handleSubmit,
  };
}

module.exports = {
  createInputSubmitHandler,
};
