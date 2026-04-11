import { isEditableInputType, spliceTextBySelection } from './inputShortcuts';

describe('inputShortcuts', () => {
  test('treats text-like inputs as editable and excludes non-text controls', () => {
    expect(isEditableInputType('text')).toBe(true);
    expect(isEditableInputType('password')).toBe(true);
    expect(isEditableInputType('email')).toBe(true);
    expect(isEditableInputType('checkbox')).toBe(false);
    expect(isEditableInputType('button')).toBe(false);
  });

  test('splices clipboard text into the current selection', () => {
    expect(spliceTextBySelection('hello world', 6, 11, 'dao')).toEqual({
      nextValue: 'hello dao',
      nextCaret: 9,
    });

    expect(spliceTextBySelection('seek balance', 5, 12, 'harmony')).toEqual({
      nextValue: 'seek harmony',
      nextCaret: 12,
    });
  });
});
