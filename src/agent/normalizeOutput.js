function extractTextFromObject(obj) {
  if (!obj || typeof obj !== "object") return "";
  if (obj.structured_output && typeof obj.structured_output === "object") {
    return JSON.stringify(obj.structured_output);
  }
  const candidates = ["reply", "output", "text", "message", "content", "output_text", "result"];
  for (const key of candidates) {
    const val = obj[key];
    if (typeof val === "string") return val;
  }
  return "";
}

function normalizeCliOutput(output) {
  if (!output) return "";
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    const parts = [];
    for (const item of output) {
      if (typeof item === "string") {
        parts.push(item);
        continue;
      }
      if (item && typeof item === "object") {
        if (item.item && typeof item.item === "object") {
          if (item.item.type === "agent_message" && typeof item.item.text === "string") {
            parts.push(item.item.text);
            continue;
          }
        }
        if (typeof item.text === "string") parts.push(item.text);
        else if (typeof item.content === "string") parts.push(item.content);
        else if (typeof item.output === "string") parts.push(item.output);
      }
    }
    return parts.join("\n").trim();
  }
  return extractTextFromObject(output);
}

module.exports = { normalizeCliOutput };
