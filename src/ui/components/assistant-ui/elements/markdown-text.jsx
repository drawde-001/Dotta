import React from 'react';
import { useAuiState } from '@assistant-ui/react';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';

export function MarkdownText({ text: propText, content: propContent, children } = {}) {
  const auiText = useAuiState((s) => {
    const part = s.part;
    if (part && typeof part.text === 'string') return part.text;
    const msg = s.message;
    if (msg && Array.isArray(msg.content)) {
      return msg.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('');
    }
    return typeof msg?.content === 'string' ? msg.content : '';
  });

  const resolvedText =
    typeof propText === 'string'
      ? propText
      : typeof propContent === 'string'
        ? propContent
        : typeof children === 'string'
          ? children
          : auiText;

  return <MarkdownRenderer content={resolvedText} />;
}
