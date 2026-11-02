const KEYWORDS = new Set([
  'import',
  'from',
  'await',
  'async',
  'const',
  'let',
  'var',
  'export',
  'default',
  'function',
  'return',
  'if',
  'else',
  'new',
  'type',
  'interface',
  'true',
  'false',
  'null',
  'undefined',
  'as',
  'extends',
  'keyof',
  'typeof',
]);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function paint(value: string, cls: string): string {
  return `<span class="${cls}">${value}</span>`;
}

function highlightCode(source: string): string {
  const token =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)|(\b\d[\d_]*\.?\d*\b)|(\b[A-Z][A-Za-z0-9_]*\b)|(\b[a-zA-Z_$][\w$]*\b)|([{}()[\].,;:=<>+\-*/|&!?]+)/g;

  let out = '';
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = token.exec(source))) {
    out += escapeHtml(source.slice(last, match.index));
    const [all, comment, string, number, typeName, word, punct] = match;
    if (comment) out += paint(escapeHtml(all), 'tok-cmt');
    else if (string) out += paint(escapeHtml(all), 'tok-str');
    else if (number) out += paint(escapeHtml(all), 'tok-num');
    else if (typeName) out += paint(escapeHtml(all), 'tok-type');
    else if (word) out += paint(escapeHtml(all), KEYWORDS.has(all) ? 'tok-kw' : 'tok-id');
    else if (punct) out += paint(escapeHtml(all), 'tok-punc');
    last = match.index + all.length;
  }
  return out + escapeHtml(source.slice(last));
}

function highlightJson(source: string): string {
  return source.replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|\b-?\d+(?:\.\d+)?\b/g,
    (all, string: string | undefined, key: string | undefined, bool: string | undefined) => {
      if (string && key) return paint(escapeHtml(string), 'tok-key') + key;
      if (string) return paint(escapeHtml(string), 'tok-str');
      if (bool) return paint(escapeHtml(all), 'tok-kw');
      return paint(escapeHtml(all), 'tok-num');
    },
  );
}

function highlightMarkup(source: string): string {
  return escapeHtml(source)
    .replace(/(&lt;!--[\s\S]*?--&gt;)/g, paint('$1', 'tok-cmt'))
    .replace(
      /(&lt;\/?)([A-Za-z0-9:-]+)((?:\s+[\w:-]+(?:=&quot;[^&]*&quot;)?)*)(\s*\/?&gt;)/g,
      (_, open, name, attrs, close) =>
        `${paint(open, 'tok-punc')}${paint(name, 'tok-type')}${String(attrs).replace(
          /([\w:-]+)(=)(&quot;[^&]*&quot;)/g,
          `${paint('$1', 'tok-key')}$2${paint('$3', 'tok-str')}`,
        )}${paint(close, 'tok-punc')}`,
    );
}

function highlightShell(source: string): string {
  return source
    .split('\n')
    .map((line) => {
      if (line.trimStart().startsWith('#')) return paint(escapeHtml(line), 'tok-cmt');
      return escapeHtml(line).replace(
        /^(\s*)([a-zA-Z][\w-]*)/,
        (_, space, cmd) => space + paint(cmd, 'tok-kw'),
      );
    })
    .join('\n');
}

export function highlight(code: string, lang: string): string {
  if (lang === 'json') return highlightJson(code);
  if (lang === 'xml' || lang === 'html') return highlightMarkup(code);
  if (lang === 'sh' || lang === 'bash') return highlightShell(code);
  return highlightCode(code);
}
