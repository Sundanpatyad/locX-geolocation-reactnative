import {Check, Copy} from '@phosphor-icons/react';
import {useState} from 'react';
import {copyText} from '../lib/copy';
import {highlight} from '../lib/highlight';

export function CodeBlock({
  code,
  lang = 'ts',
  label,
}: {
  code: string;
  lang?: string;
  label: string;
}) {
  const [copied, setCopied] = useState(false);
  const source = code.replace(/^\n/, '').replace(/\n$/, '');

  async function copy() {
    const ok = await copyText(source);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="code">
      <div className="code-head">
        <span>{label}</span>
        <button
          className={`copy-btn${copied ? ' copied' : ''}`}
          type="button"
          aria-label={copied ? 'Copied' : 'Copy code'}
          onClick={() => void copy()}
        >
          {copied ? <Check size={14} weight="bold" /> : <Copy size={14} weight="bold" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre>
        <code dangerouslySetInnerHTML={{__html: highlight(source, lang)}} />
      </pre>
    </div>
  );
}

export function InstallCopy({command}: {command: string}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const ok = await copyText(command);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="install">
      <span className="prompt" aria-hidden="true">
        $
      </span>
      <code>{command}</code>
      <button
        className={`copy-btn${copied ? ' copied' : ''}`}
        type="button"
        aria-label={copied ? 'Copied install command' : 'Copy install command'}
        onClick={() => void copy()}
      >
        {copied ? <Check size={14} weight="bold" /> : <Copy size={14} weight="bold" />}
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>
    </div>
  );
}
