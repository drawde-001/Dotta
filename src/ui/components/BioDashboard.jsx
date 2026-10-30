import React, { useState } from 'react';
import {
  SlidersHorizontal,
  ChevronDown,
  Plus,
  Shield,
  Bookmark,
  MoreHorizontal,
  Camera,
  Github,
  Linkedin,
  Twitter,
  Instagram,
  Globe,
  FileText,
  Check,
  Circle,
  Image as ImageIcon,
  Mic,
  Video,
  Leaf,
  Lock,
  CornerDownLeft,
  Trash2
} from 'lucide-react';

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-1.5">
      <span className="text-[11px] text-zinc-400">{label}:</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-4 w-8 rounded-full transition-colors ${
          checked ? 'bg-zinc-200' : 'bg-zinc-800'
        }`}
      >
        <span
          className={`absolute top-[2px] h-3 w-3 rounded-full transition-all ${
            checked ? 'left-[18px] bg-zinc-950' : 'left-[2px] bg-zinc-400'
          }`}
        />
      </button>
    </label>
  );
}

const WORK_HISTORY = [
  { period: '2024 to now', title: 'Staff AI Engineer', meta: 'Anthropic Ecosystem · Remote' },
  { period: '2021 to 2024', title: 'Senior Systems Architect', meta: 'Cloud Infrastructure · San Francisco' },
  { period: '2019 to 2021', title: 'Distributed Systems Engineer', meta: 'Lumen Systems · Seattle' }
];

const ENTRIES = [
  { Icon: FileText, type: 'Document', name: 'Degree & Transcript', desc: 'Official Master of Science Computer Science diploma from University of Washington.', meta: 'MS_CS_Degree.pdf · 2.1 MB' },
  { Icon: ImageIcon, type: 'Image', name: 'Professional Headshot', desc: 'Transparent PNG formal headshot for speaker bios and application portals.', meta: 'headshot_formal.png · 4.8 MB' },
  { Icon: Mic, type: 'Audio', name: 'Name Pronunciation', desc: 'Short recording demonstrating proper pronunciation of full legal name and short self-intro.', meta: 'Agent: not readable yet' },
  { Icon: Video, type: 'Video', name: 'Elevator Pitch Video', desc: '60-second video introduction explaining recent agent architecture achievements.', meta: 'Agent: not readable yet' }
];

export function BioDashboard() {
  const [readOn, setReadOn] = useState(true);
  const [writeOn, setWriteOn] = useState(false);
  const [notes, setNotes] = useState([
    'Prioritize applications requiring autonomous agent orchestrations, multi-turn tool architectures, and TypeScript/Node backends. Emphasize security posture and RLS isolation.'
  ]);
  const [noteDraft, setNoteDraft] = useState('');

  const addNote = () => {
    const text = noteDraft.trim();
    if (!text) return;
    setNotes((prev) => [...prev, text]);
    setNoteDraft('');
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Global Header: BIO */}
      <header className="flex items-center justify-between border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-tight text-zinc-100">BIO</h1>
              <span className="rounded-full border border-zinc-700/50 bg-zinc-800/90 px-2 py-0.5 font-mono text-[10px] text-zinc-300">
                User-Owned Store
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              All data is strictly user-controlled. Agent access requires explicit permission.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800"
            title="Preferences"
          >
            <SlidersHorizontal size={14} />
            <span>Preferences</span>
          </button>
        </div>
      </header>

      {/* Main grid */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Left column: profile */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.04] bg-[#141417] p-3.5 shadow-md">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="shrink-0 text-xs font-semibold text-zinc-300">Profile:</span>
                <div className="relative min-w-0 flex-1">
                  <select
                    className="w-full appearance-none truncate rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 pr-7 text-xs font-medium text-zinc-100 focus:outline-none"
                    defaultValue="p1"
                  >
                    <option value="p1">Alex Morgan (Default · Active)</option>
                    <option value="p2">Executive / Advisor Profile</option>
                    <option value="p3">Research &amp; Deep Tech</option>
                  </select>
                  <ChevronDown
                    size={14}
                    className="pointer-events-none absolute right-2.5 top-2.5 text-zinc-400"
                  />
                </div>
              </div>
              <button
                type="button"
                className="flex shrink-0 items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                title="Create New Profile"
              >
                <Plus size={14} />
                <span>New</span>
              </button>
            </div>

            <div className="flex items-center justify-between border-t border-white/[0.06] pt-2 text-xs">
              <div className="flex items-center gap-1.5 text-zinc-400">
                <Shield size={14} className="text-zinc-300" />
                <span className="text-[11px] font-medium text-zinc-300">Agent Access:</span>
              </div>
              <div className="flex items-center gap-3">
                <Toggle label="Read" checked={readOn} onChange={setReadOn} />
                <Toggle label="Write" checked={writeOn} onChange={setWriteOn} />
              </div>
            </div>
          </div>

          <article className="relative w-full overflow-hidden rounded-3xl border border-white/[0.04] bg-[#141417] shadow-xl">
            <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-zinc-300 backdrop-blur-md transition-colors hover:bg-black/70 hover:text-white"
                title="Bookmark profile"
              >
                <Bookmark size={16} />
              </button>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-zinc-300 backdrop-blur-md transition-colors hover:bg-black/70 hover:text-white"
                title="Profile options"
              >
                <MoreHorizontal size={16} />
              </button>
            </div>

            <div className="relative flex h-[390px] w-full items-center justify-center overflow-hidden bg-zinc-950 sm:h-[420px]">
              <img
                src="/images/alex_morgan_portrait.jpg"
                alt="Alex Morgan Profile Photo"
                className="h-full w-full object-cover object-center"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-44 bg-gradient-to-t from-[#141417] via-[#141417]/80 to-transparent" />
              <button
                type="button"
                className="absolute left-4 top-4 z-20 flex items-center gap-1.5 rounded-xl bg-black/50 px-2.5 py-1.5 text-[11px] text-zinc-200 backdrop-blur-md transition-colors hover:bg-black/70"
              >
                <Camera size={14} />
                <span>Change Photo</span>
              </button>
              <div className="absolute inset-x-0 bottom-4 left-5 right-5 z-20 flex flex-col gap-2">
                <div>
                  <h2 className="truncate text-2xl font-bold tracking-tight text-white drop-shadow-md">
                    Alex Morgan
                  </h2>
                  <p className="mt-0.5 truncate text-xs font-medium tracking-wide text-zinc-300 drop-shadow">
                    Alexander James Morgan · AI Systems Architect
                  </p>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  {[
                    { Icon: Github, label: 'GitHub' },
                    { Icon: Linkedin, label: 'LinkedIn' },
                    { Icon: Twitter, label: 'X (Twitter)' },
                    { Icon: Instagram, label: 'Instagram' },
                    { Icon: Globe, label: 'Personal Website' }
                  ].map(({ Icon, label }) => (
                    <span
                      key={label}
                      title={label}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-zinc-200 backdrop-blur-md"
                    >
                      <Icon size={14} />
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4 p-5 text-sm">
              <div className="flex flex-col gap-1 border-b border-white/[0.05] pb-3">
                <span className="text-xs font-medium text-zinc-400">Role</span>
                <div className="text-xs font-medium leading-snug text-zinc-100 sm:text-sm">
                  Lead AI Systems Architect &amp; Full-Stack Engineer
                </div>
              </div>

              <div className="flex flex-col gap-1 border-b border-white/[0.05] pb-3">
                <span className="text-xs font-medium text-zinc-400">Locations</span>
                <div className="flex flex-col gap-1 text-xs text-zinc-200">
                  <div>
                    <span className="font-mono text-zinc-400">Residence:</span>{' '}
                    San Francisco, California, US
                  </div>
                  <div>
                    <span className="font-mono text-zinc-400">State of Origin:</span> Washington, US
                  </div>
                  <div>
                    <span className="font-mono text-zinc-400">Address:</span>{' '}
                    <span className="italic text-zinc-400">Missing (Click to add)</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1 border-b border-white/[0.05] pb-3">
                <span className="text-xs font-medium text-zinc-400">Personal Web</span>
                <a
                  href="https://alexmorgan.dev"
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-zinc-200 underline-offset-4 hover:underline"
                >
                  https://alexmorgan.dev
                </a>
              </div>

              <div className="flex flex-col gap-1 border-b border-white/[0.05] pb-3">
                <span className="text-xs font-medium text-zinc-400">CV / Resume</span>
                <div className="mt-0.5 flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/70 p-2">
                  <div className="flex items-center gap-2 text-xs">
                    <FileText size={16} className="text-zinc-400" />
                    <span className="font-medium text-zinc-200">Alex_Morgan_CV_2026.pdf</span>
                    <span className="font-mono text-[10px] text-zinc-500">(142 KB)</span>
                  </div>
                  <span className="rounded border border-zinc-700/60 bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-300">
                    Verified for Agent
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1 border-b border-white/[0.05] pb-3">
                <span className="text-xs font-medium text-zinc-400">Interests</span>
                <div className="mt-0.5 flex flex-wrap gap-1.5">
                  {['Autonomous Agents', 'Distributed Systems', 'React 19 & Next.js', 'Compiler Design'].map(
                    (tag) => (
                      <span
                        key={tag}
                        className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-0.5 text-xs text-zinc-300"
                      >
                        {tag}
                      </span>
                    )
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1 border-b border-white/[0.05] pb-3">
                <div className="mb-1 flex items-center justify-between text-xs text-zinc-400">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-300">Work history</span>
                    <span className="font-mono text-[10px] text-zinc-500">3 roles</span>
                  </div>
                </div>
                <div className="flex flex-col">
                  {WORK_HISTORY.map((role) => (
                    <div
                      key={role.title}
                      className="flex items-start gap-4 border-t border-white/[0.04] py-2.5"
                    >
                      <div className="w-24 flex-none pt-0.5 font-mono text-[11px] text-zinc-500 sm:w-28">
                        {role.period}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium text-zinc-100 sm:text-[13px]">
                          {role.title}
                        </div>
                        <div className="text-[11px] text-zinc-400">{role.meta}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1 border-b border-white/[0.05] pb-3">
                <span className="text-xs font-medium text-zinc-400">Personal Dos &amp; Don&apos;ts</span>
                <div className="grid grid-cols-1 gap-2 text-xs">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                    <span className="mb-1 block font-medium text-zinc-200">Personal Dos:</span>
                    <p className="leading-relaxed text-zinc-400">
                      Highlight async communication, zero-shot verification, and telemetry ownership.
                    </p>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                    <span className="mb-1 block font-medium text-zinc-200">Personal Don&apos;ts:</span>
                    <p className="leading-relaxed text-zinc-400">
                      Do not list legacy jQuery/PHP; avoid non-remote roles without relocation aid.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1 border-b border-white/[0.05] pb-3">
                <span className="text-xs font-medium text-zinc-400">Hobby &amp; Ideas</span>
                <div className="flex flex-col gap-1 text-xs text-zinc-300">
                  <p>
                    <span className="font-semibold text-zinc-200">Open-Source Parser:</span>{' '}
                    High-throughput AST parser in WebAssembly.
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-200">Idea:</span> Verified verifiable
                    credentials using zero-knowledge client attestation.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="font-semibold text-zinc-200">My notes</span>
                  <span className="font-mono text-[11px] text-zinc-500">OCT 30, 03:15</span>
                </div>
                <div className="flex flex-col gap-2">
                  {notes.map((note, idx) => (
                    <div
                      key={idx}
                      className="group/note flex items-start justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs leading-relaxed text-zinc-300"
                    >
                      <span>{note}</span>
                      <button
                        type="button"
                        aria-label="Delete note"
                        onClick={() => setNotes((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-zinc-500 opacity-0 transition-opacity hover:text-red-400 group-hover/note:opacity-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="relative mt-1">
                  <input
                    type="text"
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addNote();
                      }
                    }}
                    placeholder="Type new note and press enter..."
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900/90 px-3.5 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-700"
                  />
                  <button
                    type="button"
                    aria-label="Add note"
                    onClick={addNote}
                    className="absolute right-2.5 top-2 text-zinc-400 hover:text-white"
                  >
                    <CornerDownLeft size={14} />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <span className="text-xs font-semibold text-zinc-200">Biography</span>
                <p className="text-xs leading-relaxed text-zinc-300">
                  Alex Morgan is a systems engineer and software architect with a decade of
                  experience designing scalable distributed runtimes, AI tool execution frameworks,
                  and security-hardened agent platforms. Known for balancing rapid prototyping with
                  strict fail-closed sandboxing, Alex has led platform infrastructure initiatives
                  that bridge low-level execution with intuitive human-in-the-loop interfaces.
                </p>
              </div>
            </div>
          </article>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6 lg:col-span-7 lg:grid lg:grid-cols-12">
          <div className="flex flex-col gap-6 lg:col-span-7">
            <section
              aria-label="Profile strength"
              className="flex flex-col gap-4 rounded-3xl border border-white/[0.04] bg-[#141417] p-6 shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                <h2 className="text-sm font-semibold tracking-tight text-white">Profile strength</h2>
                <span className="font-mono text-xs text-zinc-400">7 of 8 core</span>
              </div>
              <div className="flex items-center gap-6 py-1">
                <svg
                  role="img"
                  aria-label="Profile 88 percent complete"
                  width="96"
                  height="96"
                  viewBox="0 0 104 104"
                  className="shrink-0"
                >
                  <circle cx="52" cy="52" r="44" fill="none" stroke="#27272a" strokeWidth="8" />
                  <circle
                    cx="52"
                    cy="52"
                    r="44"
                    fill="none"
                    stroke="#e4e4e7"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray="243.3 276.5"
                    transform="rotate(-90 52 52)"
                  />
                  <text
                    x="52"
                    y="58"
                    textAnchor="middle"
                    fill="#f4f4f5"
                    fontSize="22"
                    fontWeight="600"
                    fontFamily="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
                  >
                    88%
                  </text>
                </svg>
                <ul className="flex flex-col gap-2 text-xs text-zinc-300">
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-zinc-300" />
                    <span>Photo and name</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-zinc-300" />
                    <span>CV uploaded</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-zinc-300" />
                    <span>Personal website</span>
                  </li>
                  <li className="flex items-center gap-2 text-zinc-400">
                    <Circle size={12} className="text-zinc-500" />
                    <span>Address missing</span>
                  </li>
                </ul>
              </div>
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 py-2.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
              >
                <Plus size={14} className="text-zinc-300" />
                <span>Add address</span>
              </button>
            </section>

            <section className="flex flex-col gap-5 rounded-3xl border border-white/[0.04] bg-[#141417] p-6 shadow-xl">
              <div className="flex flex-col items-start justify-between gap-4 border-b border-white/[0.06] pb-4 sm:flex-row sm:items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold tracking-tight text-white">Additional bio</h3>
                    <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-xs text-zinc-400">
                      4 entries
                    </span>
                  </div>
                  <p className="mt-1 max-w-xl text-xs leading-relaxed text-zinc-400">
                    Supplemental assets, portfolio media, certificates, and recordings that give the
                    agent rich verified context during applications.
                  </p>
                </div>
                <button
                  type="button"
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-zinc-100 px-3.5 py-2 text-xs font-medium text-zinc-950 shadow-md transition-all hover:bg-white"
                >
                  <Plus size={14} />
                  <span>Add data</span>
                </button>
              </div>

              <div className="flex flex-col gap-3">
                {ENTRIES.map(({ Icon, type, name, desc, meta }) => (
                  <div
                    key={name}
                    className="group flex flex-col justify-between gap-2.5 rounded-2xl border border-zinc-800/60 bg-zinc-900/60 p-3.5 transition-colors hover:bg-zinc-900/90"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-zinc-300">
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="truncate text-xs font-semibold text-zinc-100">{name}</h4>
                          <span className="rounded border border-zinc-700/50 bg-zinc-800 px-1.5 py-0.5 font-mono text-[9px] uppercase text-zinc-400">
                            {type}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-zinc-400">
                          {desc}
                        </p>
                      </div>
                    </div>
                    <div className="border-t border-white/[0.04] pt-2 font-mono text-[11px] text-zinc-500">
                      <span>{meta}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="flex flex-col gap-6 lg:col-span-5">
            <section
              aria-label="Recent agent activity"
              className="flex flex-col gap-4 rounded-3xl border border-white/[0.04] bg-[#141417] p-5 shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                <h2 className="text-sm font-semibold tracking-tight text-white">
                  Recent agent activity
                </h2>
                <span className="font-mono text-[10px] text-zinc-400">Field names only</span>
              </div>

              <div className="flex flex-col gap-2 rounded-2xl border border-zinc-800/70 bg-zinc-900/60 p-3.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300">
                    <Leaf size={14} />
                  </div>
                  <span className="text-xs font-medium leading-snug text-zinc-100">
                    Checked bio for job application
                  </span>
                </div>
                <div className="pl-8 text-[11px] text-zinc-500">Today, 02:41 · Read 4 fields</div>
                <div className="flex flex-wrap gap-1.5 pl-8 pt-1">
                  {['Role', 'Residence', 'CV', 'Website'].map((field) => (
                    <span
                      key={field}
                      className="rounded-full border border-zinc-700/50 bg-zinc-800/80 px-2.5 py-0.5 font-mono text-[11px] text-zinc-300"
                    >
                      {field}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 rounded-2xl border border-zinc-800/70 bg-zinc-900/60 p-3.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300">
                    <Check size={14} />
                  </div>
                  <span className="text-xs font-medium leading-snug text-zinc-100">
                    Save approved by you
                  </span>
                </div>
                <div className="pl-8 text-[11px] text-zinc-500">
                  Today, 02:43 · Notice period proposed
                </div>
              </div>

              <div className="flex flex-col gap-2 rounded-2xl border border-zinc-800/70 bg-zinc-900/60 p-3.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300">
                    <Shield size={14} />
                  </div>
                  <span className="text-xs font-medium leading-snug text-zinc-200">
                    Active Profile Bound
                  </span>
                </div>
                <div className="pl-8 text-[11px] text-zinc-500">
                  Alex Morgan (Default) · No silent switch
                </div>
              </div>

              <div className="mt-1 flex items-start gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                <Lock size={16} className="mt-0.5 shrink-0 text-zinc-400" />
                <p className="text-[11px] leading-relaxed text-zinc-400">
                  <strong className="text-zinc-200">Zero-value leak guarantee:</strong> Audit logs
                  record field IDs only, never values. Agent reads index first without touching
                  data.
                </p>
              </div>
            </section>

            <section className="flex flex-col gap-3 rounded-3xl border border-white/[0.04] bg-[#141417] p-5 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-200">Agent Write Guard</span>
                <span className="rounded border border-zinc-700/60 bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-300">
                  Enforced
                </span>
              </div>
              <p className="text-xs leading-snug text-zinc-400">
                Every write proposal requires human confirmation via Approval Card. No web page or
                unconfirmed answer can mutate your profile.
              </p>
              <div className="flex items-center justify-between border-t border-white/[0.04] pt-2 font-mono text-[11px] text-zinc-500">
                <span>Fail-closed policy</span>
                <span className="text-zinc-300">Deny on default</span>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BioDashboard;
