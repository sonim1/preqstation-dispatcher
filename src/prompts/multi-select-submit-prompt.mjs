import {
  createPrompt,
  isDownKey,
  isEnterKey,
  isSpaceKey,
  isUpKey,
  useKeypress,
  useState,
} from "@inquirer/core";

function normalizeChoice(choice) {
  if (typeof choice !== "object" || choice === null || !("value" in choice)) {
    const name = String(choice);
    return {
      value: choice,
      name,
      short: name,
      checkedName: name,
      checked: false,
      disabled: false,
      description: null,
    };
  }

  const name = choice.name ?? String(choice.value);
  return {
    value: choice.value,
    name,
    short: choice.short ?? name,
    checkedName: choice.checkedName ?? name,
    checked: choice.checked ?? false,
    disabled: choice.disabled ?? false,
    description: choice.description ?? null,
  };
}

function selectedValuesFromChoices(choices) {
  return choices.filter((choice) => choice.checked).map((choice) => choice.value);
}

export function createMultiSelectState({ choices }) {
  const normalizedChoices = choices.map(normalizeChoice);
  return {
    choices: normalizedChoices,
    activeIndex: 0,
    errorMessage: null,
    selectedValues: selectedValuesFromChoices(normalizedChoices),
  };
}

export function moveActiveIndex(state, offset) {
  const totalItems = state.choices.length + 1;
  return {
    ...state,
    activeIndex: (state.activeIndex + offset + totalItems) % totalItems,
    errorMessage: null,
  };
}

export function toggleActiveItem(state) {
  if (state.activeIndex >= state.choices.length) {
    return {
      ...state,
      errorMessage: null,
    };
  }

  const nextChoices = state.choices.map((choice, index) =>
    index === state.activeIndex && !choice.disabled
      ? { ...choice, checked: !choice.checked }
      : choice,
  );
  return {
    ...state,
    choices: nextChoices,
    selectedValues: selectedValuesFromChoices(nextChoices),
    errorMessage: null,
  };
}

export async function submitOrToggleActiveItem(
  state,
  {
    validate = () => true,
  } = {},
) {
  if (state.activeIndex < state.choices.length) {
    return {
      done: false,
      state: toggleActiveItem(state),
    };
  }

  const isValid = await validate([...state.selectedValues]);
  if (isValid === true) {
    return {
      done: true,
      value: [...state.selectedValues],
      state: {
        ...state,
        errorMessage: null,
      },
    };
  }

  return {
    done: false,
    state: {
      ...state,
      errorMessage: isValid || "You must select a valid value",
    },
  };
}

function formatHelpText(config) {
  if (config.theme?.style?.keysHelpTip) {
    return config.theme.style.keysHelpTip();
  }
  return "Controls: [up/down] move  [space] toggle  [enter] continue";
}

export function formatChoiceLine(choice, active) {
  const cursor = active ? ">" : " ";
  const checkbox = choice.checked ? "◉" : "◯";
  const label = choice.checked ? choice.checkedName : choice.name;
  return `${cursor} ${checkbox} ${label}`;
}

export function formatSubmitLine(active) {
  return `${active ? ">" : " "} Submit`;
}

function renderPrompt(config, state, status) {
  const header = `? ${config.message}`;
  if (status === "done") {
    const answer = state.choices
      .filter((choice) => choice.checked)
      .map((choice) => choice.short)
      .join(", ");
    return `${header} ${answer}`;
  }

  const lines = [header];
  for (const [index, choice] of state.choices.entries()) {
    lines.push(formatChoiceLine(choice, index === state.activeIndex));
  }
  lines.push(formatSubmitLine(state.activeIndex === state.choices.length));

  const activeChoice = state.choices[state.activeIndex] ?? null;
  if (activeChoice?.description) {
    lines.push("");
    lines.push(activeChoice.description);
  }
  if (state.errorMessage) {
    lines.push("");
    lines.push(state.errorMessage);
  }
  lines.push(formatHelpText(config));
  return lines.join("\n");
}

const multiSelectSubmitPrompt = createPrompt((config, done) => {
  const [status, setStatus] = useState("idle");
  const [state, setState] = useState(() =>
    createMultiSelectState({
      choices: config.choices ?? [],
    }),
  );

  useKeypress(async (key) => {
    if (isUpKey(key)) {
      setState(moveActiveIndex(state, -1));
      return;
    }

    if (isDownKey(key)) {
      setState(moveActiveIndex(state, 1));
      return;
    }

    if (isSpaceKey(key)) {
      setState(toggleActiveItem(state));
      return;
    }

    if (!isEnterKey(key)) {
      return;
    }

    const result = await submitOrToggleActiveItem(state, {
      validate: config.validate,
    });
    if (result.done) {
      setStatus("done");
      done(result.value);
      return;
    }
    setState(result.state);
  });

  return renderPrompt(config, state, status);
});

export default multiSelectSubmitPrompt;
