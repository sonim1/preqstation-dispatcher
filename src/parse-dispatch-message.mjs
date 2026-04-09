const TASK_KEY_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\b/;
const PROJECT_KEY_PATTERN = /^[A-Z][A-Z0-9_-]{0,19}$/u;

function normalizeEngine(message) {
  if (/\bclaude(?:-code)?\b/i.test(message)) {
    return "claude-code";
  }
  if (/\bcodex\b/i.test(message)) {
    return "codex";
  }
  if (/\bgemini(?:-cli)?\b/i.test(message)) {
    return "gemini-cli";
  }
  return "claude-code";
}

function parseBranchName(message) {
  const quotedMatch = message.match(/\bbranch(?:_name)?=(["'])(.*?)\1/i);
  if (quotedMatch) {
    return quotedMatch[2].trim() || null;
  }

  const bareMatch = message.match(/\bbranch(?:_name)?=([^\s]+)/i);
  return bareMatch ? bareMatch[1].trim() : null;
}

function parseAskHint(message) {
  const quotedMatch = message.match(/\bask_hint=(["'])(.*?)\1/i);
  if (quotedMatch) {
    return quotedMatch[2].trim() || null;
  }

  const bareMatch = message.match(/\bask_hint=([^\s]+)/i);
  return bareMatch ? bareMatch[1].trim() : null;
}

function parseInsightPromptB64(message) {
  const quotedMatch = message.match(/\binsight_prompt_b64=(["'])(.*?)\1/i);
  if (quotedMatch) {
    return quotedMatch[2].trim() || null;
  }

  const bareMatch = message.match(/\binsight_prompt_b64=([^\s]+)/i);
  return bareMatch ? bareMatch[1].trim() : null;
}

function parseObjective(message) {
  const normalized = message
    .replace(/^!\s*/u, "")
    .replace(/^\/skill\s+preqstation-dispatch\s*/iu, "")
    .replace(/^preqstation-dispatch\s*/iu, "")
    .replace(/^preqstation\s*/iu, "")
    .trim();

  const firstToken = normalized.split(/\s+/u)[0];
  return firstToken || "implement";
}

function parseProjectKey(message, objective, taskKey) {
  if (taskKey) {
    const [projectKey] = taskKey.split("-");
    return projectKey;
  }

  if (objective !== "insight" && objective !== "qa") {
    return null;
  }

  const normalized = message
    .replace(/^!\s*/u, "")
    .replace(/^\/skill\s+preqstation-dispatch\s*/iu, "")
    .replace(/^preqstation-dispatch\s*/iu, "")
    .replace(/^preqstation\s*/iu, "")
    .trim();

  const tokens = normalized.split(/\s+/u).filter(Boolean);
  const projectKey = tokens[1]?.trim().toUpperCase() ?? "";
  return PROJECT_KEY_PATTERN.test(projectKey) ? projectKey : null;
}

export function parseDispatchMessage(message) {
  if (!/\bpreq(?:station)?\b/i.test(message)) {
    return null;
  }

  const objective = parseObjective(message);
  const taskMatch = message.match(TASK_KEY_PATTERN);
  const taskKey = taskMatch ? taskMatch[1] : null;
  const projectKey = parseProjectKey(message, objective, taskKey);

  if (!taskKey && !projectKey) {
    return null;
  }

  return {
    engine: normalizeEngine(message),
    taskKey,
    projectKey,
    objective,
    branchName: parseBranchName(message),
    askHint: parseAskHint(message),
    insightPromptB64: parseInsightPromptB64(message),
    rawMessage: message,
  };
}
