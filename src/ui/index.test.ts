import { canUseCreateRoot } from './index';

describe('canUseCreateRoot', () => {
  it('returns true when createRoot is available', () => {
    expect(
      canUseCreateRoot({
        createRoot: () => ({
          render: () => {},
        }),
      } as any),
    ).toBe(true);
  });

  it('returns false when createRoot is missing', () => {
    expect(
      canUseCreateRoot({} as any),
    ).toBe(false);
  });
});
