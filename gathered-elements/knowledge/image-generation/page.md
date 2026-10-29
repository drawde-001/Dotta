# Image generation
URL: /elements/image-generation

A dot grid holds the frame while the image resolves out of a blur.

> For AI agents: a documentation index is available at [llms.txt](/llms.txt). Use `.md` for canonical markdown pages; `.mdx` is kept as a backwards-compatible alias on supported URL paths.

Image generation holds the frame for an image that has not arrived yet: a pulsing dot grid over a blurred gradient while generating, settling into a sharp gradient once done. With a runtime it tracks a tool call's status; standalone you drive `prompt` and `generating` yourself.

## Getting started

**With a runtime:**

An image tool renders through that tool's own toolkit entry: the model's prompt arrives as `args`, and the call's lifecycle as `status`.

1. ### Define the image toolkit

   ```
   "use generative";

   import { defineToolkit, externalTool } from "@assistant-ui/react";
   import { ImageGeneration } from "@/components/assistant-ui/elements/image-generation";

   export default defineToolkit({
     generate_image: {
       execute: externalTool(),
       render: ({ args, status }) => (
         <ImageGeneration
           prompt={args.prompt ?? ""}
           generating={status.type === "running"}
         />
       ),
     },
   });
   ```

   `execute: externalTool()` marks a tool a backend route or image provider runs, not the browser: the compiler drops it from the client bundle and keeps only `render`.

2. ### Register the toolkit

   ```
   "use client";

   import { AssistantRuntimeProvider, AuiConfig, Tools } from "@assistant-ui/react";
   import { useChatRuntime } from "@assistant-ui/ai-sdk";
   import { Thread } from "@/components/assistant-ui/elements/thread.aui";
   import toolkit from "./toolkit";

   export function App() {
     const runtime = useChatRuntime();
     const config = AuiConfig({ tools: Tools({ toolkit }) });

     return (
       <AssistantRuntimeProvider runtime={runtime} config={config}>
         <Thread />
       </AssistantRuntimeProvider>
     );
   }
   ```

   Every `generate_image` tool call in the thread now renders as this element, wherever `MessagePrimitive.Parts` places it in the assistant's reply.

**Standalone (no runtime):**

Standalone, `ImageGeneration` is fully controlled: you hold the prompt and whether generation is in flight, and optionally handle regeneration.

1. ### Hold the generation state

   ```
   "use client";

   import { useCallback, useEffect, useState } from "react";
   import { ImageGeneration } from "@/components/assistant-ui/elements/image-generation";

   export function Generation() {
     const prompt = "A calm mountain lake at dawn";
     const [generating, setGenerating] = useState(true);

     return (
       <ImageGeneration prompt={prompt} generating={generating} />
     );
   }
   ```

2. ### Flip it off once generation finishes

   `ImageGeneration` never receives the resulting URL, so hold it separately and swap in a real image renderer once it arrives. Keep regeneration available beside the result:

   ```
   const [imageUrl, setImageUrl] = useState<string | null>(null);

   const regenerate = useCallback(async () => {
     setGenerating(true);

     try {
       const url = await generateImage(prompt);
       setImageUrl(url);
     } finally {
       setGenerating(false);
     }
   }, [prompt]);

   useEffect(() => {
     void regenerate();
   }, [regenerate]);

   return imageUrl && !generating ? (
     <figure>
       <img src={imageUrl} alt={prompt} />
       <figcaption>
         <span>{prompt}</span>
         <button type="button" onClick={() => void regenerate()}>
           Regenerate image
         </button>
       </figcaption>
     </figure>
   ) : (
     <ImageGeneration prompt={prompt} generating={generating} />
   );
   ```

## Anatomy

```
<div data-slot="image-generation">
  <div>
    {/* the frame: an 8x8 pulsing dot grid, over a fixed decorative gradient */}
    <span>{/* "1024 × 1024" */}</span>
  </div>
  <div>
    <p>{/* prompt, or a shimmering "Generating" label while generating */}</p>
    {onRegenerate && (
      <button aria-label="Regenerate image" disabled={generating} />
    )}
  </div>
</div>
```

The frame never renders an actual generated image: the gradient behind the dot grid is a fixed decorative graphic in the source, present in both states and only changing its blur and opacity as `generating` flips. Nothing in this element accepts an image URL. Once a tool call resolves with a real one, hand it to a renderer that does; see the [Image](/elements/image) element. The dot grid's 64 dots pulse with a staggered delay while `generating` is true and fade to fully transparent once it is false. The regenerate button renders only when `onRegenerate` is provided. While generating, it fades out, is disabled, and is hidden from assistive technology until it can run again.

## Examples

### Handle regeneration

Pass `onRegenerate` to show the button and restart your generation flow:

```
<ImageGeneration
  prompt={prompt}
  generating={generating}
  onRegenerate={() => void regenerate()}
/>
```

### Restyle the frame

Both lanes take `className` on the root. The "1024 × 1024" label and the prompt row use `mono` and `ShimmerLabel` from `surfaces.tsx`.

```
<ImageGeneration className="w-64" /* ... */ />
```

## API reference

**With a runtime:**

### Tool render props

| Prop          | Type                                                           | Description                                                                                |
| ------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `args`        | `{ prompt?: string }`                                          | Model-supplied arguments. Partial while streaming.                                         |
| `status.type` | `"running" \| "complete" \| "incomplete" \| "requires-action"` | Lifecycle of the call. `"running"` is the only state that should show the generating dots. |

See [Tool UI](/docs/tools/tool-ui) for the full tool-call part shape.

**Standalone (no runtime):**

### ImageGeneration

| Prop           | Type         | Default  | Description                                                                                                                |
| -------------- | ------------ | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `prompt`       | `string`     | required | Shown below the frame once generation finishes.                                                                            |
| `generating`   | `boolean`    | required | While true, shows the pulsing dot grid and a shimmering "Generating" label in place of the prompt, and hides the gradient. |
| `onRegenerate` | `() => void` |          | Renders the regenerate button and runs when it is activated. The button is disabled while generating.                      |
| `className`    | `string`     |          | Merged onto the root.                                                                                                      |

All other `div` props are forwarded to the root.