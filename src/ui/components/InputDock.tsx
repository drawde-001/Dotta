import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Zap,
  ShieldAlert,
  ShieldCheck,
  Paperclip,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  Mic,
  ArrowUp,
  Square,
  Plus,
  ScrollText,
  LayoutGrid,
  Puzzle,
} from 'lucide-react';
import { AskUserInterruptCard } from './AskUserInterruptCard';
import { ComposerAttachments } from './assistant-ui/elements/attachment.aui';
import { ComposerVoiceDictation } from './assistant-ui/elements/composer-voice.aui';

export type ComposerMode = 'Plan' | 'Ask' | 'Build';
export type EffortLevel = 'Low' | 'Medium' | 'High';
export type ProviderType = 'muse' | 'google' | 'kimi' | 'openai' | 'spark';
export type ModelFilterTab = 'fav' | 'all';

export interface ModelOption {
  id: string;
  name: string;
  effort: EffortLevel;
  provider: ProviderType;
  isFav: boolean;
  efforts: EffortLevel[];
  badge?: string;
  desc?: string;
  hasRealApi?: boolean;
}

interface ContextTagOption {
  tag: string;
  category: string;
}

export const MAX_ATTACHMENTS = 5;
export const MAX_INDIVIDUAL_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15 MB per individual attachment

export interface StagedAttachment {
  id: string;
  order: number;
  name: string;
  size: number;
  type: string;
  state?: 'uploading' | 'done' | 'error';
  progress?: number;
  previewUrl?: string;
  dataUrl?: string;
  textContent?: string;
  file?: File;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: 'muse-spark-open',
    name: 'Muse Spark Open',
    effort: 'High',
    provider: 'muse',
    isFav: true,
    efforts: ['Low', 'Medium', 'High'],
    badge: 'Default',
    desc: 'Open-weight high-throughput Muse Spark model served serverless via Modal vLLM with native tool calling',
    hasRealApi: true,
  },
  {
    id: 'muse-wonder-1.0',
    name: 'Muse Wonder 1.0',
    effort: 'High',
    provider: 'muse',
    isFav: true,
    efforts: ['Low', 'Medium', 'High'],
    badge: 'Meta Flagship',
    desc: 'Complex multi-file software engineering and long-horizon agentic workflows',
    hasRealApi: true,
  },
  {
    id: 'muse-spark-1.3',
    name: 'Muse Spark 1.3',
    effort: 'High',
    provider: 'muse',
    isFav: true,
    efforts: ['Low', 'Medium', 'High'],
    badge: 'Meta Muse',
    desc: 'Tuned for agentic tool loops, browser navigation, and high-throughput coding',
    hasRealApi: true,
  },
  {
    id: 'muse-spark-1.2',
    name: 'Muse Spark 1.2',
    effort: 'Medium',
    provider: 'muse',
    isFav: true,
    efforts: ['Low', 'Medium', 'High'],
    badge: 'Meta Muse',
    desc: 'Previous Muse Spark release with full multimodal audio/image support',
    hasRealApi: true,
  },
  {
    id: 'muse-spark-1.1',
    name: 'Muse Spark 1.1',
    effort: 'Medium',
    provider: 'muse',
    isFav: true,
    efforts: ['Low', 'Medium', 'High'],
    badge: 'Meta Muse',
    desc: 'Baseline Muse Spark agent model',
    hasRealApi: true,
  },
  {
    id: 'gpt-56-terra',
    name: 'GPT-5.6 Terra (GPT-4o)',
    effort: 'High',
    provider: 'openai',
    isFav: false,
    efforts: ['Low', 'Medium', 'High'],
    badge: 'OpenAI API',
    desc: 'Flagship OpenAI reasoning and autonomous execution',
    hasRealApi: true,
  },
  {
    id: 'gpt-56-sol',
    name: 'GPT-5.6 Sol (Mini)',
    effort: 'Medium',
    provider: 'openai',
    isFav: false,
    efforts: ['Low', 'Medium', 'High'],
    badge: 'Fast Code',
    desc: 'High-throughput, low-latency OpenAI code engine',
    hasRealApi: true,
  },
  {
    id: 'sonnet-5',
    name: 'Claude 3.5 Sonnet',
    effort: 'High',
    provider: 'spark',
    isFav: false,
    efforts: ['Low', 'Medium', 'High'],
    badge: 'Anthropic',
    desc: 'Frontier Claude agentic reasoning and tool execution',
    hasRealApi: true,
  },
  {
    id: 'opus-48',
    name: 'Claude 3 Opus',
    effort: 'High',
    provider: 'spark',
    isFav: false,
    efforts: ['Low', 'Medium', 'High'],
    badge: 'Deep Arch',
    desc: 'Deep architecture, complex coding, and strategic planning',
    hasRealApi: true,
  },
  {
    id: 'fable-5',
    name: 'Fable 5 (Claude)',
    effort: 'High',
    provider: 'spark',
    isFav: false,
    efforts: ['Low', 'Medium', 'High'],
    badge: 'Agentic',
    desc: 'Autonomous multi-step tool agent engine',
    hasRealApi: true,
  },
  {
    id: 'openai-compatible',
    name: 'OpenAI Compatible Endpoint',
    effort: 'High',
    provider: 'openai',
    isFav: false,
    efforts: ['Low', 'Medium', 'High'],
    badge: 'Universal',
    desc: 'Compatible with any OpenAI endpoint (Ollama, vLLM, DeepSeek, Groq, OpenRouter)',
    hasRealApi: true,
  },
  {
    id: 'kimi-k3',
    name: 'Kimi K3 (Moonshot)',
    effort: 'High',
    provider: 'kimi',
    isFav: false,
    efforts: ['Low', 'Medium', 'High'],
    badge: 'Moonshot',
    desc: 'Ultra-long context reasoning and document synthesis',
    hasRealApi: true,
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    effort: 'High',
    provider: 'google',
    isFav: false,
    efforts: ['Low', 'Medium', 'High'],
    badge: 'Google API',
    desc: 'Fast multimodal Google flagship model',
    hasRealApi: true,
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro',
    effort: 'High',
    provider: 'google',
    isFav: false,
    efforts: ['Low', 'Medium', 'High'],
    badge: 'Deep Thinking',
    desc: 'Frontier Gemini 3.1 Pro deep reasoning and code architecture',
    hasRealApi: true,
  },
];

const CONTEXT_OPTIONS: ContextTagOption[] = [
  { tag: '@codebase', category: 'Workspace' },
  { tag: '@docs', category: 'References' },
  { tag: '@terminal', category: 'Last output' },
];

const ALL_MODES: ComposerMode[] = ['Plan', 'Ask', 'Build'];

