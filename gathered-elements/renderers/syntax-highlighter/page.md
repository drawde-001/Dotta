# Syntax highlighter
URL: /elements/syntax-highlighter

Prism-based code highlighting for assistant markdown code blocks.

> For AI agents: a documentation index is available at [llms.txt](/llms.txt). Use `.md` for canonical markdown pages; `.mdx` is kept as a backwards-compatible alias on supported URL paths.

SyntaxHighlighter tokenizes one fenced code block with Prism, through `react-syntax-highlighter`'s async light build, and renders a light and a dark themed variant at once so a theme switch needs no re-render. With a runtime it replaces the plain code [Markdown text](/elements/markdown-text) renders by default; standalone you call it directly with the code, the language, and the tag components it mounts onto.

## Getting started

**With a runtime:**

1. ### Add it to MarkdownText's components

   ```
   import { SyntaxHighlighter } from "./syntax-highlighter";

   const defaultComponents = memoizeMarkdownComponents({
     SyntaxHighlighter,
     h1: /* ... */,
     // ...other elements...
   });
   ```

   Every fenced code block in an assistant message now highlights with the light and dark Coldark Prism token colors, drawn on the markdown code block's own themed background rather than Coldark's. [Shiki highlighter](/elements/shiki-highlighter) is the newer, runtime-aware alternative: reach for this one if you are already on `react-syntax-highlighter`.

**Standalone (no runtime):**

1. ### Call it directly

   ```
   import { SyntaxHighlighter } from "@/components/assistant-ui/elements/syntax-highlighter";

   <SyntaxHighlighter
     language="tsx"
     code="const x = 1;"
     components={{
       Pre: (props) => <pre {...props} />,
       Code: (props) => <code {...props} />,
     }}
   />;
   ```

   `components.Pre` and `components.Code` are the tag components the highlighter renders into. `react-markdown`'s code-block pipeline supplies real ones automatically inside MarkdownText; standalone, pass through elements yourself.

## Anatomy

```
<>
  <Pre className="dark:hidden">{/* Coldark Cold tokens */}</Pre>
  <Pre className="hidden dark:block">{/* Coldark Dark tokens */}</Pre>
</>
```

Both the light and the dark highlighter mount on every render; Tailwind's `dark:` classes hide whichever one does not match the active theme, so switching themes toggles visibility instead of re-tokenizing.

## Examples

### Register another language

```
import { PrismAsyncLight } from "react-syntax-highlighter";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";

PrismAsyncLight.registerLanguage("go", go);
```

Only `js`, `jsx`, `ts`, `tsx` (all mapped to the TSX grammar) and `python` are registered by default. A fenced block whose language is not registered still renders, unhighlighted.

### Load every language instead

```
import { makePrismAsyncSyntaxHighlighter } from "@assistant-ui/react-syntax-highlighter/full";
```

Swap the light-build import for the full build to skip per-language registration entirely, at the cost of a larger bundle.

### Choose a different theme

```
import { oneLight, oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";

const LightSyntaxHighlighter = makePrismAsyncLightSyntaxHighlighter({
  style: oneLight,
  customStyle: syntaxHighlighterCustomStyle,
  className: "dark:hidden",
});
```

Pass any `react-syntax-highlighter` Prism style in place of `coldarkCold`/`coldarkDark`; do the same for the dark variant.

## API reference

**With a runtime:**

MarkdownText's code-block pipeline supplies every prop below automatically, from the fenced block being rendered; you never call `SyntaxHighlighter` yourself once it is wired into `components`.

### SyntaxHighlighter

| Prop         | Type                                          | Default  | Description                                                           |
| ------------ | --------------------------------------------- | -------- | --------------------------------------------------------------------- |
| `language`   | `string`                                      | required | The fence's language, for example `"tsx"`. Selects the Prism grammar. |
| `code`       | `string`                                      | required | The code to highlight.                                                |
| `components` | `{ Pre: ComponentType; Code: ComponentType }` | required | Tag components the highlighter renders into, as `PreTag`/`CodeTag`.   |

**Standalone (no runtime):**

Construct all three yourself, as in the standalone step above.