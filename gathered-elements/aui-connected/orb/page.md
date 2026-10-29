# Orb
URL: /elements/orb

The realtime voice orb, with connection, mute, and speaking state controls.

> For AI agents: a documentation index is available at [llms.txt](/llms.txt). Use `.md` for canonical markdown pages; `.mdx` is kept as a backwards-compatible alias on supported URL paths.

Orb is the realtime voice surface: an animated indicator plus connect, mute, and disconnect actions. With a runtime it reads a live `RealtimeVoiceAdapter` session directly; standalone you drive the same orb and buttons from state and callbacks you own.

## Getting started

**With a runtime:**

A voice session needs a `RealtimeVoiceAdapter` on the runtime before any of this renders. See the [Realtime Voice guide](/docs/guides/voice) for adapter setup.

1. ### Configure a voice adapter

   ```
   import { useChatRuntime } from "@assistant-ui/ai-sdk";

   const runtime = useChatRuntime({
     adapters: {
       voice: myVoiceAdapter,
     },
   });
   ```

2. ### Render the orb and control bar

   ```
   import { Thread } from "@/components/assistant-ui/elements/thread.aui";
   import {
     VoiceControl,
     VoiceOrb,
   } from "@/components/assistant-ui/elements/voice.aui";
   import { AuiIf } from "@assistant-ui/react";

   export default function Chat() {
     return (
       <div className="flex h-full flex-col">
         <AuiIf condition={(s) => s.thread.capabilities.voice}>
           <div className="flex items-center justify-center py-6">
             <VoiceOrb />
           </div>
           <VoiceControl />
         </AuiIf>
         <div className="min-h-0 flex-1">
           <Thread />
         </div>
       </div>
     );
   }
   ```

   `VoiceOrb` takes no required props here: it reads the session state and live audio level itself. `VoiceControl` is the compact status dot plus connect/mute/disconnect bar; place it wherever a call toolbar belongs, independent of the orb's own position.

**Standalone (no runtime):**

Standalone, `VoiceOrb` is a controlled visual: you own the state and the volume, and it owns the WebGL animation.

1. ### Render the orb

   ```
   "use client";

   import { useState } from "react";
   import {
     VoiceOrb,
     type VoiceOrbState,
   } from "@/components/assistant-ui/elements/voice";

   export function Call() {
     const [state, setState] = useState<VoiceOrbState>("idle");
     return <VoiceOrb state={state} volume={0} />;
   }
   ```

2. ### Feed it a live audio level

   ```
   <VoiceOrb state={state} volume={micLevel} />
   ```

   `volume` (0 to 1) modulates the orb's speed, distortion, and glow on top of whatever `state` already sets, so the surface keeps reacting mid-utterance instead of holding one static look.

## Anatomy

```
<canvas className="aui-voice-orb" data-state={/* idle | connecting | listening | speaking | muted */} />

<div className="aui-voice-control">
  <span /> {/* status dot, colored by state */}
  {/* no session, or an ended one: */}
  <button>Connect</button>
  {/* starting: */}
  <span>Connecting...</span>
  {/* running: */}
  <button aria-label="Mute or Unmute" />
  <button aria-label="Disconnect" />
</div>
```

The orb's five states resolve in a fixed order: no session at all, or a session whose status is `"ended"`, is `idle`; a session whose status is `"starting"` is `connecting`, regardless of mute; otherwise a muted session is `muted`, even while the model is talking; otherwise the session's `mode` decides `speaking` or `listening`. `VoiceControl` follows a simpler split: no session or an ended one shows the connect button, a starting session shows only the "Connecting..." text, and a running session shows mute and disconnect. The status dot is grey while idle, a pulsing amber while connecting, green while listening or speaking, and red while muted.

## Examples

### States

**With a runtime:**

The runtime `VoiceOrb` accepts an explicit `state`, which overrides whatever it would otherwise derive from the live session, useful for a state gallery even inside a connected app:

```
{(["idle", "connecting", "listening", "speaking", "muted"] as const).map(
  (state) => (
    <VoiceOrb key={state} state={state} />
  ),
)}
```

It still needs a runtime ancestor: the override only replaces the derived `state`, and the component reads the session hooks regardless.

**Standalone (no runtime):**

