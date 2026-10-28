import React from 'react';
import { Paperclip } from 'lucide-react';
import { TooltipIconButton } from './tooltip-icon-button';

export function ComposerAddAttachment() {
  return (
    <TooltipIconButton tooltip="Attach file" className="size-7 rounded-full text-zinc-500 hover:text-zinc-300">
      <Paperclip className="size-3.5" />
    </TooltipIconButton>
  );
}

export function ComposerAttachments() {
  return null;
}

export function UserMessageAttachments() {
  return null;
}
