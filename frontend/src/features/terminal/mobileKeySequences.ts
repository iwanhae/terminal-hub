export type LatchedModifiers = Readonly<{
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}>;

export type LatchedModifierKey = keyof LatchedModifiers;

export type LatchedInputChunkResult = Readonly<{
  applied: boolean;
  output: string;
}>;

export const DEFAULT_LATCHED_MODIFIERS: LatchedModifiers = {
  ctrl: false,
  alt: false,
  shift: false,
};

export const TERMINAL_KEY_SEQUENCES = {
  escape: "\x1b",
  tab: "\t",
  backTab: "\x1b[Z",
  arrowUp: "\x1b[A",
  arrowDown: "\x1b[B",
  arrowLeft: "\x1b[D",
  arrowRight: "\x1b[C",
  home: "\x1b[H",
  end: "\x1b[F",
  pageUp: "\x1b[5~",
  pageDown: "\x1b[6~",
} as const;

const SPECIAL_KEY_SEQUENCES: Record<string, string> = {
  Escape: TERMINAL_KEY_SEQUENCES.escape,
  Tab: TERMINAL_KEY_SEQUENCES.tab,
  Enter: "\r",
  Backspace: "\x7f",
  ArrowUp: TERMINAL_KEY_SEQUENCES.arrowUp,
  ArrowDown: TERMINAL_KEY_SEQUENCES.arrowDown,
  ArrowLeft: TERMINAL_KEY_SEQUENCES.arrowLeft,
  ArrowRight: TERMINAL_KEY_SEQUENCES.arrowRight,
  Home: TERMINAL_KEY_SEQUENCES.home,
  End: TERMINAL_KEY_SEQUENCES.end,
  PageUp: TERMINAL_KEY_SEQUENCES.pageUp,
  PageDown: TERMINAL_KEY_SEQUENCES.pageDown,
  Insert: "\x1b[2~",
  Delete: "\x1b[3~",
};

const MODIFIER_ONLY_KEYS = new Set([
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "CapsLock",
  "Fn",
  "OS",
]);

function applyCtrlModifier(char: string): string | null {
  if (char.length !== 1) return null;

  const upper = char.toUpperCase();
  const upperCodePoint = upper.codePointAt(0);
  if (
    upperCodePoint !== undefined &&
    upperCodePoint >= 65 &&
    upperCodePoint <= 90
  ) {
    return String.fromCodePoint(upperCodePoint - 64);
  }

  switch (char) {
    case " ":
    case "@":
    case "`":
    case "2": {
      return "\x00";
    }
    case "[":
    case "{":
    case "3": {
      return "\x1b";
    }
    case "\\":
    case "|":
    case "4": {
      return "\x1c";
    }
    case "]":
    case "}":
    case "5": {
      return "\x1d";
    }
    case "^":
    case "~":
    case "6": {
      return "\x1e";
    }
    case "_":
    case "7":
    case "/":
    case "?": {
      return "\x1f";
    }
    case "8": {
      return "\x7f";
    }
    default: {
      return null;
    }
  }
}

export function hasLatchedModifiers(modifiers: LatchedModifiers): boolean {
  return modifiers.ctrl || modifiers.alt || modifiers.shift;
}

export function sequenceFromLatchedKey(
  key: string,
  modifiers: LatchedModifiers,
): string | null {
  if (!hasLatchedModifiers(modifiers)) return null;
  if (MODIFIER_ONLY_KEYS.has(key)) return null;

  let sequence: string | null = null;

  if (key === "Tab" && modifiers.shift) {
    sequence = TERMINAL_KEY_SEQUENCES.backTab;
  } else if (key in SPECIAL_KEY_SEQUENCES) {
    sequence = SPECIAL_KEY_SEQUENCES[key];
  } else if (key.length === 1) {
    let char = key;
    if (modifiers.shift && /^[a-z]$/.test(char)) {
      char = char.toUpperCase();
    }

    sequence = modifiers.ctrl ? applyCtrlModifier(char) : char;
  }

  if (sequence === null) {
    return null;
  }

  if (modifiers.alt) {
    return `\x1b${sequence}`;
  }

  return sequence;
}

export function sequenceFromLatchedInputChunk(
  inputChunk: string,
  modifiers: LatchedModifiers,
): LatchedInputChunkResult {
  if (inputChunk.length === 0 || !hasLatchedModifiers(modifiers)) {
    return {
      applied: false,
      output: inputChunk,
    };
  }

  const characters = [...inputChunk];
  const firstCharacter = characters.shift();
  if (firstCharacter == null) {
    return {
      applied: false,
      output: inputChunk,
    };
  }

  const sequence = sequenceFromLatchedKey(firstCharacter, modifiers);
  if (sequence == null) {
    return {
      applied: false,
      output: inputChunk,
    };
  }

  return {
    applied: true,
    output: `${sequence}${characters.join("")}`,
  };
}
