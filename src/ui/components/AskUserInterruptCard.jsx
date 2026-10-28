import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Lock, HelpCircle, CornerDownLeft, ChevronLeft, ChevronRight } from 'lucide-react';

export function splitQuestionMessage(rawMessage) {
  if (!rawMessage || !rawMessage.trim()) {
    return { explanation: '', conciseQuestion: 'Please confirm or choose an option:' };
  }

  const trimmed = rawMessage.trim();

  // If already short (<= 80 chars) and single sentence, keep as is
  if (trimmed.length <= 80 && !trimmed.includes('\n')) {
    return { explanation: '', conciseQuestion: trimmed };
  }

  // Look for the final question ending with '?'
  const questionMatches = Array.from(trimmed.matchAll(/[^.!?\n]+(?:\?)/g)).map((m) => m[0].trim());
  if (questionMatches.length > 0) {
    const lastQuestion = questionMatches[questionMatches.length - 1];
    const questionIdx = trimmed.lastIndexOf(lastQuestion);
    const explanation = trimmed.slice(0, questionIdx).trim();

    let concise = lastQuestion.replace(/^(?:or|so|also|then)\s+/i, '');
    concise = concise.charAt(0).toUpperCase() + concise.slice(1);

    return {
      explanation,
      conciseQuestion: concise
    };
  }

  // If no '?' but has multiple sentences or newlines:
  const sentences = trimmed.split(/(?<=[.!\n])\s+/);
  if (sentences.length > 1) {
    const lastSentence = sentences[sentences.length - 1].trim();
    const explanation = sentences.slice(0, -1).join(' ').trim();
    return {
      explanation,
      conciseQuestion: lastSentence
    };
  }

  return {
    explanation: '',
    conciseQuestion: trimmed.length > 80 ? trimmed.slice(0, 80) + '...' : trimmed
  };
}

