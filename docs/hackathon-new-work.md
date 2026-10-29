# Hackathon New Work: Meta Model API Integration

## Phase 1: Model Registry and Selector

### Overview
Integrated Meta Model API model set into Omni with unified registry capabilities, selectable flags, and limit definitions.

### Key Changes
1. **Model Registry (`src/core/models/model-registry.js`)**:
   - Central registry mapping every model with capabilities:
     - `text`: boolean
     - `tools`: boolean
     - `vision`: boolean
     - `imageGeneration`: boolean
     - `speechToText`: boolean
     - `segmentation`: boolean
   - Configured `selectable` flag:
     - `muse-wonder-1.0`: `selectable: true`
     - `muse-spark-1.3`: `selectable: true`
     - `muse-spark-1.2`: `selectable: true`
     - `muse-spark-1.1`: `selectable: true`
     - `muse-image-1.0`: `selectable: false` (Tool backend only)
     - `muse-voice-transcribe-1.0`: `selectable: false` (ASR endpoint only)
     - `sam-3.1`: `selectable: false` (Tool backend only)
     - `muse-spark-open` & `muse-glimmer`: Open weights dynamically enabled only if custom environment endpoints are configured.
     - `Muse Code`: CLI agent, omitted from registry.
   - Enforced input limits:
     - Inline image: 50 MB, up to 50 images per request. Formats: jpeg, png, gif, webp, x-icon. User-role only.
     - Audio: 32 MB, 10 min max, mono 16-bit PCM WAV at 16/24 kHz.

2. **Model Adapter & Provider (`src/core/models/model-adapter.js`, `src/core/models/muse-provider.js`)**:
   - Base URL: `https://api.meta.ai/v1` (with `MODEL_API_BASE_URL` override).
   - Bearer token: `MODEL_API_KEY` (with fallback to `META_MUSE_API_KEY`).
   - Integrated with `OpenAiCompatibleModelAdapter` and provider resolution.

3. **UI Model Selector (`src/ui/components/InputDock.tsx`)**:
   - Exposed agent models (`muse-wonder-1.0`, `muse-spark-1.3`, `muse-spark-1.2`, `muse-spark-1.1`).
   - Default active model updated to `muse-spark-1.3`.
