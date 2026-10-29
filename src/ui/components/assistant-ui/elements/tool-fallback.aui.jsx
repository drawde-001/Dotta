import React from 'react';
import { ToolCall } from './tool-call.aui.jsx';

export function ToolFallback(props) {
  const toolName = props.toolName || props.name || props.function?.name || 'tool';
  const args = props.args || props.arguments || {};
  const argStr = typeof args === 'string' ? args : JSON.stringify(args);
  const cleanArg = argStr && argStr !== '{}' ? (argStr.length > 50 ? argStr.slice(0, 50) + '...' : argStr) : '';
  const isComplete = props.status?.type !== 'running' && props.status !== 'running';
  const result = props.result ?? props.output;

  return (
    <ToolCall
      toolName={toolName}
      completedName={toolName}
      argument={cleanArg}
      result={result}
      isComplete={isComplete}
    />
  );
}

export default ToolFallback;
