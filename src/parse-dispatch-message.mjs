const TASK_KEY_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\b/;

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

export function parseDispatchMessage(message) {
  if (!/\bpreq(?:station)?\b/i.test(message)) {
    return null;
  }

  const taskMatch = message.match(TASK_KEY_PATTERN);
  if (!taskMatch) {
    return null;
  }

  const taskKey = taskMatch[1];
  const [projectKey] = taskKey.split("-");

  return {
    engine: normalizeEngine(message),
    taskKey,
    projectKey,
    objective: parseObjective(message),
    branchName: parseBranchName(message),
    askHint: parseAskHint(message),
    rawMessage: message,
  };
}
