// Direction 3 Stage 8: mobile sheets, and the Ask composer riding above the on-screen keyboard.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { keyboardState } from '../../client/src/lib/keyboard';

describe('on-screen keyboard', () => {
  it('measures an overlaying keyboard (iOS: the visual viewport shrinks, the layout does not)', () => {
    expect(keyboardState(844, 844, { height: 508, offsetTop: 0 })).toEqual({ inset: 336, open: true });
  });
  it('treats a resizing keyboard (Android) as open with nothing to lift', () => {
    expect(keyboardState(500, 844, { height: 500, offsetTop: 0 })).toEqual({ inset: 0, open: true });
  });
  it('ignores browser bars and small viewport changes', () => {
    expect(keyboardState(844, 844, { height: 790, offsetTop: 0 }).open).toBe(false);
  });
  it('lifts the docked composer and hides the tab bar while the keyboard is open', () => {
    const css = readFileSync('client/src/index.css', 'utf8');
    expect(css).toContain('--dock-bottom: var(--tabbar-height);');
    expect(css).toMatch(/:root\[data-keyboard="open"\] \{\s*--dock-bottom: var\(--keyboard-inset\);/);
    expect(css).toMatch(/:root\[data-keyboard="open"\] \[data-testid="tab-bar"\] \{\s*display: none;/);
    expect(readFileSync('client/src/pages/AIAstrologer.tsx', 'utf8')).toContain('bottom-[var(--dock-bottom)]');
    expect(readFileSync('client/src/components/shell/AppShell.tsx', 'utf8')).toContain('useKeyboardInset()');
  });
});

describe('mobile sheets', () => {
  it('opens a Dasha period in a bottom sheet on mobile and inline on desktop', () => {
    const src = readFileSync('client/src/pages/DashaTimeline.tsx', 'utf8');
    expect(src).toContain('{sel && isMobile && (');
    expect(src).toContain('data-testid="dasha-sheet"');
    expect(src).toContain('{sel && !isMobile && (');
  });
  it('gives a long report a Contents sheet below the desktop layout', () => {
    expect(readFileSync('client/src/components/reports/ReportReader.tsx', 'utf8')).toContain('data-testid="button-report-contents"');
  });
});
