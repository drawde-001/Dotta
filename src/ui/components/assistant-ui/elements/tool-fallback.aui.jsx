import React from 'react';
import { ToolCallCard } from '@/components/ToolCallCard';

export function ToolFallback(props) {
  const toolName = props.toolName || props.name || props.function?.name || 'tool';
  const args = props.args || props.arguments || {};
  const output = typeof props.result === 'string' ? props.result : props.output ? String(props.output) : undefined;
  const status = props.status?.type === 'running' || props.status === 'running' ? 'running' : 'done';

  return (
    <ToolCallCard
      name={toolName}
      args={typeof args === 'string' ? safeParse(args) : args}
      output={output}
      status={status}
    />
  );
}

function safeParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return { raw: str };
  }
}
