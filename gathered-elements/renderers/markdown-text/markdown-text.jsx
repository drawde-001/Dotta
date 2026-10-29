import React from 'react';
import { useAuiState } from '@assistant-ui/react';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';

function ConnectedMarkdownText() {
  const auiText = useAuiState((s) => {
    try {
      const part = s.part;
      if (part && typeof part.text === 'string') return part.text;
    } catch {
      // Not in a MessagePart scope
    }
    try {
      const msg = s.message;
      if (msg && Array.isArray(msg.content)) {
        return msg.content
          .filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join('');
      }
      return typeof msg?.content === 'string' ? msg.content : '';
    } catch {
      return '';
    }
  });

  return <MarkdownRenderer content={auiText || ''} />;
}

export function MarkdownText({ text: propText, content: propContent, children } = {}) {
  const directText =
    typeof propText === 'string'
      ? propText
      : typeof propContent === 'string'
        ? propContent
        : typeof children === 'string'
          ? children
          : null;

  if (directText !== null) {
    return <MarkdownRenderer content={directText} />;
  }

  return <ConnectedMarkdownText />;
}
