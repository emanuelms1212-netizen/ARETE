import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AA, contrastRatio } from './contrast';
import { contrastPairs, motion, palettes, radius, typeScale, type Palette } from './tokens';

const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');

/** `accentSoft` -> `--c-accent-soft` */
function cssVarName(token: keyof Palette): string {
  return `--c-${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

function declarationsIn(block: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const match of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    map.set(match[1]!, match[2]!.trim());
  }
  return map;
}

/** The first top-level `:root { ... }` block — the light theme. */
function lightBlock(): string {
  const start = css.indexOf(':root {');
  const end = css.indexOf('\n}', start);
  return css.slice(start, end);
}

/** The `:root` block inside the dark colour-scheme media query. */
function darkBlock(): string {
  const media = css.indexOf('@media (prefers-color-scheme: dark)');
  const start = css.indexOf(':root {', media);
  const end = css.indexOf('\n  }', start);
  return css.slice(start, end);
}

describe('colour contrast', () => {
  for (const theme of ['light', 'dark'] as const) {
    describe(theme, () => {
      const palette = palettes[theme];

      for (const pair of contrastPairs) {
        const required = AA[pair.threshold];

        it(`${pair.foreground} on ${pair.background} meets ${required}:1 — ${pair.where}`, () => {
          const ratio = contrastRatio(palette[pair.foreground], palette[pair.background]);
          expect(
            ratio,
            `${pair.foreground} (${palette[pair.foreground]}) on ${pair.background} ` +
              `(${palette[pair.background]}) is ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(required);
        });
      }
    });
  }

  it('does not silently drop a palette colour from the verified set', () => {
    const covered = new Set<string>();
    for (const pair of contrastPairs) {
      covered.add(pair.foreground);
      covered.add(pair.background);
    }

    // `line` is decorative — it separates, it never carries meaning, so WCAG
    // sets no ratio for it. Every other colour must appear in a verified pair.
    const exempt = new Set(['line']);
    for (const token of Object.keys(palettes.light)) {
      if (exempt.has(token)) continue;
      expect(covered.has(token), `${token} is never contrast-checked`).toBe(true);
    }
  });
});

describe('globals.css mirrors the token source of truth', () => {
  const blocks = { light: declarationsIn(lightBlock()), dark: declarationsIn(darkBlock()) };

  for (const theme of ['light', 'dark'] as const) {
    for (const [token, value] of Object.entries(palettes[theme])) {
      it(`${theme}: ${token}`, () => {
        const name = cssVarName(token as keyof Palette);
        expect(blocks[theme].get(name)?.toLowerCase()).toBe(value.toLowerCase());
      });
    }
  }

  it('declares a dark value for every light colour, and no extras', () => {
    const light = [...blocks.light.keys()].filter((k) => k.startsWith('--c-')).sort();
    const dark = [...blocks.dark.keys()].filter((k) => k.startsWith('--c-')).sort();
    expect(dark).toEqual(light);
  });

  it('declares every motion duration and easing', () => {
    for (const [name, value] of Object.entries(motion.duration)) {
      const kebab = name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      expect(blocks.light.get(`--duration-${kebab}`), `--duration-${kebab}`).toBe(value);
    }
    for (const [name, value] of Object.entries(motion.easing)) {
      expect(blocks.light.get(`--e-${name}`), `--e-${name}`).toBe(value);
    }
  });

  it('declares every type-scale step', () => {
    for (const [name, step] of Object.entries(typeScale)) {
      expect(css).toContain(`--text-${name}: ${step.size};`);
      expect(css).toContain(`--text-${name}--line-height: ${step.lineHeight};`);
    }
  });

  it('declares every radius step', () => {
    for (const [name, value] of Object.entries(radius)) {
      if (name === 'full') continue; // Tailwind ships rounded-full
      expect(css).toContain(`--radius-${name}: ${value};`);
    }
  });

  it('keeps the reduced-motion escape hatch', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toMatch(/\.animate-breathe\s*\{\s*animation: none/);
  });
});
