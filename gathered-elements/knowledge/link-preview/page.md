# Link preview
URL: /elements/link-preview

A compact card that gives a returned URL enough context to decide whether to open it.

> For AI agents: a documentation index is available at [llms.txt](/llms.txt). Use `.md` for canonical markdown pages; `.mdx` is kept as a backwards-compatible alias on supported URL paths.

Link preview turns a URL a tool returned into a small, readable card. It keeps the destination, title, description, and image together without making the whole transcript feel like a browser.

## Getting started

**With a runtime:**

A backend tool can return the URL metadata it resolved. Its renderer waits for that result, then hands the fields directly to `LinkPreview`.

1. ### Render a tool result

   ```
   import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
   import { LinkPreview } from "@/components/assistant-ui/elements/link-preview";

   type PreviewLinkResult = {
     href: string;
     title?: string;
     description?: string;
     image?: string;
     siteName?: string;
   };

   export const PreviewLinkToolUI: ToolCallMessagePartComponent<
     Record<string, never>,
     PreviewLinkResult
   > = ({ result }) => (result ? <LinkPreview {...result} /> : null);
   ```

2. ### Register the backend tool

   ```
   import { defineToolkit } from "@assistant-ui/react";
   import { PreviewLinkToolUI } from "@/components/assistant-ui/elements/preview-link-tool-ui";

   export const toolkit = defineToolkit({
     preview_link: {
       type: "backend",
       render: PreviewLinkToolUI,
     },
   });
   ```

   The backend returns `{ href, title, description, image, siteName }` as its tool result. While no result exists, the renderer returns `null`.

**Standalone (no runtime):**

Pass resolved metadata from your own fetcher or CMS. `href` is required, and the rest of the card is optional.

1. ### Render a resolved URL

   ```
   import { LinkPreview } from "@/components/assistant-ui/elements/link-preview";

   export function RelatedLink() {
     return (
       <LinkPreview
         href="https://react.dev/learn/you-might-not-need-an-effect"
         title="You might not need an Effect"
         description="Derive values during render before reaching for an Effect."
         siteName="React"
       />
     );
   }
   ```

## Anatomy

```
<article data-slot="link-preview" data-layout="card | compact">
  <div data-slot="link-preview-image" />
  <div>
    <span>{/* favicon or site initial, then site name */}</span>
    <a>{/* title and an accessible new-tab label */}</a>
    <span>{/* description */}</span>
  </div>
</article>
```

The default `card` layout puts the image above the text. `compact` moves a 64px thumbnail to the leading edge. If the image cannot load, its frame disappears. A supplied favicon takes the site square's place, otherwise the card uses the first letter of the site name or host.

When `href` is safe, the title opens it in a new tab and its hit target covers the card. Unsafe URLs render the same information without a link. Missing `title` and `siteName` fall back to the URL host when one is available.

## Examples

### Compact layout

Use the compact shape when the card shares a dense answer with other links.

```
<LinkPreview
  href="https://react.dev/learn/you-might-not-need-an-effect"
  title="You might not need an Effect"
  siteName="React"
  layout="compact"
/>
```

### Unsafe URL behavior

The component never turns an unsafe protocol into a link. It still shows caller-provided text, so a transcript can preserve the tool result without exposing navigation.

```
<LinkPreview
  href="javascript:alert(1)"
  title="Untrusted result"
  description="Shown as plain metadata, with no link."
/>
```

## API reference

**With a runtime:**

### Tool-call render props

| Prop         | Type                                                             | Description                                                      |
| ------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `result`     | `{ href, title?, description?, image?, siteName? } \| undefined` | The backend's resolved metadata. Render nothing until it exists. |
| `status`     | `ToolCallMessagePartStatus`                                      | The tool-call lifecycle state when the renderer needs it.        |
| `toolCallId` | `string`                                                         | Stable id for this tool invocation.                              |

Register the renderer on a backend tool's `render` field. See [Tool UI](/docs/tools/tool-ui) for the complete render-prop surface.

**Standalone (no runtime):**

### LinkPreview

| Prop          | Type                  | Default  | Description                                                 |
| ------------- | --------------------- | -------- | ----------------------------------------------------------- |
| `href`        | `string`              | required | Link target. Unsafe values render static content.           |
| `title`       | `string`              | host     | Card title.                                                 |
| `description` | `string`              |          | Supporting preview text.                                    |
| `image`       | `string`              |          | Preview image. Its frame is removed if loading fails.       |
| `imageAlt`    | `string`              | `""`     | Alternative text for the preview image.                     |
| `siteName`    | `string`              | host     | Site label beside the favicon or initial.                   |
| `favicon`     | `string`              |          | 16px site icon. A failed favicon falls back to the initial. |
| `layout`      | `"card" \| "compact"` | `"card"` | Image above the body or a leading 64px thumbnail.           |
| `className`   | `string`              |          | Merged onto the root.                                       |

All other `article` props are forwarded to the root.