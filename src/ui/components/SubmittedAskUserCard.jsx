import React from 'react';
import { HelpCircle } from 'lucide-react';

/**
 * SubmittedAskUserCard
 * Renders the submitted user responses to questions in the conversation thread,
 * matching reference screenshot (media_1793316522420_3e513437.png).
 *
 * Header: [?] N questions
 * Question: Bold white/zinc text
 * Answer: Muted grey text directly below
 * Dividers: Thin border between multiple questions
 */
export function SubmittedAskUserCard({ questions = [] }) {
  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    return null;
  }

  const cleanAnswer = (ans) => {
    if (!ans) return 'Confirmed';
    return String(ans)
      .replace(/^\(recommended\)\s*/i, '')
      .replace(/\s*\(recommended\)$/i, '')
      .trim();
  };

  const count = questions.length;
  const countLabel = `${count} ${count === 1 ? 'question' : 'questions'}`;

  return (
    <div className="my-2.5 w-full rounded-xl border border-zinc-800/80 bg-[#131316] p-4 select-text">
      {/* Header: [?] N questions */}
      <div className="flex items-center gap-1.5 mb-3 text-zinc-400">
        <HelpCircle size={14} className="text-zinc-400 shrink-0" />
        <span className="text-xs font-mono tracking-tight text-zinc-400">
          {countLabel}
        </span>
      </div>

      {/* Questions list */}
      <div className="flex flex-col">
        {questions.map((item, idx) => {
          const qText = item?.question || item?.title || 'Question';
          const aText = cleanAnswer(item?.answer || item?.selected);

          return (
            <React.Fragment key={idx}>
              {idx > 0 && <div className="border-t border-zinc-800/80 my-3" />}
              <div className="flex flex-col">
                <span className="text-[13.5px] font-semibold text-zinc-100 leading-snug break-words">
                  {qText}
                </span>
                <span className="mt-1 text-[13px] text-zinc-400 leading-relaxed break-words">
                  {aText}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

export default SubmittedAskUserCard;
