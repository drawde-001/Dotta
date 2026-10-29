# Media player
URL: /elements/media-player

Compact inline audio and video players for files and standalone media URLs.

> For AI agents: a documentation index is available at [llms.txt](/llms.txt). Use `.md` for canonical markdown pages; `.mdx` is kept as a backwards-compatible alias on supported URL paths.

Media player keeps a response's recording or clip in the conversation, with explicit controls and no autoplay.

## Getting started

**With a runtime:**

`File` turns playable `audio/*` and `video/*` file parts into the matching player automatically. Keep them as file parts so the runtime preserves the same wire shape for every adapter.

1. ### Render media file parts

   ```
   import { File } from "@/components/assistant-ui/elements/file";
   import { MessagePrimitive } from "@assistant-ui/react";

   function AssistantMessage() {
     return (
       <MessagePrimitive.Root>
         <MessagePrimitive.Parts components={{ File }} />
       </MessagePrimitive.Root>
     );
   }
   ```

   An `audio/mpeg` or `video/mp4` file with an `https:`, `blob:`, `data:` or base64 payload now plays in place and keeps its download action.

2. ### Return an audio URL from a backend tool

   ```
   export const createBriefingTool = {
     execute: async () => ({
       audioUrl: await createBriefingAudio(),
     }),
   };
   ```

   Send the URL back as a file part when the assistant reports the result:

   ```
   {
     type: "file",
     filename: "briefing.mp3",
     mimeType: "audio/mpeg",
     data: audioUrl,
     sourceType: "url",
   }
   ```

**Standalone (no runtime):**

Use either player directly when the URL is already part of your app state.

1. ### Play a recording or a clip

   ```
   import {
     AudioPlayer,
     VideoPlayer,
   } from "@/components/assistant-ui/elements/media-player";

   <AudioPlayer
     src="https://cdn.example.com/briefing.mp3"
     title="Daily briefing"
     durationMs={64_000}
   />

   <VideoPlayer
     src="https://cdn.example.com/overview.mp4"
     title="Overview"
     ratio="16:9"
   />
   ```

## Anatomy

```
<div data-slot="audio-player">
  <button aria-label="Play audio" />
  <input type="range" aria-label="Seek" />
  <audio preload="metadata" />
</div>

<div data-slot="video-player">
  <video controls playsInline preload="metadata" />
</div>
```

Audio uses the metadata duration when the browser has it, then falls back to `durationMs`. Its seek control reports the current position and total duration to assistive technology. Video leaves playback controls to the browser and shows a title and duration below the frame when either is known.

## Examples

### Audio artwork

`artwork` adds a 40px cover image without changing the playback controls:

```
<AudioPlayer
  src={episode.url}
  title={episode.title}
  artwork={episode.coverUrl}
  durationMs={episode.durationMs}
/>
```

### Video framing

`ratio` defaults to `"16:9"`. Choose `"4:3"`, `"1:1"`, or `"9:16"` for a fixed frame, or `"auto"` when the video should size itself:

```
<VideoPlayer src={clip.url} title={clip.title} ratio="9:16" />
```

## API reference

**With a runtime:**

### AudioPlayer

| Prop         | Type     | Default  | Description                             |
| ------------ | -------- | -------- | --------------------------------------- |
| `src`        | `string` | required | Audio URL or data URI.                  |
| `title`      | `string` |          | Label for the player and play button.   |
| `artwork`    | `string` |          | Optional 40px cover image URL.          |
| `durationMs` | `number` |          | Fallback duration until metadata loads. |

### VideoPlayer

| Prop         | Type                                           | Default  | Description                                    |
| ------------ | ---------------------------------------------- | -------- | ---------------------------------------------- |
| `src`        | `string`                                       | required | Video URL or data URI.                         |
| `poster`     | `string`                                       |          | Poster image URL for the native video element. |
| `title`      | `string`                                       |          | Caption and accessible video label.            |
| `ratio`      | `"16:9" \| "4:3" \| "1:1" \| "9:16" \| "auto"` | `"16:9"` | Frame aspect ratio.                            |
| `durationMs` | `number`                                       |          | Fallback duration until metadata loads.        |

**Standalone (no runtime):**

### AudioPlayer props

| Prop         | Type     | Default  | Description                             |
| ------------ | -------- | -------- | --------------------------------------- |
| `src`        | `string` | required | Audio URL or data URI.                  |
| `title`      | `string` |          | Label for the player and play button.   |
| `artwork`    | `string` |          | Optional 40px cover image URL.          |
| `durationMs` | `number` |          | Fallback duration until metadata loads. |

### VideoPlayer props

| Prop         | Type                                           | Default  | Description                                    |
| ------------ | ---------------------------------------------- | -------- | ---------------------------------------------- |
| `src`        | `string`                                       | required | Video URL or data URI.                         |
| `poster`     | `string`                                       |          | Poster image URL for the native video element. |
| `title`      | `string`                                       |          | Caption and accessible video label.            |
| `ratio`      | `"16:9" \| "4:3" \| "1:1" \| "9:16" \| "auto"` | `"16:9"` | Frame aspect ratio.                            |
| `durationMs` | `number`                                       |          | Fallback duration until metadata loads.        |

All other `div` props are forwarded to each player root.