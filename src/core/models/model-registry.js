/**
 * model-registry.js
 *
 * Central registry listing every supported model with its capabilities:
 * text, tools, vision, image generation, speech to text, and segmentation,
 * plus a selectable flag.
 *
 * Requirements (Phase 1):
 * - One registry file lists every model with capabilities.
 * - Selectable flag: Only agent models (Muse Wonder and Muse Spark versions) are selectable.
 * - Muse Image, Muse Voice Transcribe, and SAM 3.1 exist in registry but selectable: false.
 * - Spark Open and Glimmer appear only if an endpoint is configured in env, otherwise hidden.
 * - Muse Code is a CLI agent, not a model, so omitted from registry/selector.
 * - Vision flag: muse-spark-1.3 is verified. Muse Wonder, muse-spark-1.1, and muse-spark-1.2
 *   are marked according to doc findings (and UNKNOWN if unspecified).
 * - Records limits: up to 50 images/req, 50 MB inline, formats jpeg, png, gif, webp, ico.
 */

export const IMAGE_INPUT_LIMITS = {
  maxImagesPerRequest: 50,
  maxInlineFileSizeBytes: 50000000, // 50 MB
  maxFilesApiFileSizeBytes: 1073741824, // 1 GiB
  supportedMimeTypes: [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/x-icon'
  ],
  userRoleOnly: true
};

export const AUDIO_INPUT_LIMITS = {
  maxFileSizeBytes: 33554432, // 32 MB
  maxDurationSeconds: 600, // 10 minutes
  supportedFormat: 'audio/wav', // Mono, 16-bit PCM at 16kHz or 24kHz
  realtimeMaxSessionSeconds: 3600 // 60 minutes
};

export const MODEL_REGISTRY = {
  'muse-wonder-1.0': {
    id: 'muse-wonder-1.0',
    name: 'Muse Wonder 1.0',
    provider: 'meta',
    selectable: true,
    capabilities: {
      text: true,
      tools: true,
      vision: true, // Models doc glance table confirms text, image, video, audio, pdf
      imageGeneration: false,
      speechToText: false,
      segmentation: false
    },
    contextWindow: 1048576,
    limits: {
      rpm: 3000,
      tpm: 4000000,
      image: IMAGE_INPUT_LIMITS
    },
    description: "Meta's flagship model for complex coding, multi-file agentic work, and long-horizon tasks."
  },

  'muse-spark-open': {
    id: 'muse-spark-open',
    name: 'Muse Spark Open',
    provider: 'modal',
    selectable: true,
    capabilities: {
      text: true,
      tools: true,
      vision: true,
      imageGeneration: false,
      speechToText: false,
      segmentation: false
    },
    contextWindow: 1048576,
    limits: {
      rpm: 3000,
      tpm: 4000000,
      image: IMAGE_INPUT_LIMITS
    },
    description: 'Open-weight high-throughput Muse Spark model served serverless via Modal vLLM with native tool calling.'
  },

  'muse-spark-1.3': {
    id: 'muse-spark-1.3',
    name: 'Muse Spark 1.3',
    provider: 'meta',
    selectable: true,
    capabilities: {
      text: true,
      tools: true,
      vision: true,
      imageGeneration: false,
      speechToText: false,
      segmentation: false
    },
    contextWindow: 1048576,
    limits: {
      rpm: 3000,
      tpm: 4000000,
      image: IMAGE_INPUT_LIMITS
    },
    description: 'Fast, high-capability agent model tuned for multi-step tool loops and browser navigation.'
  },

  'muse-spark-1.2': {
    id: 'muse-spark-1.2',
    name: 'Muse Spark 1.2',
    provider: 'meta',
    selectable: true,
    capabilities: {
      text: true,
      tools: true,
      vision: true,
      imageGeneration: false,
      speechToText: false,
      segmentation: false
    },
    contextWindow: 1048576,
    limits: {
      rpm: 3000,
      tpm: 4000000,
      image: IMAGE_INPUT_LIMITS
    },
    description: 'Previous version of Muse Spark with full multimodal audio/image support.'
  },

  'muse-spark-1.1': {
    id: 'muse-spark-1.1',
    name: 'Muse Spark 1.1',
    provider: 'meta',
    selectable: true,
    capabilities: {
      text: true,
      tools: true,
      vision: true,
      imageGeneration: false,
      speechToText: false,
      segmentation: false
    },
    contextWindow: 1048576,
    limits: {
      rpm: 3000,
      tpm: 4000000,
      image: IMAGE_INPUT_LIMITS
    },
    description: 'Original Muse Spark baseline agent model.'
  },

  'muse-image-1.0': {
    id: 'muse-image-1.0',
    name: 'Muse Image 1.0',
    provider: 'meta',
    selectable: false, // Backend tool only
    capabilities: {
      text: false,
      tools: false,
      vision: true, // accepts reference images
      imageGeneration: true,
      speechToText: false,
      segmentation: false
    },
    contextWindow: null,
    limits: {
      rpm: 150,
      tpm: null
    },
    description: 'Generates and edits images via prompt instructions; tool backend only.'
  },

  'muse-voice-transcribe-1.0': {
    id: 'muse-voice-transcribe-1.0',
    name: 'Muse Voice Transcribe 1.0',
    provider: 'meta',
    selectable: false, // Backend service only
    capabilities: {
      text: false,
      tools: false,
      vision: false,
      imageGeneration: false,
      speechToText: true,
      segmentation: false
    },
    contextWindow: null,
    limits: {
      concurrentStreams: 256,
      streamsPerHour: 16000,
      audio: AUDIO_INPUT_LIMITS
    },
    description: 'Speech-to-text transcription model; server endpoint only.'
  },

  'sam-3.1': {
    id: 'sam-3.1',
    name: 'SAM 3.1 (Segment Anything)',
    provider: 'meta',
    selectable: false, // Tool backend only
    capabilities: {
      text: false,
      tools: false,
      vision: true,
      imageGeneration: false,
      speechToText: false,
      segmentation: true
    },
    contextWindow: null,
    limits: {
      rpm: 3000,
      tpm: null
    },
    description: 'Segment Anything Model for bounding boxes and pixel-accurate masks.'
  }
};

