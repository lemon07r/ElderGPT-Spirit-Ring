type TextEntryElement = HTMLInputElement | HTMLTextAreaElement;

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

type WindowWithRequire = Window & {
  require?: (moduleName: string) => unknown;
};

function setNativeValue(element: TextEntryElement, value: string) {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  descriptor?.set?.call(element, value);
}

export function isEditableInputType(type: string): boolean {
  return !NON_TEXT_INPUT_TYPES.has(type);
}

export function isTextEntryElement(element: Element | null): element is TextEntryElement {
  if (element instanceof HTMLTextAreaElement) {
    return true;
  }

  if (!(element instanceof HTMLInputElement)) {
    return false;
  }

  return isEditableInputType(element.type);
}

export function spliceTextBySelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  text: string,
) {
  const nextValue = `${value.slice(0, selectionStart)}${text}${value.slice(selectionEnd)}`;
  const nextCaret = selectionStart + text.length;
  return { nextValue, nextCaret };
}

export function insertTextAtSelection(element: TextEntryElement, text: string) {
  const start = element.selectionStart ?? element.value.length;
  const end = element.selectionEnd ?? start;
  const { nextValue, nextCaret } = spliceTextBySelection(element.value, start, end, text);

  setNativeValue(element, nextValue);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.setSelectionRange?.(nextCaret, nextCaret);
}

export async function readClipboardText(): Promise<string> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
      return await navigator.clipboard.readText();
    }
  } catch (_error) {
    // Fall through to Electron clipboard when the web clipboard is unavailable.
  }

  try {
    const electronClipboard = (
      (window as WindowWithRequire).require?.('electron') as
        | { clipboard?: { readText?: () => string } }
        | undefined
    )?.clipboard;
    return electronClipboard?.readText?.() ?? '';
  } catch (_error) {
    return '';
  }
}

export async function pasteClipboardIntoElement(element: TextEntryElement): Promise<boolean> {
  const text = await readClipboardText();
  if (!text) {
    return false;
  }

  insertTextAtSelection(element, text);
  return true;
}