function MetaLogo({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="flex-shrink-0"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>Meta</title>
      <path
        d="M6.897 4h-.024l-.031 2.615h.022c1.715 0 3.046 1.357 5.94 6.246l.175.297.012.02 1.62-2.438-.012-.019a48.763 48.763 0 00-1.098-1.716 28.01 28.01 0 00-1.175-1.629C10.413 4.932 8.812 4 6.896 4z"
        fill="url(#meta-grad-0)"
      />
      <path
        d="M6.873 4C4.95 4.01 3.247 5.258 2.02 7.17a4.352 4.352 0 00-.01.017l2.254 1.231.011-.017c.718-1.083 1.61-1.774 2.568-1.785h.021L6.896 4h-.023z"
        fill="url(#meta-grad-1)"
      />
      <path
        d="M2.019 7.17l-.011.017C1.2 8.447.598 9.995.274 11.664l-.005.022 2.534.6.004-.022c.27-1.467.786-2.828 1.456-3.845l.011-.017L2.02 7.17z"
        fill="url(#meta-grad-2)"
      />
      <path
        d="M2.807 12.264l-2.533-.6-.005.022c-.177.918-.267 1.851-.269 2.786v.023l2.598.233v-.023a12.591 12.591 0 01.21-2.44z"
        fill="url(#meta-grad-3)"
      />
      <path
        d="M2.677 15.537a5.462 5.462 0 01-.079-.813v-.022L0 14.468v.024a8.89 8.89 0 00.146 1.652l2.535-.585a4.106 4.106 0 01-.004-.022z"
        fill="url(#meta-grad-4)"
      />
      <path
        d="M3.27 16.89c-.284-.31-.484-.756-.589-1.328l-.004-.021-2.535.585.004.021c.192 1.01.568 1.85 1.106 2.487l.014.017 2.018-1.745a2.106 2.106 0 01-.015-.016z"
        fill="url(#meta-grad-5)"
      />
      <path
        d="M10.78 9.654c-1.528 2.35-2.454 3.825-2.454 3.825-2.035 3.2-2.739 3.917-3.871 3.917a1.545 1.545 0 01-1.186-.508l-2.017 1.744.014.017C2.01 19.518 3.058 20 4.356 20c1.963 0 3.374-.928 5.884-5.33l1.766-3.13a41.283 41.283 0 00-1.227-1.886z"
        fill="#0082FB"
      />
      <path
        d="M13.502 5.946l-.016.016c-.4.43-.786.908-1.16 1.416.378.483.768 1.024 1.175 1.63.48-.743.928-1.345 1.367-1.807l.016-.016-1.382-1.24z"
        fill="url(#meta-grad-6)"
      />
      <path
        d="M20.918 5.713C19.853 4.633 18.583 4 17.225 4c-1.432 0-2.637.787-3.723 1.944l-.016.016 1.382 1.24.016-.017c.715-.747 1.408-1.12 2.176-1.12.826 0 1.6.39 2.27 1.075l.015.016 1.589-1.425-.016-.016z"
        fill="#0082FB"
      />
      <path
        d="M23.998 14.125c-.06-3.467-1.27-6.566-3.064-8.396l-.016-.016-1.588 1.424.015.016c1.35 1.392 2.277 3.98 2.361 6.971v.023h2.292v-.022z"
        fill="url(#meta-grad-7)"
      />
      <path
        d="M23.998 14.15v-.023h-2.292v.022c.004.14.006.282.006.424 0 .815-.121 1.474-.368 1.95l-.011.022 1.708 1.782.013-.02c.62-.96.946-2.293.946-3.91 0-.083 0-.165-.002-.247z"
        fill="url(#meta-grad-8)"
      />
      <path
        d="M21.344 16.52l-.011.02c-.214.402-.519.67-.917.787l.778 2.462a3.493 3.493 0 00.438-.182 3.558 3.558 0 001.366-1.218l.044-.065.012-.02-1.71-1.784z"
        fill="url(#meta-grad-9)"
      />
      <path
        d="M19.92 17.393c-.262 0-.492-.039-.718-.14l-.798 2.522c.449.153.927.222 1.46.222.492 0 .943-.073 1.352-.215l-.78-2.462c-.167.05-.341.075-.517.073z"
        fill="url(#meta-grad-10)"
      />
      <path
        d="M18.323 16.534l-.014-.017-1.836 1.914.016.017c.637.682 1.246 1.105 1.937 1.337l.797-2.52c-.291-.125-.573-.353-.9-.731z"
        fill="url(#meta-grad-11)"
      />
      <path
        d="M18.309 16.515c-.55-.642-1.232-1.712-2.303-3.44l-1.396-2.336-.011-.02-1.62 2.438.012.02.989 1.668c.959 1.61 1.74 2.774 2.493 3.585l.016.016 1.834-1.914a2.353 2.353 0 01-.014-.017z"
        fill="url(#meta-grad-12)"
      />
      <defs>
        <linearGradient id="meta-grad-0" x1="75.897%" x2="26.312%" y1="89.199%" y2="12.194%">
          <stop offset=".06%" stopColor="#0867DF" />
          <stop offset="45.39%" stopColor="#0668E1" />
          <stop offset="85.91%" stopColor="#0064E0" />
        </linearGradient>
        <linearGradient id="meta-grad-1" x1="21.67%" x2="97.068%" y1="75.874%" y2="23.985%">
          <stop offset="13.23%" stopColor="#0064DF" />
          <stop offset="99.88%" stopColor="#0064E0" />
        </linearGradient>
        <linearGradient id="meta-grad-2" x1="38.263%" x2="60.895%" y1="89.127%" y2="16.131%">
          <stop offset="1.47%" stopColor="#0072EC" />
          <stop offset="68.81%" stopColor="#0064DF" />
        </linearGradient>
        <linearGradient id="meta-grad-3" x1="47.032%" x2="52.15%" y1="90.19%" y2="15.745%">
          <stop offset="7.31%" stopColor="#007CF6" />
          <stop offset="99.43%" stopColor="#0072EC" />
        </linearGradient>
        <linearGradient id="meta-grad-4" x1="52.155%" x2="47.591%" y1="58.301%" y2="37.004%">
          <stop offset="7.31%" stopColor="#007FF9" />
          <stop offset="100%" stopColor="#007CF6" />
        </linearGradient>
        <linearGradient id="meta-grad-5" x1="37.689%" x2="61.961%" y1="12.502%" y2="63.624%">
          <stop offset="7.31%" stopColor="#007FF9" />
          <stop offset="100%" stopColor="#0082FB" />
        </linearGradient>
        <linearGradient id="meta-grad-6" x1="34.808%" x2="62.313%" y1="68.859%" y2="23.174%">
          <stop offset="27.99%" stopColor="#007FF8" />
          <stop offset="91.41%" stopColor="#0082FB" />
        </linearGradient>
        <linearGradient id="meta-grad-7" x1="43.762%" x2="57.602%" y1="6.235%" y2="98.514%">
          <stop offset="0%" stopColor="#0082FB" />
          <stop offset="99.95%" stopColor="#0081FA" />
        </linearGradient>
        <linearGradient id="meta-grad-8" x1="60.055%" x2="39.88%" y1="4.661%" y2="69.077%">
          <stop offset="6.19%" stopColor="#0081FA" />
          <stop offset="100%" stopColor="#0080F9" />
        </linearGradient>
        <linearGradient id="meta-grad-9" x1="30.282%" x2="61.081%" y1="59.32%" y2="33.244%">
          <stop offset="0%" stopColor="#027AF3" />
          <stop offset="100%" stopColor="#0080F9" />
        </linearGradient>
        <linearGradient id="meta-grad-10" x1="20.433%" x2="82.112%" y1="50.001%" y2="50.001%">
          <stop offset="0%" stopColor="#0377EF" />
          <stop offset="99.94%" stopColor="#0279F1" />
        </linearGradient>
        <linearGradient id="meta-grad-11" x1="40.303%" x2="72.394%" y1="35.298%" y2="57.811%">
          <stop offset=".19%" stopColor="#0471E9" />
          <stop offset="100%" stopColor="#0377EF" />
        </linearGradient>
        <linearGradient id="meta-grad-12" x1="32.254%" x2="68.003%" y1="19.719%" y2="84.908%">
          <stop offset="27.65%" stopColor="#0867DF" />
          <stop offset="100%" stopColor="#0471E9" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function GeminiLogo({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="flex-shrink-0"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>Gemini</title>
      <path
        d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z"
        fill="#3186FF"
      />
      <path
        d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z"
        fill="url(#gemini-grad-0)"
      />
      <path
        d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z"
        fill="url(#gemini-grad-1)"
      />
      <path
        d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z"
        fill="url(#gemini-grad-2)"
      />
      <defs>
        <linearGradient id="gemini-grad-0" x1="7" x2="11" y1="15.5" y2="12" gradientUnits="userSpaceOnUse">
          <stop stopColor="#08B962" />
          <stop offset="1" stopColor="#08B962" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="gemini-grad-1" x1="8" x2="11.5" y1="5.5" y2="11" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F94543" />
          <stop offset="1" stopColor="#F94543" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="gemini-grad-2" x1="3.5" x2="17.5" y1="13.5" y2="12" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FABC12" />
          <stop offset=".46" stopColor="#FABC12" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function OpenAiLogo({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="#10A37F"
      fillRule="evenodd"
      className="flex-shrink-0"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>OpenAI</title>
      <path d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z" />
    </svg>
  );
}

function ClaudeLogo({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="#D97757"
      className="flex-shrink-0"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>Claude</title>
      <path
        d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z"
        fill="#D97757"
        fillRule="nonzero"
      />
    </svg>
  );
}

function MoonshotLogo({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="#4F8BFF"
      fillRule="evenodd"
      className="flex-shrink-0"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>Moonshot</title>
      <path d="M1.052 16.916l9.539 2.552a21.007 21.007 0 00.06 2.033l5.956 1.593a11.997 11.997 0 01-5.586.865l-.18-.016-.044-.004-.084-.009-.094-.01a11.605 11.605 0 01-.157-.02l-.107-.014-.11-.016a11.962 11.962 0 01-.32-.051l-.042-.008-.075-.013-.107-.02-.07-.015-.093-.019-.075-.016-.095-.02-.097-.023-.094-.022-.068-.017-.088-.022-.09-.024-.095-.025-.082-.023-.109-.03-.062-.02-.084-.025-.093-.028-.105-.034-.058-.019-.08-.026-.09-.031-.066-.024a6.293 6.293 0 01-.044-.015l-.068-.025-.101-.037-.057-.022-.08-.03-.087-.035-.088-.035-.079-.032-.095-.04-.063-.028-.063-.027a5.655 5.655 0 01-.041-.018l-.066-.03-.103-.047-.052-.024-.096-.046-.062-.03-.084-.04-.086-.044-.093-.047-.052-.027-.103-.055-.057-.03-.058-.032a6.49 6.49 0 01-.046-.026l-.094-.053-.06-.034-.051-.03-.072-.041-.082-.05-.093-.056-.052-.032-.084-.053-.061-.039-.079-.05-.07-.047-.053-.035a7.785 7.785 0 01-.054-.036l-.044-.03-.044-.03a6.066 6.066 0 01-.04-.028l-.057-.04-.076-.054-.069-.05-.074-.054-.056-.042-.076-.057-.076-.059-.086-.067-.045-.035-.064-.052-.074-.06-.089-.073-.046-.039-.046-.039a7.516 7.516 0 01-.043-.037l-.045-.04-.061-.053-.07-.062-.068-.06-.062-.058-.067-.062-.053-.05-.088-.084a13.28 13.28 0 01-.099-.097l-.029-.028-.041-.042-.069-.07-.05-.051-.05-.053a6.457 6.457 0 01-.168-.179l-.08-.088-.062-.07-.071-.08-.042-.049-.053-.062-.058-.068-.046-.056a7.175 7.175 0 01-.027-.033l-.045-.055-.066-.082-.041-.052-.05-.064-.02-.025a11.99 11.99 0 01-1.44-2.402zm-1.02-5.794l11.353 3.037a20.468 20.468 0 00-.469 2.011l10.817 2.894a12.076 12.076 0 01-1.845 2.005L.657 15.923l-.016-.046-.035-.104a11.965 11.965 0 01-.05-.153l-.007-.023a11.896 11.896 0 01-.207-.741l-.03-.126-.018-.08-.021-.097-.018-.081-.018-.09-.017-.084-.018-.094c-.026-.141-.05-.283-.071-.426l-.017-.118-.011-.083-.013-.102a12.01 12.01 0 01-.019-.161l-.005-.047a12.12 12.12 0 01-.034-2.145zm1.593-5.15l11.948 3.196c-.368.605-.705 1.231-1.01 1.875l11.295 3.022c-.142.82-.368 1.612-.668 2.365l-11.55-3.09L.124 10.26l.015-.1.008-.049.01-.067.015-.087.018-.098c.026-.148.056-.295.088-.442l.028-.124.02-.085.024-.097c.022-.09.045-.18.07-.268l.028-.102.023-.083.03-.1.025-.082.03-.096.026-.082.031-.095a11.896 11.896 0 011.01-2.232zm4.442-4.4L17.352 4.59a20.77 20.77 0 00-1.688 1.721l7.823 2.093c.267.852.442 1.744.513 2.665L2.106 5.213l.045-.065.027-.04.04-.055.046-.065.055-.076.054-.072.064-.086.05-.065.057-.073.055-.07.06-.074.055-.069.065-.077.054-.066.066-.077.053-.06.072-.082.053-.06.067-.074.054-.058.073-.078.058-.06.063-.067.168-.17.1-.098.059-.056.076-.071a12.084 12.084 0 012.272-1.677zM12.017 0h.097l.082.001.069.001.054.002.068.002.046.001.076.003.047.002.06.003.054.002.087.005.105.007.144.011.088.007.044.004.077.008.082.008.047.005.102.012.05.006.108.014.081.01.042.006.065.01.207.032.07.012.065.011.14.026.092.018.11.022.046.01.075.016.041.01L14.7.3l.042.01.065.015.049.012.071.017.096.024.112.03.113.03.113.032.05.015.07.02.078.024.073.023.05.016.05.016.076.025.099.033.102.036.048.017.064.023.093.034.11.041.116.045.1.04.047.02.06.024.041.018.063.026.04.018.057.025.11.048.1.046.074.035.075.036.06.028.092.046.091.045.102.052.053.028.049.026.046.024.06.033.041.022.052.029.088.05.106.06.087.051.057.034.053.032.096.059.088.055.098.062.036.024.064.041.084.056.04.027.062.042.062.043.023.017c.054.037.108.075.161.114l.083.06.065.048.056.043.086.065.082.064.04.03.05.041.086.069.079.065.085.071c.712.6 1.353 1.283 1.909 2.031L7.222.994l.062-.027.065-.028.081-.034.086-.035c.113-.045.227-.09.341-.131l.096-.035.093-.033.084-.03.096-.031c.087-.03.176-.058.264-.085l.091-.027.086-.025.102-.03.085-.023.1-.026L9.04.37l.09-.023.091-.022.095-.022.09-.02.098-.021.091-.02.095-.018.092-.018.1-.018.091-.016.098-.017.092-.014.097-.015.092-.013.102-.013.091-.012.105-.012.09-.01.105-.01c.093-.01.186-.018.28-.024l.106-.008.09-.005.11-.006.093-.004.1-.004.097-.002.099-.002.197-.002z" />
    </svg>
  );
}

function ProviderBadgeIcon({
  provider,
  size = 15,
}: {
  provider: ProviderType;
  size?: number;
}) {
  if (provider === 'muse') return <MetaLogo size={size} />;
  if (provider === 'google') return <GeminiLogo size={size} />;
  if (provider === 'openai') return <OpenAiLogo size={size} />;
  if (provider === 'spark') return <ClaudeLogo size={size} />;
  if (provider === 'kimi') return <MoonshotLogo size={size} />;
  return null;
}

function CheckmarkIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      className="flex-shrink-0"
      style={{ color: 'var(--text-primary)' }}
    >
      <path
        d="M3.2 8.5L6.5 11.8L13 4.5"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface InputDockProps {
  onSendMessage: (text: string, options?: Record<string, unknown>) => void;
  onReplayFakeStream?: () => void;
  isWorking: boolean;
  onStopWorking: () => void;
  mode: AgentMode;
  onChangeMode: (mode: AgentMode) => void;
  environment: ExecutionEnvironment;
  onToggleEnvironment: (env: ExecutionEnvironment) => void;
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  heroMode?: boolean;
  maxWidth?: string;
  activeInterrupt?: AgUiInterruptItem | null;
  onResolveInterrupt?: (interrupt: AgUiInterruptItem, payload: Record<string, unknown>) => void;
}

export const InputDock: React.FC<InputDockProps> = ({
  onSendMessage,
  isWorking,
  onStopWorking,
  mode: agentMode,
  onChangeMode,
  selectedModel,
  onSelectModel,
  heroMode = false,
  maxWidth = '596px',
  activeInterrupt = null,
  onResolveInterrupt,
}) => {
  const [promptText, setPromptText] = useState<string>('');
  const [composerMode, setComposerMode] = useState<ComposerMode>('Build');
  const [modeMenuOpen, setModeMenuOpen] = useState<boolean>(false);
  const [turboMenuOpen, setTurboMenuOpen] = useState<boolean>(false);

  const [autoMode, setAutoMode] = useState<boolean>(false);
  const [modelMenuOpen, setModelMenuOpen] = useState<boolean>(false);
  const [searchRevealed, setSearchRevealed] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [modelFilterTab, setModelFilterTab] = useState<ModelFilterTab>('fav');
  const [models, setModels] = useState<ModelOption[]>(AVAILABLE_MODELS);
  const [activeModelId, setActiveModelId] = useState<string>(
    AVAILABLE_MODELS.some((m) => m.id === selectedModel) ? selectedModel : 'muse-spark-open'
  );
  const [hoveredModelId, setHoveredModelId] = useState<string | null>(null);
  const [modelMenuPointerReady, setModelMenuPointerReady] = useState<boolean>(false);
  const [plusMenuOpen, setPlusMenuOpen] = useState<boolean>(false);

  const [stagedAttachments, setStagedAttachments] = useState<StagedAttachment[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const [, setSelectedFiles] = useState<File[]>([]);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [transcribingStatus, setTranscribingStatus] = useState<string>('Transcribing audio...');
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [contextMenuOpen, setContextMenuOpen] = useState<boolean>(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const recordingStartTimeRef = useRef<number>(0);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const plusMenuTimerRef = useRef<number | null>(null);
  const promptInputRef = useRef<HTMLTextAreaElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const isHoveringModelRowRef = useRef<boolean>(false);
  const isHoveringEffortMenuRef = useRef<boolean>(false);
  const hideEffortTimerRef = useRef<number | null>(null);

  // Sync external selectedModel prop
  useEffect(() => {
    if (selectedModel && models.some((m) => m.id === selectedModel)) {
      setActiveModelId(selectedModel);
    }
  }, [selectedModel, models]);

  // Global Ctrl+U file upload shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault();
        fileInputRef.current?.click();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Load saved favourite models from localStorage on mount
  useEffect(() => {
    try {
      const savedFavs = localStorage.getItem('ai_composer_fav_models');
      if (savedFavs) {
        const parsed: unknown = JSON.parse(savedFavs);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setModels((prev) =>
            prev.map((m) => ({
              ...m,
              isFav: parsed.includes(m.id) || m.isFav,
            }))
          );
        }
      }
    } catch {
      // Ignore storage access errors
    }
  }, []);

  // Fetch real backend provider availability and dynamically enable models
  useEffect(() => {
    fetch('/api/status')
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        const providers = data.providers || {};
        setModels((prev) =>
          prev.map((m) => {
            let isConfigured = false;
            if (m.provider === 'muse') {
              isConfigured = Boolean(providers.muse?.configured ?? data.museConfigured);
            } else if (m.provider === 'google') {
              isConfigured = Boolean(providers.google?.configured ?? providers.gemini?.configured ?? data.geminiConfigured);
            } else if (m.provider === 'openai') {
              isConfigured = Boolean(providers.openai?.configured);
            } else if (m.provider === 'spark') {
              isConfigured = Boolean(providers.spark?.configured ?? providers.anthropic?.configured);
            } else if (m.provider === 'kimi') {
              isConfigured = Boolean(providers.kimi?.configured);
            }

            return {
              ...m,
              hasRealApi: isConfigured,
              badge: isConfigured
                ? (m.badge === 'No API' ? 'Live API' : m.badge)
                : 'No API',
              desc: isConfigured
                ? m.desc?.replace(' (API not configured)', '')
                : (m.desc?.includes('API not configured') ? m.desc : `${m.desc || m.name} (API not configured)`)
            };
          })
        );
      })
      .catch(() => {});
  }, []);

  // Recording interval
  useEffect(() => {
    if (!isRecording) return;
    const intervalId = window.setInterval(() => {
      setRecordingSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [isRecording]);

  // Global click-outside handler to close open popovers
  useEffect(() => {
    const handleGlobalClick = () => {
      setModeMenuOpen(false);
      setTurboMenuOpen(false);
      setModelMenuOpen(false);
      setHoveredModelId(null);
      setContextMenuOpen(false);
      setPlusMenuOpen(false);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const clearHideEffortTimeout = () => {
    if (hideEffortTimerRef.current !== null) {
      window.clearTimeout(hideEffortTimerRef.current);
      hideEffortTimerRef.current = null;
    }
  };

  const scheduleHideEffortSubmenu = () => {
    clearHideEffortTimeout();
    hideEffortTimerRef.current = window.setTimeout(() => {
      if (!isHoveringEffortMenuRef.current && !isHoveringModelRowRef.current) {
        setHoveredModelId(null);
      }
    }, 60);
  };

  // Ordered modes so the active mode is always anchored at the bottom with a checkmark
  const orderedModes = useMemo(() => {
    const inactive = ALL_MODES.filter((m) => m !== composerMode);
    return [...inactive, composerMode];
  }, [composerMode]);

  const activeModel = useMemo(
    () => models.find((m) => m.id === activeModelId) || models[0],
    [models, activeModelId]
  );

  const favCount = useMemo(() => models.filter((m) => m.isFav).length, [models]);

  const visibleModels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return models.filter((m) => {
      const matchesTab = modelFilterTab === 'fav' ? m.isFav : true;
      const matchesSearch =
        m.name.toLowerCase().includes(q) || m.effort.toLowerCase().includes(q);
      return matchesTab && matchesSearch;
    });
  }, [models, modelFilterTab, searchQuery]);

  const hoveredModel = useMemo(
    () => (hoveredModelId ? models.find((m) => m.id === hoveredModelId) || null : null),
    [models, hoveredModelId]
  );

  // Calculate vertical bottom offset so the Effort submenu tracks the hovered model row
  const effortBottomOffsetPx = useMemo(() => {
    if (!hoveredModelId) return 0;
    const idx = visibleModels.findIndex((m) => m.id === hoveredModelId);
    if (idx < 0) return 0;
    const rowsFromBottom = visibleModels.length - 1 - idx;
    return rowsFromBottom <= 1 ? 0 : Math.min(96, (rowsFromBottom - 1) * 24);
  }, [visibleModels, hoveredModelId]);

  const isEffortMenuVisible =
    modelMenuOpen && searchQuery.trim().length === 0 && hoveredModel !== null;

  const handleToggleFavStar = (e: React.MouseEvent, targetId: string) => {
    e.stopPropagation();
    const targetModel = models.find((m) => m.id === targetId);
    if (!targetModel || targetModel.provider !== 'muse') return;

    setModels((prev) => {
      const updated = prev.map((m) => {
        if (m.id !== targetId) return m;
        return { ...m, isFav: !m.isFav };
      });
      const targetAfter = updated.find((m) => m.id === targetId);
      if (targetAfter?.isFav) {
        setActiveModelId(targetId);
        onSelectModel(targetId);
        setAutoMode(false);
      }
      try {
        const favIds = updated.filter((m) => m.isFav && m.provider === 'muse').map((m) => m.id);
        localStorage.setItem('ai_composer_fav_models', JSON.stringify(favIds));
      } catch {
        // Ignore storage errors
      }
      return updated;
    });
  };

  const handleSelectModel = (e: React.MouseEvent, modelId: string) => {
    e.stopPropagation();
    setActiveModelId(modelId);
    onSelectModel(modelId);
    setAutoMode(false);
    setModelMenuOpen(false);
    setHoveredModelId(null);
  };

  const handleSelectEffort = (e: React.MouseEvent, effort: EffortLevel) => {
    e.stopPropagation();
    if (!hoveredModelId) return;
    setModels((prev) =>
      prev.map((m) => (m.id === hoveredModelId ? { ...m, effort } : m))
    );
    setActiveModelId(hoveredModelId);
    onSelectModel(hoveredModelId);
    setAutoMode(false);
  };

  const handleOpenModelMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setModeMenuOpen(false);
    setTurboMenuOpen(false);
    setContextMenuOpen(false);

    const nextOpen = !modelMenuOpen;
    setModelMenuOpen(nextOpen);
    if (nextOpen) {
      setModelFilterTab('fav');
      setHoveredModelId(null);
      setModelMenuPointerReady(false);
      setSearchRevealed(false);
      setSearchQuery('');
      window.setTimeout(() => {
        setSearchRevealed(true);
      }, 160);
    }
  };

  const handleToggleAutoInMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextAuto = !autoMode;
    setAutoMode(nextAuto);
    if (nextAuto) {
      window.setTimeout(() => {
        setModelMenuOpen(false);
        setHoveredModelId(null);
      }, 180);
    }
  };

  const adjustTextareaHeight = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    const maxHeight = 180;
    const scrollH = el.scrollHeight;
    if (scrollH > maxHeight) {
      el.style.height = `${maxHeight}px`;
      el.style.overflowY = 'auto';
    } else {
      el.style.height = `${Math.max(28, scrollH)}px`;
      el.style.overflowY = 'hidden';
    }
  };

  useEffect(() => {
    adjustTextareaHeight(promptInputRef.current);
  }, [promptText]);

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setPromptText(val);
    setContextMenuOpen(val.endsWith('@'));
    adjustTextareaHeight(e.target);
  };

  const handleInsertContextTag = (e: React.MouseEvent, tag: string) => {
    e.stopPropagation();
    setPromptText((prev) => prev.replace(/@$/, `${tag} `));
    setContextMenuOpen(false);
    promptInputRef.current?.focus();
  };

  const processImageFile = async (file: File): Promise<File> => {
    const supportedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/x-icon'
    ];
    if (supportedTypes.includes(file.type.toLowerCase())) {
      return file;
    }

    // Convert unsupported format (e.g. BMP, SVG, TIFF) to PNG via canvas
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || 800;
          canvas.height = img.naturalHeight || 600;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((blob) => {
              URL.revokeObjectURL(url);
              if (blob) {
                const baseName = file.name.replace(/\.[^/.]+$/, '');
                resolve(new File([blob], `${baseName}.png`, { type: 'image/png' }));
                return;
              }
              resolve(file);
            }, 'image/png');
            return;
          }
        } catch {
          // Fallback
        }
        URL.revokeObjectURL(url);
        resolve(file);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file);
      };
      img.src = url;
    });
  };

  const encodeMono16kWavDataUrl = (samples: Float32Array, sampleRate = 16000): string => {
    const numSamples = samples.length;
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true); // PCM format = 1
    view.setUint16(22, 1, true); // Mono = 1 channel
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byte rate (sampleRate * blockAlign)
    view.setUint16(32, 2, true); // block align (1 channel * 2 bytes)
    view.setUint16(34, 16, true); // 16-bit PCM
    writeString(36, 'data');
    view.setUint32(40, numSamples * 2, true);

    let offset = 44;
    for (let i = 0; i < numSamples; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }

    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      binary += String.fromCharCode.apply(null, Array.from(slice));
    }
    return `data:audio/wav;base64,${btoa(binary)}`;
  };

  const convertAudioBlobToWavSegments = async (
    blob: Blob,
    fallbackDurationSec: number,
    maxSegmentSec = 600
  ): Promise<Array<{ base64Audio: string; durationSec: number; mimeType: string }>> => {
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const arrayBuffer = await blob.arrayBuffer();
        const audioCtx = new AudioCtx();
        try {
          const decoded: AudioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
          const targetSampleRate = 16000;
          const totalTargetSamples = Math.max(1, Math.ceil(decoded.duration * targetSampleRate));
          let monoSamples: Float32Array;

          const OfflineCtx =
            (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
          if (OfflineCtx) {
            const offlineCtx = new OfflineCtx(1, totalTargetSamples, targetSampleRate);
            const source = offlineCtx.createBufferSource();
            source.buffer = decoded;
            source.connect(offlineCtx.destination);
            source.start(0);
            const rendered: AudioBuffer = await offlineCtx.startRendering();
            monoSamples = rendered.getChannelData(0);
          } else {
            const ch0 = decoded.getChannelData(0);
            const ratio = decoded.sampleRate / targetSampleRate;
            monoSamples = new Float32Array(totalTargetSamples);
            for (let i = 0; i < totalTargetSamples; i++) {
              const srcIdx = Math.min(ch0.length - 1, Math.floor(i * ratio));
              monoSamples[i] = ch0[srcIdx];
            }
          }

          const samplesPerSegment = maxSegmentSec * targetSampleRate;
          const segments: Array<{ base64Audio: string; durationSec: number; mimeType: string }> = [];
          for (let start = 0; start < monoSamples.length; start += samplesPerSegment) {
            const end = Math.min(start + samplesPerSegment, monoSamples.length);
            const slice = monoSamples.subarray(start, end);
            const segDurationSec = Math.max(1, Math.round(slice.length / targetSampleRate));
            const base64Audio = encodeMono16kWavDataUrl(slice, targetSampleRate);
            segments.push({
              base64Audio,
              durationSec: segDurationSec,
              mimeType: 'audio/wav'
            });
          }

          if (segments.length > 0) {
            return segments;
          }
        } finally {
          try {
            await audioCtx.close();
          } catch {}
        }
      }
    } catch {
      // Fallback to raw base64 data URL if Web Audio decode fails
    }

    const base64Audio = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read audio blob'));
      reader.readAsDataURL(blob);
    });

    return [
      {
        base64Audio,
        durationSec: Math.max(1, fallbackDurationSec || 5),
        mimeType: blob.type || 'audio/wav'
      }
    ];
  };

  const readFilePayloadInBackground = (
    file: File
  ): Promise<{ dataUrl?: string; textContent?: string }> => {
    return new Promise((resolve) => {
      const isTextLike =
        file.type.startsWith('text/') ||
        /\.(txt|md|csv|json|js|jsx|ts|tsx|py|sh|yaml|yml|sql|css|html|xml|log|env\.example)$/i.test(
          file.name
        );

      if (isTextLike && file.size <= 2 * 1024 * 1024) {
        const textReader = new FileReader();
        textReader.onloadend = () => {
          resolve({ textContent: String(textReader.result || '') });
        };
        textReader.onerror = () => resolve({});
        textReader.readAsText(file);
        return;
      }

      const dataReader = new FileReader();
      dataReader.onloadend = () => {
        resolve({ dataUrl: String(dataReader.result || '') });
      };
      dataReader.onerror = () => resolve({});
      dataReader.readAsDataURL(file);
    });
  };

  const processIncomingFiles = async (rawFiles: File[]) => {
    const currentCount = stagedAttachments.length;
    if (currentCount >= MAX_ATTACHMENTS) {
      alert(`Maximum of ${MAX_ATTACHMENTS} attachments allowed per message.`);
      return;
    }

    const availableSlots = MAX_ATTACHMENTS - currentCount;
    const filesToProcess = rawFiles.slice(0, availableSlots);
    if (rawFiles.length > availableSlots) {
      alert(`Only ${MAX_ATTACHMENTS} attachments are allowed per message. Added the first ${availableSlots}.`);
    }

    const newStaged: StagedAttachment[] = [];
    const audioFilesToTranscribe: File[] = [];

    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i];
      if (file.size > MAX_INDIVIDUAL_ATTACHMENT_BYTES) {
        const maxMb = Math.round(MAX_INDIVIDUAL_ATTACHMENT_BYTES / (1024 * 1024));
        alert(`File "${file.name}" exceeds the ${maxMb} MB individual attachment size limit.`);
        continue;
      }

      let finalFile = file;
      if (file.type.startsWith('image/') || /\.(bmp|tiff|svg|webp|png|jpe?g)$/i.test(file.name)) {
        finalFile = await processImageFile(file);
      }

      const isAudioFile =
        finalFile.type.startsWith('audio/') ||
        /\.(wav|mp3|m4a|ogg|webm|flac|aac)$/i.test(finalFile.name);
      if (isAudioFile) {
        audioFilesToTranscribe.push(finalFile);
      }

      const isImage =
        finalFile.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|ico)$/i.test(finalFile.name);
      const previewUrl = isImage ? URL.createObjectURL(finalFile) : undefined;
      const attId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const orderNumber = currentCount + newStaged.length + 1;

      newStaged.push({
        id: attId,
        order: orderNumber,
        name: finalFile.name,
        size: finalFile.size,
        type: finalFile.type || 'application/octet-stream',
        state: 'uploading',
        progress: 35,
        previewUrl,
        file: finalFile
      });
    }

    if (newStaged.length > 0) {
      setStagedAttachments((prev) => {
        const merged = [...prev, ...newStaged];
        return merged.map((item, idx) => ({ ...item, order: idx + 1 }));
      });
      setAttachedFiles((prev) => [...prev, ...newStaged.map((f) => f.name)]);
      setSelectedFiles((prev) => [...prev, ...newStaged.map((f) => f.file!).filter(Boolean)]);

      // Read file payloads in background and mark each chip state="done"
      for (const item of newStaged) {
        if (!item.file) continue;
        void readFilePayloadInBackground(item.file).then((payload) => {
          setStagedAttachments((prev) =>
            prev.map((att) =>
              att.id === item.id
                ? {
                    ...att,
                    state: 'done',
                    progress: 100,
                    dataUrl: payload.dataUrl,
                    textContent: payload.textContent,
                    previewUrl: payload.dataUrl && att.type.startsWith('image/') ? payload.dataUrl : att.previewUrl
                  }
                : att
            )
          );
        });
      }
    }

    for (const audioFile of audioFilesToTranscribe) {
      void handleAudioTranscription(audioFile);
    }
  };

  const handleRemoveAttachment = (idxToRemove: number) => {
    setStagedAttachments((prev) => {
      const target = prev[idxToRemove];
      if (target?.previewUrl && target.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev
        .filter((_, i) => i !== idxToRemove)
        .map((att, idx) => ({ ...att, order: idx + 1 }));
    });
    setAttachedFiles((prev) => prev.filter((_, i) => i !== idxToRemove));
    setSelectedFiles((prev) => prev.filter((_, i) => i !== idxToRemove));
  };

  const startVoiceRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Microphone access is not supported by your browser.');
        return;
      }

      // Explicitly request browser microphone permission (pure MediaRecorder without Web Speech API chime)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      audioStreamRef.current = stream;
      audioChunksRef.current = [];
      recordingStartTimeRef.current = Date.now();

      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4'
      ];
      let recorder: MediaRecorder | null = null;
      for (const mimeType of preferredTypes) {
        if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(mimeType)) {
          try {
            recorder = new MediaRecorder(stream, { mimeType });
            break;
          } catch {}
        }
      }
      if (!recorder) {
        recorder = new MediaRecorder(stream);
      }
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const elapsedSec = recordingStartTimeRef.current
          ? Math.max(1, Math.round((Date.now() - recordingStartTimeRef.current) / 1000))
          : 5;
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder?.mimeType || 'audio/webm'
        });
        stream.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
        mediaRecorderRef.current = null;
        recordingStartTimeRef.current = 0;

        if (audioBlob.size > 0) {
          await handleAudioTranscription(audioBlob, elapsedSec);
        }
      };

      recorder.start(250);
      setRecordingSeconds(0);
      setIsRecording(true);
    } catch (err: any) {
      console.error('Microphone access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        alert('Microphone permission was denied. Please allow microphone access in your browser to record audio.');
      } else {
        alert(`Could not access microphone: ${err.message || 'Unknown error'}`);
      }
      setIsRecording(false);
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const cancelVoiceRecording = () => {
    recordingStartTimeRef.current = 0;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null;
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    setIsRecording(false);
    setIsTranscribing(false);
    setRecordingSeconds(0);
  };

  const handleAudioTranscription = async (blob: Blob, explicitDurationSec?: number) => {
    try {
      setIsTranscribing(true);
      setTranscribingStatus('Transcribing');
      const fallbackDuration =
        explicitDurationSec ||
        (recordingStartTimeRef.current
          ? Math.max(1, Math.round((Date.now() - recordingStartTimeRef.current) / 1000))
          : 0) ||
        recordingSeconds ||
        5;

      // Silent background WAV conversion & 10m segmentation (never exposed in UI)
      const segments = await convertAudioBlobToWavSegments(blob, fallbackDuration, 600);

      const collectedTranscripts: string[] = [];
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const response = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audio: seg.base64Audio,
            durationSec: seg.durationSec,
            mimeType: seg.mimeType,
            model: activeModelId || selectedModel
          })
        });

        if (response.ok) {
          const data = await response.json();
          const serverTranscript = String(data.transcript || '').trim();
          const isRefusal =
            /don'?t (have the ability to|have access to|see|find|have|detect) (any |an |the )?audio|cannot (hear|transcribe|listen|access|process)|can'?t (hear|transcribe|listen|access|process|provide a (verbatim )?transcription)|not (able|equipped) to (listen|transcribe|process|hear)|unable to (transcribe|listen|process|hear)|no audio (file )?(was|is|has been) (included|provided|attached|received|found|present)|no spoken words to transcribe|there('?s| is| are) (nothing|no spoken words) (for me )?to transcribe|don'?t have an audio file|can'?t process audio|if you (can )?upload (the |an )?audio|please upload (the |an |or attach )?audio/i.test(
              serverTranscript
            );
          if (
            data.ok &&
            serverTranscript &&
            !serverTranscript.startsWith('[Transcribed audio segment') &&
            !isRefusal
          ) {
            collectedTranscripts.push(serverTranscript);
          }
        }
      }

      const finalTranscript = collectedTranscripts.join(' ').trim();
      if (finalTranscript) {
        setPromptText((prev) =>
          prev ? `${prev.trimEnd()} ${finalTranscript}` : finalTranscript
        );
        window.setTimeout(() => {
          adjustTextareaHeight(promptInputRef.current);
          promptInputRef.current?.focus();
        }, 0);
      }
    } catch (err) {
      console.error('Transcription handler error:', err);
    } finally {
      setIsTranscribing(false);
      setRecordingSeconds(0);
    }
  };

  const handleRecordClick = () => {
    if (!isRecording) {
      startVoiceRecording();
    } else {
      stopVoiceRecording();
    }
  };

  const handleSubmitPrompt = async () => {
    if (isWorking) {
      onStopWorking();
      return;
    }
    if (isRecording) stopVoiceRecording();

    const trimmed = promptText.trim();
    if (!trimmed && stagedAttachments.length === 0) {
      return;
    }

    // Ensure any attachments that are still reading their dataUrl finish reading before submitting
    const orderedAttachments = await Promise.all(
      stagedAttachments.map(async (att, idx) => {
        let dataUrl = att.dataUrl;
        let textContent = att.textContent;
        if (!dataUrl && !textContent && att.file) {
          try {
            const payload = await readFilePayloadInBackground(att.file);
            dataUrl = payload.dataUrl;
            textContent = payload.textContent;
          } catch {}
        }
        return {
          id: att.id,
          order: idx + 1,
          name: att.name,
          size: att.size,
          type: att.type,
          state: 'done' as const,
          previewUrl: dataUrl || att.previewUrl,
          dataUrl: dataUrl,
          textContent: textContent
        };
      })
    );

    onSendMessage(trimmed, {
      attachments: orderedAttachments,
      maxIndividualSizeBytes: MAX_INDIVIDUAL_ATTACHMENT_BYTES,
      effort: activeModel.effort
    });
    setPromptText('');
    setStagedAttachments([]);
    setAttachedFiles([]);
    setSelectedFiles([]);
    setContextMenuOpen(false);
  };

  const formattedRecordingTime = useMemo(() => {
    const mins = Math.floor(recordingSeconds / 60);
    const secs = String(recordingSeconds % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  }, [recordingSeconds]);

  const isSubmitReady = promptText.trim().length > 0 || attachedFiles.length > 0;

  const executionModes: {
    id: AgentMode;
    title: string;
    desc: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'turbo',
      title: 'Turbo',
      desc: 'Run all commands & auto-heal routes without restrictions.',
      icon: <Zap size={13} />,
    },
    {
      id: 'default',
      title: 'Default',
      desc: 'Ask before sensitive operations.',
      icon: <ShieldCheck size={13} />,
    },
    {
      id: 'review',
      title: 'Request Review',
      desc: 'Pause via AG-UI interrupt for approval.',
      icon: <ShieldAlert size={13} />,
    },
  ];

  return (
    <div
      data-theme="dark"
      aria-label="AI prompt composer"
      className="aic-box-scope w-full flex flex-col items-center select-none"
      style={{
        padding: heroMode ? '0' : '12px 24px 18px',
        backgroundColor: 'transparent',
        position: 'relative',
        width: '100%',
        fontFamily:
          "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        fontFeatureSettings: "'cv02', 'cv03', 'cv04', 'cv11'",
      }}
    >
      <style>{`
        .aic-box-scope[data-theme="dark"] {
          --card-bg: #18181c;
          --card-border: rgba(255, 255, 255, 0.065);
          --card-focus-border: rgba(255, 255, 255, 0.12);
          --card-shadow: 0 20px 45px -15px rgba(0, 0, 0, 0.45), 0 1px 0 0 rgba(255, 255, 255, 0.05) inset;

          --pill-bg: #26262c;
          --pill-hover-bg: #2d2d34;
          --pill-border: rgba(255, 255, 255, 0.095);
          --pill-hover-border: rgba(255, 255, 255, 0.15);
          --pill-inset: 0 1px 0 0 rgba(255, 255, 255, 0.05) inset;

          --ghost-hover-bg: rgba(255, 255, 255, 0.045);
          --ghost-hover-border: rgba(255, 255, 255, 0.075);

          --popover-bg-start: #2b2b33;
          --popover-bg-end: #1f1f25;
          --popover-border: rgba(255, 255, 255, 0.12);
          --popover-shadow: 0 22px 48px -10px rgba(0, 0, 0, 0.65), 0 1px 0 0 rgba(255, 255, 255, 0.08) inset;
          --menu-item-hover: rgba(255, 255, 255, 0.065);
          --model-row-hover: rgba(14, 14, 18, 0.68);

          --filter-track-bg: rgba(12, 12, 16, 0.48);
          --filter-track-border: rgba(255, 255, 255, 0.06);
          --filter-active-bg: #2c2c35;
          --filter-active-border: rgba(255, 255, 255, 0.11);
          --filter-active-shadow: 0 2px 6px rgba(0, 0, 0, 0.28);

          --text-primary: #f4f4f6;
          --text-secondary: #8e8d95;
          --text-muted: #6e6d76;
          --placeholder-color: #8c8b93;
          --icon-primary: #e4e4e8;
          --chevron-color: #9e9da6;
          --effort-header: #d4d4d8;

          --submit-bg: #222227;
          --submit-border: rgba(255, 255, 255, 0.08);
          --submit-color: #7c7b84;
          --submit-ready-bg: #2d2d35;
          --submit-ready-border: rgba(255, 255, 255, 0.16);
          --submit-ready-color: #f4f4f6;

          --switch-off-bg: #484852;
          --accent-blue: #ffffff;
          --accent-coral: #e87b58;

          --chip-bg: #24242b;
          --chip-border: rgba(255, 255, 255, 0.1);
        }

        .aic-composer-card {
          position: relative;
          width: 100%;
          background: var(--card-bg);
          border-radius: 20px;
          border: 1px solid var(--card-border);
          box-shadow: var(--card-shadow);
          padding: 16px 16px 12px 16px;
          transition: background-color 0.25s ease, border-color 0.2s ease, box-shadow 0.25s ease;
        }

        .aic-composer-card:focus-within {
          border-color: var(--card-focus-border);
        }

        .aic-prompt-input {
          width: 100%;
          background: transparent;
          border: none;
          outline: none;
          resize: none;
          color: var(--text-primary);
          font-family: inherit;
          font-size: 15px;
          line-height: 1.5;
          font-weight: 400;
          letter-spacing: -0.011em;
          min-height: 28px;
          max-height: 180px;
          overflow-y: hidden;
          padding: 0 2px;
          margin-bottom: 14px;
          user-select: text;
          transition: color 0.2s ease;
        }

        .aic-prompt-input::placeholder {
          color: var(--placeholder-color);
          opacity: 1;
        }

        .aic-icon-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: transparent;
          border: none;
          color: var(--text-secondary);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: color 0.15s ease, background-color 0.15s ease, transform 0.1s ease;
          flex-shrink: 0;
        }

        .aic-icon-btn:hover {
          color: var(--text-primary);
          background-color: rgba(255, 255, 255, 0.07);
        }

        .aic-icon-btn:active {
          transform: scale(0.96);
        }

        .aic-decluttered-turbo-btn {
          height: 32px;
          border-radius: 8px;
          padding: 0 8px;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: transparent;
          border: none;
          color: var(--text-secondary);
          font-family: inherit;
          font-size: 13.5px;
          font-weight: 500;
          letter-spacing: -0.011em;
          cursor: pointer;
          transition: background-color 0.15s ease, color 0.15s ease;
          flex-shrink: 0;
        }

        .aic-decluttered-turbo-btn:hover {
          color: var(--text-primary);
          background-color: rgba(255, 255, 255, 0.07);
        }

        .aic-model-trigger-btn {
          height: 32px;
          border-radius: 8px;
          padding: 0 8px 0 4px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: transparent;
          border: none;
          color: var(--text-primary);
          font-family: inherit;
          font-size: 14px;
          font-weight: 500;
          letter-spacing: -0.011em;
          cursor: pointer;
          min-width: 0;
          max-width: 100%;
          transition: background-color 0.15s ease, color 0.15s ease;
        }

        .aic-model-trigger-btn:hover {
          background-color: rgba(255, 255, 255, 0.07);
        }

        .aic-submit-circle-btn {
          width: 32px;
          height: 32px;
          border-radius: 9999px;
          background: #404045;
          border: none;
          color: #a1a1aa;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
          transition: background-color 0.18s ease, color 0.18s ease, transform 0.12s ease;
        }

        .aic-submit-circle-btn:hover {
          background: #52525b;
          color: #f4f4f6;
        }

        .aic-submit-circle-btn.ready {
          background: #e4e4e7;
          color: #18181b;
        }

        .aic-submit-circle-btn.ready:hover {
          background: #ffffff;
          transform: scale(1.05);
        }

        .aic-submit-circle-btn:active {
          transform: scale(0.95);
        }

        .aic-auto-trigger-btn {
          height: 38px;
          border-radius: 9999px;
          padding: 0 12px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          border: 1px solid transparent;
          color: var(--text-primary);
          font-family: inherit;
          font-size: 15px;
          font-weight: 500;
          letter-spacing: -0.011em;
          cursor: pointer;
          transition: all 0.24s cubic-bezier(0.22, 1, 0.36, 1);
        }

        .aic-auto-trigger-btn:hover {
          background: var(--pill-bg);
          border-color: var(--pill-border);
          box-shadow: var(--pill-inset);
          padding: 0 11px 0 14px;
          gap: 12px;
        }

        .aic-auto-trigger-btn .aic-auto-chevron {
          display: inline-flex;
        }

        .aic-auto-trigger-btn .aic-auto-inline-switch {
          display: none;
          align-items: center;
        }

        .aic-auto-trigger-btn:hover .aic-auto-chevron {
          display: none;
        }

        .aic-auto-trigger-btn:hover .aic-auto-inline-switch {
          display: inline-flex;
        }

        .aic-record-btn {
          width: 38px;
          padding: 0 10px;
          justify-content: flex-start;
        }

        .aic-record-btn:hover,
        .aic-record-btn.recording {
          width: 105px;
          padding: 0 14px 0 11px;
        }

        .aic-record-btn.recording {
          background: rgba(239, 68, 68, 0.16);
          border-color: rgba(239, 68, 68, 0.45);
          color: #ef4444;
        }

        .aic-record-label {
          opacity: 0;
          transform: translateX(6px);
          white-space: nowrap;
          font-size: 15px;
          font-weight: 500;
          letter-spacing: -0.011em;
          margin-left: 7px;
          transition:
            opacity 0.2s cubic-bezier(0.22, 1, 0.36, 1),
            transform 0.24s cubic-bezier(0.22, 1, 0.36, 1);
          pointer-events: none;
        }

        .aic-record-btn:hover .aic-record-label,
        .aic-record-btn.recording .aic-record-label {
          opacity: 1;
          transform: translateX(0);
        }

        .aic-submit-btn {
          width: 38px;
          height: 38px;
          border-radius: 9999px;
          background: var(--submit-bg);
          border: 1px solid var(--submit-border);
          color: var(--submit-color);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.18s ease;
          flex-shrink: 0;
        }

        .aic-submit-btn:hover,
        .aic-submit-btn.ready {
          background: var(--submit-ready-bg);
          border-color: var(--submit-ready-border);
          color: var(--submit-ready-color);
        }

        .aic-submit-btn:active {
          transform: scale(0.95);
        }

        .aic-glass-popover {
          background: linear-gradient(160deg, var(--popover-bg-start) 0%, var(--popover-bg-end) 100%);
          border: 1px solid var(--popover-border);
          box-shadow: var(--popover-shadow);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          transform-origin: bottom left;
          transition:
            opacity 0.18s cubic-bezier(0.22, 1, 0.36, 1),
            transform 0.2s cubic-bezier(0.22, 1, 0.36, 1),
            bottom 0.18s cubic-bezier(0.22, 1, 0.36, 1),
            background 0.22s ease,
            border-color 0.22s ease;
        }

        .aic-popover-hidden {
          opacity: 0;
          transform: translateY(6px) scale(0.97);
          pointer-events: none;
        }

        .aic-popover-visible {
          opacity: 1;
          transform: translateY(0) scale(1);
          pointer-events: auto;
        }

        .aic-effort-submenu-bridge::before {
          content: "";
          position: absolute;
          top: -8px;
          bottom: -8px;
          left: -16px;
          width: 16px;
        }

        .aic-mode-menu-item {
          height: 36px;
          padding: 0 14px;
          border-radius: 11px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-family: inherit;
          font-size: 15px;
          font-weight: 500;
          letter-spacing: -0.011em;
          color: var(--text-primary);
          cursor: pointer;
          transition: background-color 0.14s ease, color 0.14s ease;
        }

        .aic-mode-menu-item:hover {
          background: var(--menu-item-hover);
        }

        .aic-model-filter-bar {
          display: flex;
          align-items: center;
          padding: 2px;
          margin: 2px 6px 6px 6px;
          border-radius: 9999px;
          background: var(--filter-track-bg);
          border: 1px solid var(--filter-track-border);
        }

        .aic-model-filter-pill {
          flex: 1;
          height: 26px;
          padding: 0 10px;
          border-radius: 9999px;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 13.5px;
          font-weight: 500;
          letter-spacing: -0.012em;
          font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
          color: var(--text-secondary);
          background: transparent;
          border: 1px solid transparent;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          cursor: pointer;
          transition:
            color 0.16s ease,
            background-color 0.18s cubic-bezier(0.22, 1, 0.36, 1),
            border-color 0.18s ease,
            box-shadow 0.18s ease;
        }

        .aic-model-filter-pill:hover {
          color: var(--text-primary);
        }

        .aic-model-filter-pill.active {
          color: var(--text-primary);
          background: var(--filter-active-bg);
          border-color: var(--filter-active-border);
          box-shadow: var(--filter-active-shadow);
        }

        .aic-fav-star-btn {
          width: 22px;
          height: 22px;
          border-radius: 9999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          background: transparent;
          border: none;
          padding: 0;
          cursor: pointer;
          flex-shrink: 0;
          transition: transform 0.16s cubic-bezier(0.22, 1, 0.36, 1), color 0.16s ease;
        }

        .aic-fav-star-btn:hover {
          color: #e4e4e7;
          transform: scale(1.16);
        }

        .aic-fav-star-btn.starred {
          color: #e4e4e7;
        }

        .aic-fav-star-btn:active {
          transform: scale(0.9);
        }

        .aic-model-row {
          height: 38px;
          padding: 0 11px 0 6px;
          border-radius: 9999px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-family: inherit;
          letter-spacing: -0.011em;
          cursor: pointer;
          transition: background-color 0.14s ease;
        }

        .aic-model-row:hover,
        .aic-model-row.active-hover {
          background: var(--model-row-hover);
        }

        .aic-ios-switch {
          width: 40px;
          height: 23px;
          border-radius: 9999px;
          background: var(--switch-off-bg);
          padding: 2.5px;
          display: inline-flex;
          align-items: center;
          cursor: pointer;
          transition: background-color 0.2s ease;
          position: relative;
          flex-shrink: 0;
        }

        .aic-ios-switch.on {
          background: #ffffff;
        }

        .aic-ios-switch-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #ffffff;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
          transform: translateX(0);
          transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
        }

        .aic-ios-switch.on .aic-ios-switch-thumb {
          background: #09090b;
          transform: translateX(17px);
        }

        .aic-search-row-wrap {
          overflow: hidden;
          max-height: 0;
          opacity: 0;
          transition:
            max-height 0.24s cubic-bezier(0.22, 1, 0.36, 1),
            opacity 0.2s ease,
            margin-bottom 0.2s ease;
          margin-bottom: 0;
        }

        .aic-search-row-wrap.revealed {
          max-height: 42px;
          opacity: 1;
          margin-bottom: 4px;
        }

        @keyframes aicPulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(0.85); }
        }

        .aic-recording-dot {
          animation: aicPulseDot 1.2s infinite ease-in-out;
        }
      `}</style>

      {/* Hidden file input for "+ Upload or add files" */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif,image/x-icon,image/bmp,image/svg+xml,audio/*,video/*,application/pdf,text/plain,text/markdown,text/csv,text/html,.json,.js,.ts,.tsx,.jsx,.py,.sh,.yaml,.yml,.sql,.css"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length > 0) {
            processIncomingFiles(files);
          }
          e.target.value = '';
        }}
      />

      {/* Composer Box Container */}
      <div
        className="w-full flex flex-col items-center relative"
        style={{
          maxWidth: heroMode ? '596px' : maxWidth,
          transition: 'max-width 0.22s ease',
        }}
      >
        {/* If the agent has a question/interrupt, the composer box transitions to Ask User state */}
        {activeInterrupt ? (
          <div className="w-full">
            <AskUserInterruptCard
              interrupt={activeInterrupt}
              onResolve={(payload) => onResolveInterrupt?.(activeInterrupt, payload)}
            />
          </div>
        ) : (
          /* Primary Composer Card */
          <section
            className="aic-composer-card"
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const droppedFiles = Array.from(e.dataTransfer?.files || []);
              if (droppedFiles.length > 0) {
                void processIncomingFiles(droppedFiles);
              }
            }}
          >
            {/* Attached Context File Cards INSIDE the composer matching gathered-elements/composer/composer-attachments */}
            {stagedAttachments.length > 0 && (
              <ComposerAttachments
                attachments={stagedAttachments}
                onRemove={handleRemoveAttachment}
              />
            )}

            {/* Live Voice Recording & Transcribing Component INSIDE the composer (no Done button) */}
            {(isRecording || isTranscribing) && (
              <ComposerVoiceDictation
                isRecording={isRecording}
                isTranscribing={isTranscribing}
                recordingSeconds={recordingSeconds}
                recordingTime={formattedRecordingTime}
              />
            )}

            {/* @ Context Mention Popover */}
            <div
            className={`aic-glass-popover ${
              contextMenuOpen ? 'aic-popover-visible' : 'aic-popover-hidden'
            } absolute left-4 bottom-[74px] w-56 rounded-[16px] p-1.5 z-40`}
          >
            <div
              className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider"
              style={{ color: 'var(--text-secondary)' }}
            >
              Add Context
            </div>
            {CONTEXT_OPTIONS.map((item) => (
              <button
                key={item.tag}
                type="button"
                onClick={(e) => handleInsertContextTag(e, item.tag)}
                className="aic-mode-menu-item w-full text-left px-2.5 py-1.5 rounded-lg text-sm flex items-center justify-between"
              >
                <span>{item.tag}</span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {item.category}
                </span>
              </button>
            ))}
          </div>

          {/* Prompt Textarea */}
          <textarea
            ref={promptInputRef}
            rows={1}
            value={promptText}
            onChange={handlePromptChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmitPrompt();
              }
            }}
            className="aic-prompt-input"
            placeholder={isRecording || isTranscribing ? '' : 'What would you like to do today?'}
            aria-label="Prompt input"
          />

          {/* Bottom Controls Bar */}
          <div className="flex items-center justify-between gap-2 relative w-full min-w-0">
            {/* Left Controls Group: Paperclip + Sliders + Model (no effort text) */}
            <div className="flex items-center gap-1 min-w-0 flex-1">
              {/* 1. Plus Button with Popover (replacing plain paperclip) */}
              <div
                className="relative flex-shrink-0"
                onMouseEnter={() => {
                  if (plusMenuTimerRef.current) clearTimeout(plusMenuTimerRef.current);
                  setPlusMenuOpen(true);
                }}
                onMouseLeave={() => {
                  plusMenuTimerRef.current = window.setTimeout(() => {
                    setPlusMenuOpen(false);
                  }, 140);
                }}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPlusMenuOpen((prev) => !prev);
                  }}
                  className="aic-icon-btn"
                  title="Add files and extensions (Ctrl+U)"
                  aria-label="Add files and extensions"
                  aria-haspopup="true"
                  aria-expanded={plusMenuOpen}
                >
                  <Plus size={16} />
                </button>

                {/* Plus Popover Menu matching uploaded media_1793004504350_22e4ef76.png */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  className={`aic-glass-popover ${
                    plusMenuOpen ? 'aic-popover-visible' : 'aic-popover-hidden'
                  } absolute left-0 bottom-[40px] w-[210px] rounded-[18px] p-1.5 z-40`}
                  role="menu"
                >
                  {/* 1. Upload or add files (Active, clickable, triggers file picker) */}
                  <div
                    role="menuitem"
                    onClick={() => {
                      fileInputRef.current?.click();
                      setPlusMenuOpen(false);
                    }}
                    className="aic-mode-menu-item flex items-center justify-between !h-9 px-3 cursor-pointer hover:bg-white/[0.08]"
                  >
                    <div className="flex items-center gap-2.5">
                      <Paperclip size={15} className="text-zinc-300 flex-shrink-0" />
                      <span className="text-[13.5px] font-medium text-zinc-100">Upload or add files</span>
                    </div>
                    <span className="text-[11px] font-mono text-zinc-400">Ctrl+U</span>
                  </div>

                  <div className="my-1 border-t border-white/[0.08]" />

                  {/* 2. Skills (Disabled / greyed out per user instruction) */}
                  <div
                    role="menuitem"
                    aria-disabled="true"
                    className="aic-mode-menu-item flex items-center justify-between !h-9 px-3 opacity-40 cursor-not-allowed select-none pointer-events-none"
                    title="Skills (coming soon)"
                  >
                    <div className="flex items-center gap-2.5">
                      <ScrollText size={15} className="text-zinc-400 flex-shrink-0" />
                      <span className="text-[13.5px] font-medium text-zinc-300">Skills</span>
                    </div>
                    <ChevronRight size={14} className="text-zinc-500" />
                  </div>

                  {/* 3. Connectors (Disabled / greyed out per user instruction) */}
                  <div
                    role="menuitem"
                    aria-disabled="true"
                    className="aic-mode-menu-item flex items-center justify-between !h-9 px-3 opacity-40 cursor-not-allowed select-none pointer-events-none"
                    title="Connectors (coming soon)"
                  >
                    <div className="flex items-center gap-2.5">
                      <LayoutGrid size={15} className="text-zinc-400 flex-shrink-0" />
                      <span className="text-[13.5px] font-medium text-zinc-300">Connectors</span>
                    </div>
                    <ChevronRight size={14} className="text-zinc-500" />
                  </div>

                  {/* 4. Plugins (Disabled / greyed out per user instruction; Note: Design system omitted per Eddy's instruction) */}
                  <div
                    role="menuitem"
                    aria-disabled="true"
                    className="aic-mode-menu-item flex items-center justify-between !h-9 px-3 opacity-40 cursor-not-allowed select-none pointer-events-none"
                    title="Plugins (coming soon)"
                  >
                    <div className="flex items-center gap-2.5">
                      <Puzzle size={15} className="text-zinc-400 flex-shrink-0" />
                      <span className="text-[13.5px] font-medium text-zinc-300">Plugins</span>
                    </div>
                    <ChevronRight size={14} className="text-zinc-500" />
                  </div>
                </div>
              </div>

              {/* 2. Mode Settings (Sliders) Icon Button - Greyed out & unclickable for now */}
              <div className="relative flex-shrink-0">
                <button
                  type="button"
                  disabled
                  className="aic-icon-btn opacity-40 cursor-not-allowed pointer-events-none"
                  title="Settings (temporarily disabled)"
                  aria-label="Settings"
                >
                  <SlidersHorizontal size={15} />
                </button>
              </div>

              {/* 3. Model Selector (Clean, NO effort/high shown) */}
              <div className="relative inline-flex items-center min-w-0 flex-shrink">
                {!autoMode ? (
                  <button
                    type="button"
                    onClick={handleOpenModelMenu}
                    className="aic-model-trigger-btn"
                    aria-haspopup="true"
                    aria-expanded={modelMenuOpen}
                  >
                    <span className="w-[20px] h-[20px] rounded-full bg-[#121215] flex items-center justify-center flex-shrink-0 border border-white/10">
                      <ProviderBadgeIcon provider={activeModel.provider} />
                    </span>
                    <span
                      className="font-medium truncate text-[14px]"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {activeModel.name}
                    </span>
                    <ChevronDown size={14} className="flex-shrink-0" style={{ color: 'var(--text-secondary)' }} />
                  </button>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={handleOpenModelMenu}
                    className="aic-model-trigger-btn"
                    aria-label="Auto model routing"
                  >
                    <span
                      className="font-medium select-none text-[14px]"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Auto
                    </span>
                    <ChevronDown size={14} className="flex-shrink-0" style={{ color: 'var(--text-secondary)' }} />
                  </div>
                )}

                {/* Model Selector Popover Menu */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  className={`aic-glass-popover ${
                    modelMenuOpen ? 'aic-popover-visible' : 'aic-popover-hidden'
                  } absolute left-0 bottom-0 w-[256px] rounded-[20px] p-2 z-30`}
                >
                  {/* Collapsible Search Models Input at Top */}
                  <div
                    onMouseEnter={() => {
                      isHoveringModelRowRef.current = false;
                      setHoveredModelId(null);
                    }}
                    className={`aic-search-row-wrap ${
                      searchRevealed || searchQuery.length > 0 ? 'revealed' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 px-2.5 h-8 rounded-lg">
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 16 16"
                        fill="none"
                        className="flex-shrink-0"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <circle
                          cx="7.2"
                          cy="7.2"
                          r="4.8"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        />
                        <path
                          d="M10.8 10.8L13.8 13.8"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search models"
                        autoComplete="off"
                        className="w-full bg-transparent border-none outline-none text-[14.5px] font-normal tracking-[-0.011em]"
                        style={{ color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>

                  {/* Auto Toggle Row */}
                  <div
                    onMouseEnter={() => {
                      isHoveringModelRowRef.current = false;
                      setHoveredModelId(null);
                    }}
                    className="flex items-center justify-between px-2.5 h-9"
                  >
                    <span
                      className="text-[15px] font-medium tracking-[-0.011em]"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Auto
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={autoMode}
                      onClick={handleToggleAutoInMenu}
                      className={`aic-ios-switch ${autoMode ? 'on' : ''}`}
                    >
                      <span className="aic-ios-switch-thumb" />
                    </button>
                  </div>

                  {/* Cohesive fav / all Segmented Filter Bar Below Auto */}
                  <div
                    role="tablist"
                    aria-label="Filter models"
                    onMouseEnter={() => {
                      isHoveringModelRowRef.current = false;
                      setHoveredModelId(null);
                    }}
                    className="aic-model-filter-bar"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={modelFilterTab === 'fav'}
                      onClick={(e) => {
                        e.stopPropagation();
                        setModelFilterTab('fav');
                        setHoveredModelId(null);
                      }}
                      className={`aic-model-filter-pill ${
                        modelFilterTab === 'fav' ? 'active' : ''
                      }`}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 16 16"
                        fill={modelFilterTab === 'fav' ? '#e4e4e7' : 'none'}
                        stroke={modelFilterTab === 'fav' ? '#e4e4e7' : 'currentColor'}
                        strokeWidth="1.4"
                        strokeLinejoin="round"
                        className="flex-shrink-0"
                      >
                        <path d="M8 1.6L9.95 5.55L14.3 6.18L11.15 9.25L11.89 13.58L8 11.53L4.11 13.58L4.85 9.25L1.7 6.18L6.05 5.55L8 1.6Z" />
                      </svg>
                      <span>fav</span>
                      {favCount > 0 && (
                        <span
                          className="text-[11.5px] font-normal opacity-75"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {favCount}
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={modelFilterTab === 'all'}
                      onClick={(e) => {
                        e.stopPropagation();
                        setModelFilterTab('all');
                        setHoveredModelId(null);
                      }}
                      className={`aic-model-filter-pill ${
                        modelFilterTab === 'all' ? 'active' : ''
                      }`}
                    >
                      <span>all</span>
                      <span
                        className="text-[11.5px] font-normal opacity-70"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {models.length}
                      </span>
                    </button>
                  </div>

                  {/* Models List (capped height, inner scroll) */}
                  <div
                    className="flex flex-col gap-0.5 overflow-y-auto"
                    style={{ maxHeight: 'min(320px, 45vh)' }}
                  >
                    {visibleModels.length === 0 ? (
                      <div
                        className="px-3 py-3 text-center text-[13px] tracking-[-0.01em]"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {modelFilterTab === 'fav' ? (
                          <>
                            No favourite models yet. Switch to{' '}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setModelFilterTab('all');
                              }}
                              className="underline font-medium"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              all
                            </button>{' '}
                            and press ★ to add.
                          </>
                        ) : (
                          'No matching models'
                        )}
                      </div>
                    ) : (
                      visibleModels.map((m) => {
                        const isSelected = !autoMode && m.id === activeModelId;
                        const isHovered =
                          m.id === hoveredModelId && searchQuery.trim().length === 0;
                        const isSelectable =
                          m.provider === 'muse' || m.provider === 'google' || m.id.startsWith('gemini');
                        const isAvailable = isSelectable && m.hasRealApi !== false;

                        return (
                          <div
                            key={m.id}
                            onClick={isAvailable ? (e) => handleSelectModel(e, m.id) : undefined}
                            onMouseEnter={() => {
                              if (!isAvailable) return;
                              clearHideEffortTimeout();
                              isHoveringModelRowRef.current = true;
                              if (modelMenuPointerReady) {
                                setHoveredModelId(m.id);
                              }
                            }}
                            onMouseMove={() => {
                              if (!isAvailable) return;
                              clearHideEffortTimeout();
                              isHoveringModelRowRef.current = true;
                              if (!modelMenuPointerReady) {
                                setModelMenuPointerReady(true);
                              }
                              if (hoveredModelId !== m.id) {
                                setHoveredModelId(m.id);
                              }
                            }}
                            onMouseLeave={() => {
                              if (!isAvailable) return;
                              isHoveringModelRowRef.current = false;
                              scheduleHideEffortSubmenu();
                            }}
                            className={`aic-model-row ${isHovered ? 'active-hover' : ''} ${
                              !isSelectable
                                ? 'opacity-30 grayscale cursor-not-allowed select-none pointer-events-none'
                                : !isAvailable
                                  ? 'opacity-40 cursor-not-allowed select-none'
                                  : ''
                            }`}
                            title={
                              !isSelectable
                                ? `${m.name} (Disabled)`
                                : !isAvailable
                                  ? `${m.name} (API endpoint not configured)`
                                  : m.desc || m.name
                            }
                          >
                            <div className="flex items-center gap-2 min-w-0 pr-1">
                              <span className="w-[26px] h-[26px] rounded-full bg-[#0c0c0f] flex items-center justify-center flex-shrink-0 border border-white/10">
                                <ProviderBadgeIcon provider={m.provider} />
                              </span>
                              <span className="text-[14.5px] truncate">
                                <span
                                  className="font-medium"
                                  style={{ color: 'var(--text-primary)' }}
                                >
                                  {m.name}
                                </span>
                                {!isSelectable ? (
                                  <span
                                    className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded bg-white/5 font-mono"
                                    style={{ color: 'var(--text-muted)' }}
                                  >
                                    Disabled
                                  </span>
                                ) : isAvailable ? (
                                  <span
                                    className="font-normal ml-1"
                                    style={{ color: 'var(--text-secondary)' }}
                                  >
                                    {m.effort}
                                  </span>
                                ) : (
                                  <span
                                    className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded bg-white/5 font-mono"
                                    style={{ color: 'var(--text-muted)' }}
                                  >
                                    No API
                                  </span>
                                )}
                              </span>
                              {isSelectable && m.provider === 'muse' && (
                                <button
                                  type="button"
                                  onClick={(e) => handleToggleFavStar(e, m.id)}
                                  className={`aic-fav-star-btn ${m.isFav ? 'starred' : ''}`}
                                  title={
                                    m.isFav
                                      ? 'Remove from favourites'
                                      : 'Add to favourites'
                                  }
                                  aria-label={`Toggle favourite for ${m.name}`}
                                >
                                  {m.isFav ? (
                                    <svg
                                      width="13.5"
                                      height="13.5"
                                      viewBox="0 0 16 16"
                                      fill="#e4e4e7"
                                      stroke="#e4e4e7"
                                      strokeWidth="1.2"
                                      strokeLinejoin="round"
                                    >
                                      <path d="M8 1.6L9.95 5.55L14.3 6.18L11.15 9.25L11.89 13.58L8 11.53L4.11 13.58L4.85 9.25L1.7 6.18L6.05 5.55L8 1.6Z" />
                                    </svg>
                                  ) : (
                                    <svg
                                      width="13.5"
                                      height="13.5"
                                      viewBox="0 0 16 16"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1.35"
                                      strokeLinejoin="round"
                                    >
                                      <path d="M8 1.6L9.95 5.55L14.3 6.18L11.15 9.25L11.89 13.58L8 11.53L4.11 13.58L4.85 9.25L1.7 6.18L6.05 5.55L8 1.6Z" />
                                    </svg>
                                  )}
                                </button>
                              )}
                            </div>
                            {isSelected && <CheckmarkIcon />}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Floating Effort Submenu (Appears on model hover & tracks vertically) */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  onMouseEnter={() => {
                    clearHideEffortTimeout();
                    isHoveringEffortMenuRef.current = true;
                  }}
                  onMouseLeave={() => {
                    isHoveringEffortMenuRef.current = false;
                    scheduleHideEffortSubmenu();
                  }}
                  style={{ bottom: `${effortBottomOffsetPx}px` }}
                  className={`aic-glass-popover aic-effort-submenu-bridge ${
                    isEffortMenuVisible ? 'aic-popover-visible' : 'aic-popover-hidden'
                  } absolute left-[266px] w-[148px] rounded-[18px] p-2 z-30`}
                >
                  <div
                    className="px-2.5 py-1.5 text-[14.5px] font-medium tracking-[-0.011em]"
                    style={{ color: 'var(--effort-header)' }}
                  >
                    Effort
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {hoveredModel?.efforts.map((level) => {
                      const isCurrentEffort = hoveredModel.effort === level;
                      return (
                        <div
                          key={level}
                          onClick={(e) => handleSelectEffort(e, level)}
                          className="aic-mode-menu-item h-[34px] px-2.5 text-[14.5px]"
                        >
                          <span>{level}</span>
                          {isCurrentEffort && <CheckmarkIcon />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Controls Group: Turbo + Audio + Send */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Turbo / Execution Mode Button & Popover */}
              <div className="relative flex-shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setModeMenuOpen(false);
                    setModelMenuOpen(false);
                    setHoveredModelId(null);
                    setTurboMenuOpen((prev) => !prev);
                  }}
                  className="aic-decluttered-turbo-btn"
                  title="Execution autonomy & Turbo self-healing mode"
                  aria-haspopup="true"
                  aria-expanded={turboMenuOpen}
                >
                  <span
                    className="flex items-center justify-center flex-shrink-0"
                    style={{ color: 'var(--icon-primary)' }}
                  >
                    {agentMode === 'turbo' && <Zap size={14} />}
                    {agentMode === 'default' && <ShieldCheck size={14} />}
                    {agentMode === 'review' && <ShieldAlert size={14} />}
                  </span>
                  <span style={{ textTransform: 'capitalize' }}>{agentMode}</span>
                </button>

                {/* Execution Mode Popover - right-aligned with generous spacing */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  className={`aic-glass-popover ${
                    turboMenuOpen ? 'aic-popover-visible' : 'aic-popover-hidden'
                  } absolute right-0 bottom-[44px] w-[280px] rounded-[20px] p-2 z-30`}
                  role="menu"
                >
                  <div className="flex flex-col gap-1.5">
                    {executionModes.map((opt) => {
                      const isSelected = agentMode === opt.id;
                      return (
                        <div
                          key={opt.id}
                          role="menuitem"
                          onClick={() => {
                            onChangeMode(opt.id);
                            setTurboMenuOpen(false);
                          }}
                          className={`w-full py-2.5 px-3 rounded-[13px] flex items-start justify-between cursor-pointer transition-colors duration-150 ${
                            isSelected
                              ? 'bg-white/[0.08] text-white'
                              : 'hover:bg-white/[0.05] text-zinc-300'
                          }`}
                        >
                          <div className="flex items-start gap-2.5 min-w-0 pr-2">
                            <span
                              className="mt-0.5 flex-shrink-0"
                              style={{
                                color: isSelected
                                  ? 'var(--text-primary)'
                                  : 'var(--text-secondary)',
                              }}
                            >
                              {opt.icon}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div
                                className="text-[13.5px] font-semibold leading-snug"
                                style={{ color: 'var(--text-primary)' }}
                              >
                                {opt.title}
                              </div>
                              <div
                                className="text-[11.5px] font-normal leading-normal mt-1"
                                style={{ color: 'var(--text-secondary)' }}
                              >
                                {opt.desc}
                              </div>
                            </div>
                          </div>
                          {isSelected && (
                            <span className="mt-0.5 flex-shrink-0">
                              <CheckmarkIcon />
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Microphone / Record Button */}
              <button
                type="button"
                onClick={handleRecordClick}
                disabled={isTranscribing}
                className={`aic-icon-btn ${
                  isRecording ? '!text-red-500 !bg-red-500/15' : isTranscribing ? '!text-indigo-400 !bg-indigo-500/15' : ''
                }`}
                aria-label={isRecording ? 'Stop recording voice' : isTranscribing ? 'Transcribing audio...' : 'Record voice input'}
                title={isRecording ? `Recording... (${formattedRecordingTime})` : isTranscribing ? 'Transcribing audio...' : 'Voice input'}
              >
                {isRecording ? (
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 aic-recording-dot" />
                ) : isTranscribing ? (
                  <span className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Mic size={16} />
                )}
              </button>

              {/* Submit Up-Arrow / Stop Circle Button */}
              <button
                type="button"
                onClick={handleSubmitPrompt}
                className={`aic-submit-circle-btn ${isSubmitReady || isWorking ? 'ready' : ''}`}
                aria-label={isWorking ? 'Stop running task' : 'Submit prompt'}
                title={isWorking ? 'Stop' : 'Submit'}
              >
                {isWorking ? (
                  <Square size={12} fill="currentColor" />
                ) : (
                  <ArrowUp size={16} strokeWidth={2.3} />
                )}
              </button>
            </div>
          </div>
        </section>
        )}
      </div>
    </div>
  );
};

