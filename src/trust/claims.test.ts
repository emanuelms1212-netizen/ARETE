import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A scan of every user-facing source file for claims ARETE must never make:
 * cures, diagnoses, guarantees, IQ, supplements, detoxes, "clinically proven".
 *
 * A word on its own is allowed when the same sentence negates it ("this is
 * not a diagnosis", "does not recommend any supplement") — that is ARETE
 * saying what it will not do, which is the point. Code comments are skipped;
 * they are read by developers, not users.
 */
const ROOT = join(process.cwd(), 'src');

const FORBIDDEN: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: 'cure', pattern: /\bcur(e|es|ed|ing)\b/i },
  { name: 'diagnosis', pattern: /\bdiagnos\w*/i },
  { name: 'guarantee', pattern: /\bguarantee\w*/i },
  { name: 'proven', pattern: /\b(clinically|scientifically) proven\b|\bproven to\b/i },
  { name: 'IQ', pattern: /\bIQ\b|\bmakes? you smarter\b|\braises? (your )?intelligence\b/ },
  { name: 'supplement', pattern: /\bsupplement\w*/i },
  { name: 'detox', pattern: /\bdetox\w*/i },
  { name: 'miracle', pattern: /\bmiracle\b/i },
  {
    name: 'treatment',
    pattern: /\btreats? (your )?(anxiety|depression|insomnia|adhd|injur\w*)\b/i,
  },
  {
    name: 'boost',
    pattern: /\bboosts? (your )?(testosterone|immunity|immune system|metabolism|brain)\b/i,
  },
  {
    name: 'causal',
    pattern: /\b(causes|caused|leads to|results in) (better|more|less|higher|lower)\b/i,
  },
];

const NEGATION =
  /\b(not|no|never|none|nor|without|nothing|isn['’]t|doesn['’]t|don['’]t|won['’]t|cannot|can['’]t|neither|rather than)\b/i;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    if (!/\.(ts|tsx)$/.test(name) || /\.test\.tsx?$/.test(name)) return [];
    return [path];
  });
}

function isComment(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('{/*')
  );
}

export function findClaims(text: string): { line: number; name: string; text: string }[] {
  const found: { line: number; name: string; text: string }[] = [];
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    if (isComment(line)) return;
    for (const rule of FORBIDDEN) {
      const match = rule.pattern.exec(line);
      if (!match) continue;
      // The sentence around the match, including a wrapped previous line.
      const context = `${lines[index - 1] ?? ''} ${line}`;
      const sentenceStart = Math.max(
        context.lastIndexOf('.', context.length - line.length + match.index),
        0,
      );
      const sentence = context.slice(sentenceStart, context.length - line.length + match.index);
      if (NEGATION.test(sentence)) continue;
      found.push({ line: index + 1, name: rule.name, text: line.trim() });
    }
  });
  return found;
}

describe('forbidden claims', () => {
  it('catches a claim and lets a negated one through', () => {
    expect(findClaims("const a = 'Guaranteed results in four weeks';")).toHaveLength(1);
    expect(findClaims("const a = 'Breathwork cures anxiety';")).toHaveLength(1);
    expect(findClaims("const a = 'This drill raises your IQ';")).toHaveLength(1);
    expect(findClaims("const a = 'This is not a diagnosis';")).toHaveLength(0);
    expect(findClaims("const a = 'Stretching is not guaranteed to prevent injury';")).toHaveLength(
      0,
    );
    expect(findClaims('// a comment may say supplement')).toHaveLength(0);
  });

  it('finds none in the app', () => {
    const hits = files(ROOT).flatMap((path) =>
      findClaims(readFileSync(path, 'utf8')).map(
        (hit) => `${relative(ROOT, path)}:${hit.line} [${hit.name}] ${hit.text}`,
      ),
    );
    expect(hits).toEqual([]);
  });
});