export function AskUserInterruptCard({ interrupt, onResolve }) {
  const metadata = interrupt?.metadata || {};
  const toolName = String(metadata?.toolName || interrupt?.toolName || '');
  const toolArgs = (metadata?.toolArgs || interrupt?.args || {});

  // Context: URL, command, file path, or explicit context string
  const baseContextText = useMemo(() => {
    if (typeof metadata?.context === 'string' && metadata.context.trim()) {
      return metadata.context.trim();
    }
    if (typeof toolArgs?.context === 'string' && toolArgs.context.trim()) {
      return toolArgs.context.trim();
    }
    if (typeof toolArgs?.url === 'string' && toolArgs.url.trim()) {
      try {
        const u = new URL(toolArgs.url.trim().startsWith('http') ? toolArgs.url.trim() : `https://${toolArgs.url.trim()}`);
        return u.hostname || toolArgs.url.trim();
      } catch {
        return toolArgs.url.trim();
      }
    }
    if (typeof toolArgs?.command === 'string' && toolArgs.command.trim()) {
      return toolArgs.command.trim();
    }
    if (typeof toolArgs?.path === 'string' && toolArgs.path.trim()) {
      return toolArgs.path.trim();
    }
    return null;
  }, [metadata, toolArgs]);

  // Main title / question: the shorter the card text is, the better!
  const baseTitleText = useMemo(() => {
    let raw = '';
    if (interrupt?.message && interrupt.message.trim()) {
      raw = interrupt.message.trim();
    } else if (interrupt?.question && interrupt.question.trim()) {
      raw = interrupt.question.trim();
    } else if (toolName === 'browser_read_page' || toolName === 'read_page') {
      raw = 'Allow reading this URL?';
    } else if (toolName === 'shell_run') {
      raw = 'Allow running this command?';
    } else if (toolName === 'file_delete') {
      raw = 'Allow deleting this file?';
    } else {
      raw = 'Permission or input required to proceed:';
    }
    const { conciseQuestion } = splitQuestionMessage(raw);
    return conciseQuestion;
  }, [interrupt?.message, interrupt?.question, toolName]);

  // Robust string extractor for options
  const extractOptionString = (opt) => {
    if (opt === null || opt === undefined) return '';
    if (typeof opt === 'string') {
      const trimmed = opt.trim();
      if (trimmed === '[object Object]' || !trimmed) return '';
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          return extractOptionString(JSON.parse(trimmed));
        } catch {}
      }
      return trimmed;
    }
    if (typeof opt === 'number' || typeof opt === 'boolean') {
      return String(opt);
    }
    if (typeof opt === 'object') {
      const candidates = [
        opt.text,
        opt.label,
        opt.title,
        opt.name,
        opt.option,
        opt.value,
        opt.description,
        opt.content,
        opt.answer,
        opt.choice
      ];
      for (const cand of candidates) {
        if (typeof cand === 'string' && cand.trim() && cand.trim() !== '[object Object]') {
          return cand.trim();
        }
        if (typeof cand === 'number') {
          return String(cand);
        }
      }
      for (const v of Object.values(opt)) {
        if (typeof v === 'string' && v.trim() && v.trim() !== '[object Object]') {
          return v.trim();
        }
        if (typeof v === 'number') {
          return String(v);
        }
      }
    }
    return '';
  };

  const normalizeOptionsList = (input) => {
    if (!input) return [];
    let list = [];
    if (Array.isArray(input)) {
      list = input;
    } else if (typeof input === 'object') {
      list = Object.values(input);
    } else if (typeof input === 'string') {
      try {
        const parsed = JSON.parse(input);
        if (Array.isArray(parsed)) list = parsed;
        else if (typeof parsed === 'object' && parsed !== null) list = Object.values(parsed);
        else list = [input];
      } catch {
        if (input.includes('\n')) {
          list = input.split('\n');
        } else {
          list = [input];
        }
      }
    }
    const results = [];
    for (const item of list) {
      const s = extractOptionString(item);
      if (s && s !== '[object Object]') {
        results.push(s);
      }
    }
    return results;
  };

  // All raw options
  const rawOptions = useMemo(() => {
    const fromMeta = normalizeOptionsList(metadata?.options);
    if (fromMeta.length > 0) return fromMeta;

    const fromArgs = normalizeOptionsList(toolArgs?.options);
    if (fromArgs.length > 0) return fromArgs;

    const fromQuestions = normalizeOptionsList(toolArgs?.questions?.[0]?.options);
    if (fromQuestions.length > 0) return fromQuestions;

    const fromChoices = normalizeOptionsList(toolArgs?.choices);
    if (fromChoices.length > 0) return fromChoices;

    if (toolName === 'browser_read_page' || toolName === 'read_page') {
      return [
        'Yes, allow this time',
        'No (tell the agent what to do instead)'
      ];
    }
    if (toolName === 'shell_run') {
      return [
        'Yes, allow this command',
        'No (tell the agent what to do instead)'
      ];
    }
    if (toolName === 'file_delete') {
      return [
        'Yes, allow deleting this file',
        'No, keep the file'
      ];
    }

    const msg = (interrupt?.message || interrupt?.question || '').toLowerCase();
    if (msg.includes('url') || msg.includes('link') || msg.includes('form')) {
      return [
        'https://docs.google.com/forms/d/e/1FAIpQLSe_GDPtLZsdA57xP.../viewform',
        'https://boards.greenhouse.io/demo/jobs/12345',
        'Type or paste custom URL below'
      ];
    }
    if (msg.includes('job') || msg.includes('role') || msg.includes('position')) {
      return [
        'Full Stack Engineer',
        'Frontend Engineer (React/TypeScript)',
        'Software Engineer (Node.js/Backend)'
      ];
    }

    return [];
  }, [metadata?.options, toolArgs, toolName, interrupt?.message, interrupt?.question]);

  // Break options into steps: Only paginate when options >= 5
  const steps = useMemo(() => {
    if (Array.isArray(metadata?.questions) && metadata.questions.length > 0) {
      return metadata.questions.map((q, idx) => ({
        title: String(q.question || q.title || `Question ${idx + 1}`),
        context: q.context || baseContextText,
        options: normalizeOptionsList(q.options),
        stepNumber: idx + 1
      }));
    }

    if (rawOptions.length < 5) {
      return [
        {
          title: baseTitleText,
          context: baseContextText,
          options: rawOptions,
          stepNumber: 1
        }
      ];
    }

    const CHUNK_SIZE = 3;
    const chunked = [];
    for (let i = 0; i < rawOptions.length; i += CHUNK_SIZE) {
      const slice = rawOptions.slice(i, i + CHUNK_SIZE);
      chunked.push({
        title: baseTitleText,
        context: baseContextText,
        options: slice,
        stepNumber: chunked.length + 1
      });
    }

    return chunked.length > 0
      ? chunked
      : [
          {
            title: baseTitleText,
            context: baseContextText,
            options: [],
            stepNumber: 1
          }
        ];
  }, [metadata?.questions, rawOptions, baseTitleText, baseContextText]);

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [selectedByIndex, setSelectedByIndex] = useState({ 0: 0 });
  const [manualInputByStep, setManualInputByStep] = useState({});
  const manualInputRef = useRef(null);

  const totalSteps = steps.length;
  const currentStep = steps[currentStepIndex] || steps[0];
  const currentOptions = currentStep.options;
  const currentSelectedIndex = selectedByIndex[currentStepIndex] ?? -1;

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (document.activeElement === manualInputRef.current) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (currentStepIndex < totalSteps - 1) {
            handleNext();
          } else {
            handleSubmit();
          }
        }
        return;
      }

      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= currentOptions.length) {
        e.preventDefault();
        setSelectedByIndex((prev) => ({
          ...prev,
          [currentStepIndex]: num - 1
        }));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (currentStepIndex < totalSteps - 1) {
          handleNext();
        } else {
          handleSubmit();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleSkip();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStepIndex, totalSteps, currentOptions, selectedByIndex, manualInputByStep]);

  const handleNext = () => {
    if (currentStepIndex < totalSteps - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const handleSubmit = () => {
    const chosenOptions = [];
    steps.forEach((s, idx) => {
      const selected = selectedByIndex[idx];
      if (selected !== undefined && s.options[selected]) {
        chosenOptions.push(s.options[selected]);
      }
    });

    const manualEntries = Object.entries(manualInputByStep)
      .map(([stepIdx, text]) => {
        const trimmed = text.trim();
        return trimmed ? `[Step ${parseInt(stepIdx, 10) + 1} instruction]: ${trimmed}` : null;
      })
      .filter(Boolean);

    const primarySelection = chosenOptions[0] || (currentOptions[0] ?? 'Confirmed');
    const hasManual = manualEntries.length > 0;
    const finalAnswer = hasManual
      ? `${chosenOptions.length ? chosenOptions.join('; ') + ' | ' : ''}${manualEntries.join('; ')}`
      : chosenOptions.join('; ') || 'Confirmed';

    const isApproved =
      !primarySelection.toLowerCase().startsWith('no') &&
      !primarySelection.toLowerCase().includes('deny') &&
      !primarySelection.toLowerCase().includes('reject');

    const questionsAndAnswers = steps.map((s, idx) => {
      const selected = selectedByIndex[idx];
      const opt = selected !== undefined && s.options[selected] ? s.options[selected] : undefined;
      const manual = manualInputByStep[idx]?.trim();
      return {
        question: s.title,
        answer: manual || opt || 'Confirmed',
      };
    });

    if (onResolve) {
      onResolve({
        approved: isApproved,
        answer: finalAnswer,
        chosenOptions,
        manualInputs: manualEntries,
        customText: manualEntries.join('; ') || undefined,
        completedSteps: totalSteps,
        questionsAndAnswers,
      });
    }
  };

  const handleSkip = () => {
    if (onResolve) {
      onResolve({
        approved: false,
        answer: 'Skipped by user',
        skipped: true
      });
    }
  };

  return (
    <div className="not-prose flex flex-col w-full rounded-2xl bg-[#161618] border border-white/10 p-4 shadow-2xl transition-all">
      {/* Top Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="mt-0.5 w-6 h-6 rounded-md bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
            {interrupt?.reason === 'confirmation' || toolName === 'shell_run' || toolName?.includes('action') ? (
              <Lock className="w-3.5 h-3.5 text-amber-400/90 stroke-[2.2]" />
            ) : (
              <HelpCircle className="w-3.5 h-3.5 text-zinc-300 stroke-[2.2]" />
            )}
          </div>
          <span className="text-[14px] font-semibold text-zinc-100 tracking-tight leading-snug">
            {currentStep.title}
          </span>
        </div>

        {totalSteps > 1 && (
          <span className="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full bg-white/5 text-zinc-400 border border-white/10 select-none">
            Step {currentStepIndex + 1} of {totalSteps}
          </span>
        )}
      </div>

      {/* Recessed Monospace Context Pill */}
      {currentStep.context && (
        <div className="mt-2.5 bg-[#0e0e11] text-zinc-300 font-mono text-[12px] px-3 py-1.5 rounded-lg border border-white/5 break-all select-all">
          {currentStep.context}
        </div>
      )}

      {/* Numbered Options List */}
      {currentOptions.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {currentOptions.map((opt, idx) => {
            const isSelected = currentSelectedIndex === idx;
            return (
              <div
                key={idx}
                onClick={() => {
                  setSelectedByIndex((prev) => ({
                    ...prev,
                    [currentStepIndex]: idx
                  }));
                }}
                className={`group flex items-center w-full px-3 py-2 rounded-lg text-left transition-all cursor-pointer select-none ${
                  isSelected
                    ? 'bg-white/10 text-white ring-1 ring-white/20'
                    : 'text-zinc-300 hover:bg-white/[0.04] hover:text-zinc-200'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded flex items-center justify-center text-[11px] font-semibold mr-2.5 shrink-0 transition-colors ${
                    isSelected
                      ? 'bg-white text-zinc-950 font-bold shadow-sm'
                      : 'bg-zinc-800/80 text-zinc-400 group-hover:text-zinc-300'
                  }`}
                >
                  {idx + 1}
                </span>
                <span className="text-[13px] leading-tight flex-1">
                  {opt}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* User Manual Input */}
      <div className="mt-3">
        <textarea
          ref={manualInputRef}
          value={manualInputByStep[currentStepIndex] || ''}
          onChange={(e) => {
            const val = e.target.value;
            setManualInputByStep((prev) => ({
              ...prev,
              [currentStepIndex]: val
            }));
          }}
          placeholder={
            currentOptions.length > 0
              ? "Tell the agent what to do instead or type custom details (optional)..."
              : "Type your response or paste URL / details here..."
          }
          rows={2}
          className="w-full bg-[#0e0e11] border border-zinc-700/80 rounded-lg p-2.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/20 transition-all resize-none"
        />
      </div>

      {/* Action Bar */}
      <div className="mt-3 pt-2.5 flex items-center justify-between border-t border-white/5">
        <div>
          {currentStepIndex > 0 ? (
            <button
              type="button"
              onClick={handleBack}
              className="text-[12.5px] text-zinc-400 hover:text-zinc-200 font-medium px-2 py-1.5 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <ChevronLeft size={14} />
              <span>Back</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSkip}
              className="text-[12.5px] text-zinc-400 hover:text-zinc-200 font-medium px-2 py-1.5 transition-colors cursor-pointer"
            >
              Skip
            </button>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          {currentStepIndex > 0 && (
            <button
              type="button"
              onClick={handleSkip}
              className="text-[12.5px] text-zinc-400 hover:text-zinc-200 font-medium px-2 py-1.5 transition-colors cursor-pointer"
            >
              Skip
            </button>
          )}

          {currentStepIndex < totalSteps - 1 ? (
            <button
              type="button"
              onClick={handleNext}
              className="bg-white hover:bg-zinc-200 active:bg-zinc-300 text-zinc-950 text-[12.5px] font-semibold px-3.5 py-1.5 rounded-lg flex items-center gap-1 shadow-sm transition-all cursor-pointer"
            >
              <span>Next ({currentStepIndex + 1}/{totalSteps})</span>
              <ChevronRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              className="bg-white hover:bg-zinc-200 active:bg-zinc-300 text-zinc-950 text-[12.5px] font-semibold px-4 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <span>Submit</span>
              <CornerDownLeft size={13} className="stroke-[2.5]" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
