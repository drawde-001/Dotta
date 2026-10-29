import React from 'react';

/**
 * SubmittedAskUserCard
 * Renders the submitted user responses to questions in the conversation thread,
 * matching Screenshot 1 (media_1793310268695_959623fd.png).
 *
 * Muted question text stacked above bold white answers with clean card spacing.
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

  return (
    <div className="my-3 w-full rounded-2xl border border-[#222228] bg-[#141417] p-5 sm:p-6 shadow-sm select-text">
      <div className="flex flex-col space-y-4">
        {questions.map((item, idx) => {
          const qText = item?.question || item?.title || 'Question';
          const aText = cleanAnswer(item?.answer || item?.selected);

          return (
            <div key={idx} className="flex flex-col">
              <span className="text-[14px] font-normal leading-relaxed text-zinc-400">
                {qText}
              </span>
              <span className="mt-1 text-[15px] font-semibold tracking-tight text-white">
                {aText}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SubmittedAskUserCard;
