import React, { useState } from 'react';
import { Plug } from 'lucide-react';

export function ElicitationForm({
  serverName = 'github-mcp',
  description = 'Confirm where the release notes should be published before the tool runs.',
  fields = [
    { id: 'repo', label: 'Repository', defaultValue: 'assistant-ui/assistant-ui', required: true },
  ],
  onSubmit,
  className = '',
  ...props
}) {
  const [values, setValues] = useState(() => {
    const init = {};
    fields.forEach((f) => (init[f.id] = f.defaultValue || ''));
    return init;
  });
  const [visibility, setVisibility] = useState('Private');
  const [notify, setNotify] = useState(true);

  const handleSubmit = (e) => {
    e?.preventDefault();
    onSubmit?.({ ...values, visibility, notify });
  };

  return (
    <form
      data-slot="elicitation-form"
      onSubmit={handleSubmit}
      className={`bg-background border border-border/60 dark:bg-popover flex w-full max-w-sm flex-col gap-3.5 rounded-[20px] p-4 ${className}`}
      {...props}
    >
      <div className="flex items-center gap-2.5">
        <span className="bg-foreground/[0.05] text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-lg">
          <Plug className="size-3.5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-foreground">
          {serverName}
        </span>
        <span className="font-mono text-[11px] tracking-tight text-muted-foreground shrink-0">
          needs input
        </span>
      </div>

      <p className="text-muted-foreground text-xs leading-relaxed">
        {description}
      </p>

      <div className="flex flex-col gap-2.5">
        {fields.map((field) => (
          <div key={field.id} className="flex flex-col gap-1">
            <label className="font-mono text-[11px] tracking-tight text-muted-foreground">
              {field.label}
              {field.required && <span className="text-muted-foreground"> *</span>}
            </label>
            <input
              type="text"
              required={field.required}
              value={values[field.id]}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [field.id]: e.target.value }))
              }
              className="bg-foreground/[0.04] forced-colors:border dark:bg-foreground/[0.06] text-foreground/80 focus-visible:ring-foreground/20 rounded-lg px-2.5 py-1.5 text-xs outline-none focus-visible:ring-1"
            />
          </div>
        ))}

        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] tracking-tight text-muted-foreground">
            Visibility
          </span>
          <div className="flex flex-wrap gap-1.5">
            {['Public', 'Private'].map((vis) => {
              const active = visibility === vis;
              return (
                <button
                  key={vis}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setVisibility(vis)}
                  className={`focus-visible:ring-foreground/20 rounded-full px-2.5 py-1 text-xs transition-colors outline-none focus-visible:ring-1 ${
                    active
                      ? 'bg-foreground text-background shadow-xs'
                      : 'bg-foreground/[0.04] forced-colors:border dark:bg-foreground/[0.06] text-muted-foreground'
                  }`}
                >
                  {vis}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] tracking-tight text-muted-foreground">
            Notify watchers
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={notify}
            onClick={() => setNotify((prev) => !prev)}
            className="focus-visible:ring-foreground/20 flex w-fit items-center gap-2 rounded-lg outline-none focus-visible:ring-1"
          >
            <span
              aria-hidden="true"
              className={`flex h-4 w-7 items-center rounded-full p-0.5 transition-colors ${
                notify ? 'bg-foreground' : 'bg-foreground/20'
              }`}
            >
              <span
                className={`size-3 rounded-full bg-background transition-transform ${
                  notify ? 'translate-x-3' : 'translate-x-0'
                }`}
              />
            </span>
            <span className="text-xs text-muted-foreground">
              {notify ? 'Enabled' : 'Disabled'}
            </span>
          </button>
        </div>
      </div>

      <button
        type="submit"
        className="bg-foreground text-background transition-[opacity,scale] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:opacity-90 active:scale-[0.96] motion-reduce:transition-none forced-colors:border flex h-8 items-center justify-center self-end rounded-full px-3.5 text-xs font-medium"
      >
        Submit
      </button>
    </form>
  );
}

export default ElicitationForm;
