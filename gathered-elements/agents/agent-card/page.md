# Agent card
URL: /elements/agent-card

Who you are about to talk to: its skills, its model, and the endpoint behind it.

> For AI agents: a documentation index is available at [llms.txt](/llms.txt). Use `.md` for canonical markdown pages; `.mdx` is kept as a backwards-compatible alias on supported URL paths.

An agent card is the identity a remote agent presents before you talk to it: a name, what it can do, and where it lives. With a runtime the card comes from the A2A agent you connected to; standalone you supply the same fields yourself.

## Getting started

**With a runtime:**

`@assistant-ui/react-a2a` fetches the remote agent's card as part of connecting to it, and exposes it through a read-only hook.

1. ### Connect to the agent

   ```
   "use client";

   import { AssistantRuntimeProvider } from "@assistant-ui/react";
   import { useA2ARuntime } from "@assistant-ui/react-a2a";

   export function A2AProvider({ children }: { children: React.ReactNode }) {
     const runtime = useA2ARuntime({ baseUrl: "https://weather-agent.example.com" });
     return (
       <AssistantRuntimeProvider runtime={runtime}>
         {children}
       </AssistantRuntimeProvider>
     );
   }
   ```

2. ### Render the discovered card

   ```
   "use client";

   import { useA2AAgentCard } from "@assistant-ui/react-a2a";
   import { AgentCard } from "@/components/assistant-ui/elements/agent-card";

   export function ConnectedAgentCard() {
     const agentCard = useA2AAgentCard();
     if (!agentCard) return null;

     return (
       <AgentCard
         name={agentCard.name}
         description={agentCard.description}
         provider={agentCard.provider?.organization ?? ""}
         version={agentCard.version}
         endpoint={agentCard.supportedInterfaces[0]?.url ?? ""}
         skills={agentCard.skills.map((skill) => ({
           name: skill.name,
           description: skill.description,
         }))}
         model="gpt-6-astra"
         connected
       />
     );
   }
   ```

   `useA2AAgentCard` returns `undefined` until the client has fetched the card, so the connect check above stands in for a loading state. The A2A protocol has no model identifier on the card itself and no separate connect step beyond reaching the agent, which is why `model` is a value your app supplies and `connected` is `true` once the card exists.

**Standalone (no runtime):**

Standalone, every field is a prop; nothing is fetched for you.

1. ### Render a card from data you hold

   ```
   import { AgentCard } from "@/components/assistant-ui/elements/agent-card";

   export default function AgentPage() {
     return (
       <AgentCard
         name="Weather Agent"
         description="Answers questions about current and forecast weather."
         provider="Acme Corp"
         version="1.4.0"
         model="gpt-6-astra"
         endpoint="weather-agent.example.com"
         skills={[
           { name: "get_forecast", description: "5-day forecast for a location" },
           { name: "get_alerts", description: "Active severe weather alerts" },
         ]}
         connected={false}
         onConnect={() => connectToAgent("weather-agent")}
       />
     );
   }
   ```

## Anatomy

```
<div data-slot="agent-card">
  <div>
    <span>{/* bot icon avatar */}</span>
    <div>
      <span>{name} <span>v{version}</span></span>
      <span>{provider}</span>
    </div>
  </div>
  <p>{description}</p>
  <div>{/* one row per skill: name pill + description */}</div>
  <div>
    <span>{endpoint}</span>
    <span>{model}</span>
  </div>
  <button>{connected ? "Connected" : "Connect"}</button>
</div>
```

The name, provider, and endpoint truncate rather than wrap; the model label keeps its full width. The button is the only interactive part: while `connected` is true it renders disabled with a check icon and the label "Connected"; otherwise it calls `onConnect` on click. An empty `skills` array renders no rows and no placeholder text.

## Examples

### Skills list

Each skill is a name and a one-line description; the name renders in the shared `field` pill token.

```
<AgentCard
  {...rest}
  skills={[
    { name: "search_docs", description: "Full-text search over indexed documents" },
    { name: "summarize", description: "Condense a document to key points" },
  ]}
/>
```

### Fetching your own agent registry

**Standalone (no runtime):**

A common standalone case is a directory of agents you maintain yourself, not an A2A endpoint. Hold the fetched record in state and render nothing until it arrives:

```
"use client";

import { useEffect, useState } from "react";
import { AgentCard } from "@/components/assistant-ui/elements/agent-card";

export function AgentDirectoryCard({ id }: { id: string }) {
  const [agent, setAgent] = useState<AgentRecord | null>(null);

  useEffect(() => {
    fetch(`/api/agents/${id}`)
      .then((res) => res.json())
      .then(setAgent);
  }, [id]);

  if (!agent) return null;
  return <AgentCard {...agent} onConnect={() => selectAgent(id)} />;
}
```

### Restyle the card

The root uses the shared `paper` surface; the version badge, endpoint, and model use `mono`; the connected state and skill names use `field`. Restyling those tokens in `surfaces.tsx` restyles every element built on them.

```
<AgentCard className="max-w-md rounded-3xl" {...rest} />
```

## API reference

**With a runtime:**

### Hook

| Hook                | Returns                     | Description                                                               |
| ------------------- | --------------------------- | ------------------------------------------------------------------------- |
| `useA2AAgentCard()` | `A2AAgentCard \| undefined` | The card fetched for the connected agent; `undefined` before it resolves. |

### Mapping A2AAgentCard onto AgentCard

| `AgentCard` prop | Source                                                                      |
| ---------------- | --------------------------------------------------------------------------- |
| `name`           | `agentCard.name`                                                            |
| `description`    | `agentCard.description`                                                     |
| `provider`       | `agentCard.provider?.organization`                                          |
| `version`        | `agentCard.version`                                                         |
| `endpoint`       | `agentCard.supportedInterfaces[0]?.url`                                     |
| `skills`         | `agentCard.skills.map(s => ({ name: s.name, description: s.description }))` |
| `model`          | Not present on `A2AAgentCard`; supply your own label.                       |
| `connected`      | `true` once `agentCard` is defined; A2A has no separate connect step.       |

**Standalone (no runtime):**

### AgentCard

| Prop          | Type                    | Default  | Description                                                   |
| ------------- | ----------------------- | -------- | ------------------------------------------------------------- |
| `name`        | `string`                | required | Agent name, truncated.                                        |
| `description` | `string`                | required | One paragraph, shown in full.                                 |
| `provider`    | `string`                | required | Shown under the name, truncated.                              |
| `version`     | `string`                | required | Rendered as `v{version}` next to the name.                    |
| `model`       | `string`                | required | Shown in the footer row, never truncated.                     |
| `endpoint`    | `string`                | required | Shown in the footer row, truncated.                           |
| `skills`      | `readonly AgentSkill[]` | required | Rendered as name/description rows; empty renders nothing.     |
| `connected`   | `boolean`               | required | Disables the button and swaps its label/icon when true.       |
| `onConnect`   | `() => void`            |          | Called when the button is clicked while `connected` is false. |
| `className`   | `string`                |          | Merged onto the root.                                         |

### AgentSkill

| Field         | Type     | Description                       |
| ------------- | -------- | --------------------------------- |
| `name`        | `string` | Shown as a pill.                  |
| `description` | `string` | Shown beside the pill, truncated. |

All other `div` props are forwarded to the root.