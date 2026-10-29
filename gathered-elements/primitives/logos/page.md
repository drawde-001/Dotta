# Model logos
URL: /elements/logos

Inline SVG marks for OpenAI, Anthropic, and Google model providers.

> For AI agents: a documentation index is available at [llms.txt](/llms.txt). Use `.md` for canonical markdown pages; `.mdx` is kept as a backwards-compatible alias on supported URL paths.

`ClaudeLogo`, `OpenAILogo`, and `GeminiLogo` are inline SVG marks for the three model providers, sized and colored like any other icon. With a runtime you typically hand one to a model list as its icon; standalone you drop it wherever you'd show a provider mark.

## Getting started

**With a runtime:**

`ModelSelector`'s own `ModelOption` type carries an optional `icon: ReactNode`, rendered next to the model's name in both the trigger and the list. assistant-ui doesn't map marks to providers; set the icon when you build the option list.

1. ### Attach a logo to each model option

   ```
   import { ClaudeLogo, OpenAILogo, GeminiLogo } from "@/components/assistant-ui/elements/logos";
   import type { ModelOption } from "@/components/assistant-ui/elements/model-selector";

   export const models: ModelOption[] = [
     { id: "claude-sonnet-5", name: "Sonnet 5", icon: <ClaudeLogo className="size-4" /> },
     { id: "gpt-6-luna", name: "GPT-6", icon: <OpenAILogo className="size-4" /> },
     { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro", icon: <GeminiLogo className="size-4" /> },
   ];
   ```

   Pass `models` to `ModelSelectorRoot`, or the runtime-connected `ModelSelector` kit component, the way [Model selector](/elements/model-selector) documents; the selector renders the icon once it is on the option.

**Standalone (no runtime):**

Standalone, there's no state at all: render the mark you need, sized and colored like any other icon.

1. ### Render a mark

   ```
   import { ClaudeLogo, OpenAILogo, GeminiLogo } from "@/components/assistant-ui/elements/logos";

   export function Providers() {
     return (
       <div className="flex items-center gap-3">
         <OpenAILogo className="size-6" />
         <ClaudeLogo className="size-6" />
         <GeminiLogo className="size-6" />
       </div>
     );
   }
   ```

## Examples

### Recoloring

`OpenAILogo` fills with `currentColor`, so it follows a text color class like any other icon:

```
<OpenAILogo className="size-5 text-foreground/60" />
```

`ClaudeLogo` and `GeminiLogo` carry their own fixed brand color, a flat orange fill and a left-to-right gradient, so a text color class has no effect on either.

### Every prop `svg` takes, still works

`LogoProps` is exactly `ComponentProps<"svg">`, so `width`, `height`, `aria-hidden`, and any other native `svg` attribute pass straight through, each overriding this file's own defaults (`aria-hidden="true"`, and for OpenAI and Gemini, `fill`).

```
<ClaudeLogo width={20} height={20} aria-hidden={false} role="img" />
```

## API reference

**With a runtime:**

### ModelOption

| Field  | Type        | Description                                                                                                                                    |
| ------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `icon` | `ReactNode` | Rendered next to the model's name by `ModelSelector`'s trigger and list. Any of these three logos fits; nothing computes this mapping for you. |

There's no dedicated selector: this is a field you set on the array you already pass to `ModelSelectorRoot`. See [Model selector](/elements/model-selector) for the rest of that shape.

**Standalone (no runtime):**

### ClaudeLogo, OpenAILogo, GeminiLogo

| Export       | Fill                          | Notes                                                                                                  |
| ------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| `ClaudeLogo` | Fixed, `#D97757`              | Ignores `currentColor`; only the `<path>`'s own fill draws it.                                         |
| `OpenAILogo` | `currentColor`                | Recolors with text color utilities.                                                                    |
| `GeminiLogo` | Fixed, left-to-right gradient | Generates a fresh gradient id per instance with `useId`, so multiple copies on one page never collide. |

Each accepts `LogoProps`, exactly `ComponentProps<"svg">`. None of the three sets a default size, so pass `className="size-N"` or `width` / `height`.