# Mermaid diagram
URL: /elements/mermaid-diagram

Mermaid diagrams rendered inside messages, including partial streaming input.

> For AI agents: a documentation index is available at [llms.txt](/llms.txt). Use `.md` for canonical markdown pages; `.mdx` is kept as a backwards-compatible alias on supported URL paths.

MermaidDiagram renders a fenced `mermaid` code block as an SVG diagram, with a skeleton while the source is still streaming and a raw-source fallback if it fails to parse. With a runtime it derives the streaming flag from the active message part; standalone you pass `streaming` yourself.

## Getting started

**With a runtime:**

The kit wraps the base diagram and reads whether the current message part is still running, so the model can keep emitting `mermaid` syntax without a half-drawn diagram flashing on every token.

1. ### Add it to markdown-text's language overrides

   ```
   import { MermaidDiagram } from "@/components/assistant-ui/elements/mermaid-diagram.aui";

   const MarkdownTextImpl = () => {
     return (
       <MarkdownTextPrimitive
         remarkPlugins={[remarkGfm]}
         className="aui-md"
         components={defaultComponents}
         componentsByLanguage={{
           mermaid: { SyntaxHighlighter: MermaidDiagram },
         }}
       />
     );
   };
   ```

   A fenced `mermaid` code block in an assistant message now renders as a diagram instead of as code.

**Standalone (no runtime):**

Standalone, you own the streaming flag yourself.

1. ### Render a diagram with a controlled streaming flag

   ```
   import { MermaidDiagram } from "@/components/assistant-ui/elements/mermaid-diagram";

   <MermaidDiagram code={code} streaming={isStreaming} />;
   ```

   While `streaming` is true it shows a skeleton instead of parsing; set it to `false` once the Mermaid source is complete.

## Anatomy

```
// streaming
<div data-slot="mermaid-skeleton" aria-label="Rendering diagram" />

// parsed
<div data-slot="mermaid-zoom-wrap">
  <div data-slot="mermaid-diagram" />
  <button data-slot="mermaid-zoom-trigger" aria-label="Expand diagram" />
</div>

// unparseable
<div data-slot="mermaid-fallback">
  <pre>{/* raw mermaid source */}</pre>
  <p>diagram could not be rendered</p>
</div>
```

Rendering is synchronous: the diagram is built from `code` with `useMemo`, so a parse error is caught in the same pass rather than surfacing as a thrown render error. Source that renders an empty diagram, or a flowchart statement that ends in a link with no target (`A -->`), shows the fallback too, because the renderer skips what it cannot parse instead of throwing. The colors passed to the renderer (`bg`, `fg`, `muted`, `border`, `accent`) are CSS variables (`--background`, `--foreground`, and so on), so a diagram matches the active theme automatically. The renderer's `<style>` rules go into a constructed stylesheet, scoped so they reach only the diagram's own SVG, and its inline `style` attributes are applied through the CSSOM, so diagrams render under a Content Security Policy without `'unsafe-inline'`. Browsers without constructable stylesheets (Safari before 16.4) get the renderer's original markup instead, so under a strict CSP they need `'unsafe-inline'` in `style-src` to style diagrams. The Google Fonts `@import` is not loaded in the constructed stylesheet, so labels use Inter only when the page already provides it and `system-ui` otherwise. The zoom trigger appears on hover (or on focus) and opens a full-screen overlay: scroll to zoom between 0.5x and 4x centered on the pointer, drag to pan, `+`/`-`/reset/close buttons, Escape to close, and a focus trap while it is open.

## Examples

### Wrap a diagram you already rendered

`MermaidDiagram.Zoom` (also exported as `MermaidZoom`) is the pan-and-zoom chrome on its own. Wrap any pre-rendered SVG in it to get the same expand button and lightbox, without going through Mermaid parsing:

```
import { MermaidZoom } from "@/components/assistant-ui/elements/mermaid-diagram";

<MermaidZoom svg={mySvgString}>
  <div dangerouslySetInnerHTML={{ __html: mySvgString }} />
</MermaidZoom>;
```

### Restyle the frame

Both lanes take `className` on the root, applied to whichever of the three states (skeleton, diagram, fallback) is currently showing.

```
<MermaidDiagram className="rounded-none" code={code} />
```

## API reference

**With a runtime:**

### Message part state

| Selector                                     | Type      | Description                                                                                                     |
| -------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------- |
| `s.optional.part?.status.type === "running"` | `boolean` | Read with `useAuiState`. Forwarded as `streaming`. `true` while the current message part exists and is running. |

`node`, `components`, and `language` (react-markdown's code-block wrapper props) are accepted for type compatibility with `MarkdownText`'s `componentsByLanguage` slot and otherwise unused.

### MermaidDiagram

| Prop        | Type      | Default  | Description                                                                                                                                                                                  |
| ----------- | --------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code`      | `string`  | required | Mermaid source. Supports flowcharts, sequence, class, state, and entity-relationship diagrams, and XY charts (bar, line, or combined); other diagram types fall back to the raw-source view. |
| `streaming` | `boolean` | `false`  | Shows the skeleton instead of parsing while `true`.                                                                                                                                          |
| `className` | `string`  |          | Merged onto whichever state is showing.                                                                                                                                                      |

### MermaidZoom

| Prop       | Type        | Default  | Description                                                                                                                                                     |
| ---------- | ----------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `svg`      | `string`    | required | The SVG markup to show in the zoomed overlay. Its `id` attributes and internal references are rewritten so the overlay copy never collides with the inline one. |
| `children` | `ReactNode` | required | The inline content, rendered as-is alongside the expand trigger.                                                                                                |

**Standalone (no runtime):**

Pass `streaming` yourself, as in the standalone step above; every other prop behaves identically to the runtime lane.