/**
 * Returns dynamic registry entries including env-configured self-hosted open-weight models.
 */
export function getModelRegistry() {
  const registry = { ...MODEL_REGISTRY };

  // Muse Spark Open: Configured with deployed Modal endpoint
  const sparkOpenEndpoint = process.env.MODAL_MUSE_SPARK_URL || 'https://edelobi--ep-muse-spark-open-816b-a42b-server.us-west.modal.direct/v1';
  registry['muse-spark-open'] = {
    ...registry['muse-spark-open'],
    endpoint: sparkOpenEndpoint,
    provider: 'modal',
  };

  // Muse Glimmer: Only appears if custom endpoint configured in env
  const glimmerEndpoint = process.env.MUSE_GLIMMER_ENDPOINT || process.env.GLIMMER_URL;
  if (glimmerEndpoint) {
    registry['muse-glimmer'] = {
      id: 'muse-glimmer',
      name: 'Muse Glimmer (Self-Hosted)',
      provider: 'meta-self-hosted',
      selectable: true,
      endpoint: glimmerEndpoint,
      capabilities: {
        text: true,
        tools: false,
        vision: true,
        imageGeneration: false,
        speechToText: false,
        segmentation: false
      },
      contextWindow: 131072,
      description: 'Open-weight distilled multimodal model running on local/edge hardware.'
    };
  }

  return registry;
}

/**
 * Returns list of models allowed in the UI model selector.
 * Strictly agent models (Muse Wonder, Muse Spark versions) + configured open weight agent models.
 * Non-agent models (muse-image-1.0, muse-voice-transcribe-1.0, sam-3.1) are omitted.
 */
export function getSelectableModels() {
  const reg = getModelRegistry();
  return Object.values(reg).filter((m) => m.selectable === true);
}

export function getModelCapabilities(modelId) {
  const reg = getModelRegistry();
  const entry = reg[modelId];
  return entry ? entry.capabilities : null;
}