```
import { VoiceOrb } from "@/components/assistant-ui/elements/voice";

{(["idle", "connecting", "listening", "speaking", "muted"] as const).map(
  (state) => (
    <VoiceOrb key={state} state={state} />
  ),
)}
```

### Palettes

Both lanes take a `variant`, a color axis independent of `state`: `default` (grey), `blue`, `violet`, or `emerald`.

```
<VoiceOrb variant="violet" />
```

### Where sessions come from

**With a runtime:**

Connect, mute, and disconnect all go through `useVoiceControls()`. A compact toggle for the composer needs only its `status.type` and the two calls:

```
function ComposerVoiceToggle() {
  const voiceState = useVoiceState();
  const { connect, disconnect } = useVoiceControls();
  const isActive =
    voiceState?.status.type === "running" ||
    voiceState?.status.type === "starting";

  return (
    <AuiIf condition={(s) => s.thread.capabilities.voice}>
      <button
        type="button"
        onClick={() => (isActive ? disconnect() : connect())}
        aria-label={isActive ? "End voice" : "Start voice"}
      >
        {isActive ? <PhoneOffIcon /> : <PhoneIcon />}
      </button>
    </AuiIf>
  );
}
```

**Standalone (no runtime):**

Standalone, you own the session lifecycle end to end: wire your own connect, mute, and disconnect handlers, and update `state` and `volume` as your session reports them.

```
<VoiceOrb
  state={isMuted ? "muted" : isSpeaking ? "speaking" : "listening"}
  volume={micLevel}
/>
```

## API reference

**With a runtime:**

### Sub-components

| Export                            | Description                                                                                                                               |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `VoiceOrb`                        | Animated orb. Derives `state` and `volume` from the session. Pass `state` to override the derived one; `volume` always tracks live audio. |
| `VoiceControl`                    | Status dot plus connect, "Connecting...", mute, and disconnect, switched by session status.                                               |
| `VoiceStatusDot`                  | The colored status dot on its own.                                                                                                        |
| `VoiceConnectButton`              | Calls `connect()`.                                                                                                                        |
| `VoiceMuteButton`                 | Toggles `mute()` / `unmute()`, labeled from the current `isMuted`.                                                                        |
| `VoiceDisconnectButton`           | Calls `disconnect()`.                                                                                                                     |
| `deriveVoiceOrbState(voiceState)` | The idle/connecting/muted/speaking/listening resolution from Anatomy, exported so custom indicators can reuse it.                         |

All sub-components are exported and usable independently for a custom layout.

### Voice state

| Selector                      | Type                                    | Description                                                                                                |
| ----------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `s.thread.capabilities.voice` | `boolean`                               | Whether a voice adapter is configured.                                                                     |
| `s.thread.voice`              | `VoiceSessionState \| undefined`        | `undefined` when no session exists.                                                                        |
| `s.thread.voice?.status.type` | `"starting" \| "running" \| "ended"`    | Session phase; an ended session also carries `reason` (`"finished" \| "cancelled" \| "error"`).            |
| `s.thread.voice?.isMuted`     | `boolean`                               | Microphone muted state.                                                                                    |
| `s.thread.voice?.mode`        | `"listening" \| "speaking"`             | Who is currently active.                                                                                   |
| `useVoiceVolume()`            | `number`                                | Live audio level (0 to 1), read outside the main state subscription to avoid re-rendering on every sample. |
| `useVoiceControls()`          | `{ connect, disconnect, mute, unmute }` | Each a `() => void` that calls the matching runtime method.                                                |

**Standalone (no runtime):**

### VoiceOrb

| Prop        | Type                                                             | Default     | Description                                              |
| ----------- | ---------------------------------------------------------------- | ----------- | -------------------------------------------------------- |
| `state`     | `"idle" \| "connecting" \| "listening" \| "speaking" \| "muted"` | `"idle"`    | Which animation preset to render.                        |
| `volume`    | `number`                                                         | `0`         | 0 to 1; adds to the state's speed, distortion, and glow. |
| `variant`   | `"default" \| "blue" \| "violet" \| "emerald"`                   | `"default"` | Color palette.                                           |
| `className` | `string`                                                         |             | Merged onto the canvas.                                  |