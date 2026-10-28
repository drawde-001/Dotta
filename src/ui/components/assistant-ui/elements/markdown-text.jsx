import React from 'react';
import { useAuiState } from '@assistant-ui/react';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';

export function MarkdownText() {
  const text = useAuiState((s) => {
    // If inside a text part
    const part = s.part;
    if (part && typeof part.text === 'string') return part.text;
    // Otherwise from message
    const msg = s.message;
    if (msg && Array.isArray(msg.content)) {
      return msg.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('');
    }
    return typeof msg?.content === 'string' ? msg.content : '';
  });

  return <MarkdownRenderer content={text} />;
}
