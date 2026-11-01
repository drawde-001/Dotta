import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  sanitizeUserId,
  getUserWorkspaceRoot,
  validateAndResolvePath
} from '../execution/workspace.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * BIO data layer (per-user profile store).
 *
 * Storage: one JSON document per user at src/data/bio/<userId>.json, written
 * atomically. The shape is deliberately relational (profiles -> fields,
 * entries, grants, proposals, answers) so it can move to SQL/Supabase tables
 * later without changing callers. Supabase is NOT wired in this repo today.
 */

export const BIO_FIELDS = [
  { id: 'photo', label: 'Photo', type: 'image', description: 'Profile photo used on forms that ask for a picture.' },
  { id: 'fullName', label: 'Full name', type: 'text', description: 'Full display name of the user.' },
  { id: 'firstName', label: 'First Name', type: 'text', description: 'First name of the user.' },
  { id: 'lastName', label: 'Last Name', type: 'text', description: 'Last name of the user.' },
  { id: 'dob', label: 'Date of Birth (DOB)', type: 'text', description: 'Date of birth of the user (e.g. YYYY-MM-DD).' },
  { id: 'address', label: 'Address', type: 'text', description: 'Full postal street address of the user.' },
  { id: 'suiteApt', label: 'Suite/Apt.', type: 'text', description: 'Suite, apartment, or unit number.' },
  { id: 'city', label: 'City', type: 'text', description: 'City of residence.' },
  { id: 'state', label: 'State', type: 'text', description: 'State of residence.' },
  { id: 'zipCode', label: 'Zip Code', type: 'text', description: 'Postal or zip code.' },
  { id: 'country', label: 'Country', type: 'text', description: 'Country of residence.' },
  { id: 'email', label: 'Email', type: 'text', description: 'Contact email used on applications and forms.' },
  { id: 'phone', label: 'Phone', type: 'text', description: 'Contact phone number used on applications and forms.' },
  { id: 'gender', label: 'Gender', type: 'text', description: 'Gender identity (e.g. Female).' },
  { id: 'ethnicAppearance', label: 'Ethnic Appearance', type: 'text', description: 'Ethnic appearance / ethnicity for casting and applications (e.g. White).' },
  { id: 'unionStatus', label: 'Union Status', type: 'text', description: 'Union status for talent and industry applications (e.g. Non-Union, SAG-AFTRA).' },
  { id: 'languages', label: 'Languages', type: 'text', description: 'Spoken languages (e.g. English).' },
  { id: 'dialects', label: 'Dialects', type: 'text', description: 'Spoken dialects and accents (e.g. General American, Standard British).' },
  { id: 'headline', label: 'Headline', type: 'text', description: 'Full legal name and headline / title line.' },
  { id: 'role', label: 'Role', type: 'text', description: 'Current professional role.' },
  { id: 'residence', label: 'Residence', type: 'text', description: 'Where the user currently lives (city, state, country).' },
  { id: 'stateOfOrigin', label: 'State of origin', type: 'text', description: 'State of origin of the user.' },
  { id: 'socialLinks', label: 'Social links', type: 'object', description: 'GitHub, LinkedIn, X and Instagram profile URLs.' },
  { id: 'website', label: 'Personal website', type: 'url', description: 'Personal website or portfolio URL. Core field for applications.' },
  { id: 'cv', label: 'CV / Resume', type: 'file', description: 'CV or resume file reference (name and sandbox path). Core field.' },
  { id: 'background', label: 'Background / Biography', type: 'text', description: 'Biography / background summary of the user.' },
  { id: 'interests', label: 'Interests', type: 'list', description: 'Professional interests and focus areas.' },
  { id: 'workHistory', label: 'Work history', type: 'list', description: 'Previous roles with period, title and company/location.' },
  { id: 'dos', label: 'Personal dos', type: 'text', description: 'Things the agent should do when acting for the user.' },
  { id: 'donts', label: "Personal don'ts", type: 'text', description: 'Things the agent must never do for the user.' },
  { id: 'hobbyProjects', label: 'Hobby projects', type: 'text', description: 'Hobby projects of the user.' },
  { id: 'ideas', label: 'Ideas', type: 'text', description: 'Ideas the user wants to build or explore.' },
  { id: 'notes', label: 'My notes', type: 'list', description: 'User notes and preferences for the agent (e.g. remote-only roles).' }
];

export const BIO_FIELD_MAP = Object.fromEntries(BIO_FIELDS.map((f) => [f.id, f]));
export const BIO_ENTRY_TYPES = ['document', 'image', 'audio', 'video'];

export function getBioDataDir() {
  const dir = process.env.AGENT_BIO_DIR || path.resolve(__dirname, '../../data/bio');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function bioFilePath(userId) {
  const safe = sanitizeUserId(userId);
  if (!safe) throw new Error('Invalid user id');
  return path.join(getBioDataDir(), `${safe}.json`);
}

function atomicWriteJson(filePath, data) {
  const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tempPath, filePath);
}

function emptyFields() {
  return {
    photo: '',
    fullName: '',
    firstName: '',
    lastName: '',
    dob: '',
    address: '',
    suiteApt: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'United States',
    email: '',
    phone: '',
    gender: 'Female',
    ethnicAppearance: 'White',
    unionStatus: 'Non-Union',
    languages: 'English',
    dialects: 'General American, Standard British',
    headline: '',
    role: '',
    residence: '',
    stateOfOrigin: '',
    socialLinks: { github: '', linkedin: '', x: '', instagram: '' },
    website: '',
    cv: null,
    background: '',
    interests: [],
    workHistory: [],
    dos: '',
    donts: '',
    hobbyProjects: '',
    ideas: '',
    notes: []
  };
}

function seedProfile() {
  const id = `profile-${crypto.randomUUID().slice(0, 8)}`;
  return {
    id,
    name: 'Alex Morgan (Default)',
    isActive: true,
    grants: { read: false, write: false },
    fields: {
      ...emptyFields(),
      photo: '/images/alex_morgan_portrait.jpg',
      fullName: 'Alex Morgan',
      firstName: 'Alex',
      lastName: 'Morgan',
      dob: '1998-10-28',
      address: '500 Howard St',
      suiteApt: 'Suite 400',
      city: 'San Francisco',
      state: 'California',
      zipCode: '94105',
      country: 'United States',
      email: 'alex.morgan@example.com',
      phone: '+1 (555) 010-2026',
      gender: 'Female',
      ethnicAppearance: 'White',
      unionStatus: 'Non-Union',
      languages: 'English',
      dialects: 'General American, Standard British',
      headline: 'Alexander James Morgan · AI Systems Architect',
      role: 'Lead AI Systems Architect & Full-Stack Engineer',
      residence: 'San Francisco, California, US',
      stateOfOrigin: 'Washington, US',
      website: 'https://alexmorgan.dev',
      socialLinks: {
        github: 'https://github.com',
        linkedin: 'https://linkedin.com',
        x: 'https://twitter.com',
        instagram: 'https://instagram.com'
      },
      cv: { name: 'Alex_Morgan_CV_2026.pdf', size: 142000, path: '' },
      background:
        'Alex Morgan is a systems engineer and software architect with a decade of experience designing scalable distributed runtimes, AI tool execution frameworks, and security-hardened agent platforms. Known for balancing rapid prototyping with strict fail-closed sandboxing, Alex has led platform infrastructure initiatives that bridge low-level execution with intuitive human-in-the-loop interfaces.',
      interests: ['Autonomous Agents', 'Distributed Systems', 'React 19 & Next.js', 'Compiler Design'],
      workHistory: [
        { period: '2024 to now', title: 'Staff AI Engineer', meta: 'Anthropic Ecosystem · Remote' },
        { period: '2021 to 2024', title: 'Senior Systems Architect', meta: 'Cloud Infrastructure · San Francisco' },
        { period: '2019 to 2021', title: 'Distributed Systems Engineer', meta: 'Lumen Systems · Seattle' }
      ],
      dos: 'Highlight async communication, zero-shot verification, and telemetry ownership.',
      donts: 'Do not list legacy jQuery/PHP; avoid non-remote roles without relocation aid.',
      hobbyProjects: 'Open-Source Parser: High-throughput AST parser in WebAssembly.',
      ideas: 'Idea: Verified verifiable credentials using zero-knowledge client attestation.',
      notes: [
        'Prioritize applications requiring autonomous agent orchestrations, multi-turn tool architectures, and TypeScript/Node backends. Emphasize security posture and RLS isolation.'
      ]
    },
    entries: [
      {
        id: `entry-${crypto.randomUUID().slice(0, 8)}`,
        name: 'Degree & Transcript',
        type: 'document',
        description: 'Official Master of Science Computer Science diploma from University of Washington.',
        file: { name: 'MS_CS_Degree.pdf', size: 2100000, mime: 'application/pdf', path: '' },
        textContent: 'Master of Science in Computer Science, University of Washington. (Dummy document text for demo purposes.)',
        createdAt: Date.now()
      },
      {
        id: `entry-${crypto.randomUUID().slice(0, 8)}`,
        name: 'Professional Headshot',
        type: 'image',
        description: 'Transparent PNG formal headshot for speaker bios and application portals.',
        file: { name: 'headshot_formal.png', size: 4800000, mime: 'image/png', path: '' },
        textContent: '',
        createdAt: Date.now()
      },
      {
        id: `entry-${crypto.randomUUID().slice(0, 8)}`,
        name: 'Name Pronunciation',
        type: 'audio',
        agentReadable: false,
        description: 'Short recording demonstrating proper pronunciation of full legal name and short self-intro.',
        file: null,
        textContent: '',
        createdAt: Date.now()
      },
      {
        id: `entry-${crypto.randomUUID().slice(0, 8)}`,
        name: 'Elevator Pitch Video',
        type: 'video',
        agentReadable: false,
        description: '60-second video introduction explaining recent agent architecture achievements.',
        file: null,
        textContent: '',
        createdAt: Date.now()
      }
    ],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

const SEED_ASSETS_DIR = path.resolve(__dirname, 'assets');
const SEED_ASSET_BY_TYPE = {
  document: { asset: 'seed-cv.pdf', dest: 'bio/seed-degree.pdf', name: 'Degree_Transcript.pdf', mime: 'application/pdf' },
  image: { asset: 'seed-photo.jpg', dest: 'bio/seed-headshot.jpg', name: 'headshot_formal.jpg', mime: 'image/jpeg' },
  audio: { asset: 'seed-voice.wav', dest: 'bio/seed-voice.wav', name: 'voice-intro.wav', mime: 'audio/wav' },
  video: { asset: 'seed-intro.webm', dest: 'bio/seed-intro.webm', name: 'intro-video.webm', mime: 'video/webm' }
};

function sandboxFileExists(userId, relPath) {
  if (!relPath || typeof relPath !== 'string') return false;
  if (relPath.startsWith('/') || relPath.startsWith('http')) return false;
  try {
    const resolved = validateAndResolvePath(getUserWorkspaceRoot(userId), relPath);
    return fs.existsSync(resolved) && fs.statSync(resolved).isFile();
  } catch {
    return false;
  }
}

function copySeedAsset(userId, assetName, destRel) {
  try {
    const src = path.join(SEED_ASSETS_DIR, assetName);
    if (!fs.existsSync(src)) return null;
    const dest = validateAndResolvePath(getUserWorkspaceRoot(userId), destRel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    return { path: destRel, size: fs.statSync(dest).size };
  } catch {
    return null;
  }
}

/**
 * Seeded/demo BIO data must never claim files that do not exist. On load,
 * any profile whose photo/CV/entries reference missing sandbox files gets
 * real dummy files materialized into the user's own sandbox (repair pass —
 * also fixes profiles seeded before this existed).
 */
function materializeProfileFiles(userId, profile) {
  let changed = false;
  const fields = profile.fields || (profile.fields = {});

  if (!sandboxFileExists(userId, fields.photo)) {
    const copied = copySeedAsset(userId, 'seed-photo.jpg', 'bio/seed-photo.jpg');
    if (copied) {
      fields.photo = copied.path;
      changed = true;
    }
  }

  if (!fields.cv?.path || !sandboxFileExists(userId, fields.cv.path)) {
    const copied = copySeedAsset(userId, 'seed-cv.pdf', 'bio/seed-cv.pdf');
    if (copied) {
      fields.cv = {
        name: fields.cv?.name || 'Alex_Morgan_CV_2026.pdf',
        size: copied.size,
        mime: 'application/pdf',
        path: copied.path
      };
      changed = true;
    }
  }

  for (const entry of profile.entries || []) {
    if (entry.file?.path && sandboxFileExists(userId, entry.file.path)) continue;
    const spec = SEED_ASSET_BY_TYPE[entry.type];
    if (!spec) continue;
    const copied = copySeedAsset(userId, spec.asset, spec.dest);
    if (copied) {
      entry.file = {
        name: entry.file?.name || spec.name,
        size: copied.size,
        mime: entry.file?.mime || spec.mime,
        path: copied.path
      };
      changed = true;
    }
  }
  return changed;
}

export function loadUserBio(userId) {
  const filePath = bioFilePath(userId);
  let doc = null;
  if (fs.existsSync(filePath)) {
    try {
      doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      doc = null;
    }
  }
  if (!doc || !Array.isArray(doc.profiles)) {
    doc = {
      userId: sanitizeUserId(userId),
      profiles: [seedProfile()],
      proposals: [],
      answers: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }
  if (!Array.isArray(doc.proposals)) doc.proposals = [];
  if (!Array.isArray(doc.answers)) doc.answers = [];

  const DEFAULT_CONTACT_AND_ABOUT = {
    firstName: 'Alex',
    lastName: 'Morgan',
    dob: '1998-10-28',
    address: '500 Howard St',
    suiteApt: 'Suite 400',
    city: 'San Francisco',
    state: 'California',
    zipCode: '94105',
    country: 'United States',
    email: 'alex.morgan@example.com',
    phone: '+1 (555) 010-2026',
    gender: 'Female',
    ethnicAppearance: 'White',
    unionStatus: 'Non-Union',
    languages: 'English',
    dialects: 'General American, Standard British'
  };

  let repaired = false;
  for (const profile of doc.profiles) {
    if (!profile.fields) profile.fields = emptyFields();
    for (const [key, val] of Object.entries(DEFAULT_CONTACT_AND_ABOUT)) {
      if (profile.fields[key] === undefined || profile.fields[key] === null || profile.fields[key] === '') {
        profile.fields[key] = val;
        repaired = true;
      }
    }
    if (materializeProfileFiles(userId, profile)) repaired = true;
  }
  if (repaired || !fs.existsSync(filePath)) {
    atomicWriteJson(filePath, doc);
  }
  return doc;
}

export function saveUserBio(userId, doc) {
  doc.updatedAt = Date.now();
  atomicWriteJson(bioFilePath(userId), doc);
  return doc;
}

export function getActiveProfile(userId) {
  if (!sanitizeUserId(userId || '')) return null;
  const doc = loadUserBio(userId);
  return doc.profiles.find((p) => p.isActive) || doc.profiles[0] || null;
}

export function getProfile(userId, profileId) {
  const doc = loadUserBio(userId);
  return doc.profiles.find((p) => p.id === profileId) || null;
}

export function createProfile(userId, name) {
  const doc = loadUserBio(userId);
  const profile = {
    id: `profile-${crypto.randomUUID().slice(0, 8)}`,
    name: String(name || `Profile ${doc.profiles.length + 1}`).slice(0, 80),
    isActive: doc.profiles.length === 0,
    grants: { read: false, write: false },
    fields: emptyFields(),
    entries: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  doc.profiles.push(profile);
  saveUserBio(userId, doc);
  return profile;
}

export function setActiveProfile(userId, profileId) {
  const doc = loadUserBio(userId);
  let found = null;
  for (const p of doc.profiles) {
    p.isActive = p.id === profileId;
    if (p.isActive) found = p;
  }
  if (!found) throw new Error('Profile not found');
  saveUserBio(userId, doc);
  return found;
}

export function updateProfile(userId, profileId, patch = {}) {
  const doc = loadUserBio(userId);
  const profile = doc.profiles.find((p) => p.id === profileId);
  if (!profile) throw new Error('Profile not found');
  if (typeof patch.name === 'string' && patch.name.trim()) {
    profile.name = patch.name.trim().slice(0, 80);
  }
  if (patch.grants && typeof patch.grants === 'object') {
    profile.grants = {
      read: !!patch.grants.read,
      write: !!patch.grants.write
    };
  }
  profile.updatedAt = Date.now();
  saveUserBio(userId, doc);
  return profile;
}

export function deleteProfile(userId, profileId) {
  const doc = loadUserBio(userId);
  if (doc.profiles.length <= 1) throw new Error('Cannot delete the last profile');
  const idx = doc.profiles.findIndex((p) => p.id === profileId);
  if (idx === -1) throw new Error('Profile not found');
  const wasActive = doc.profiles[idx].isActive;
  doc.profiles.splice(idx, 1);
  if (wasActive && doc.profiles[0]) doc.profiles[0].isActive = true;
  saveUserBio(userId, doc);
  return doc.profiles;
}

export function setField(userId, profileId, fieldId, value) {
  if (!BIO_FIELD_MAP[fieldId]) throw new Error(`Unknown BIO field: ${fieldId}`);
  const doc = loadUserBio(userId);
  const profile = doc.profiles.find((p) => p.id === profileId);
  if (!profile) throw new Error('Profile not found');
  profile.fields[fieldId] = value;
  profile.updatedAt = Date.now();
  saveUserBio(userId, doc);
  return profile;
}

export function addEntry(userId, profileId, { name, type, description, file = null, textContent = '' }) {
  if (!BIO_ENTRY_TYPES.includes(type)) throw new Error(`Unsupported entry type: ${type}`);
  if (!String(name || '').trim()) throw new Error('Entry name is required');
  if (!String(description || '').trim()) throw new Error('Entry description is required');
  const doc = loadUserBio(userId);
  const profile = doc.profiles.find((p) => p.id === profileId);
  if (!profile) throw new Error('Profile not found');
  const entry = {
    id: `entry-${crypto.randomUUID().slice(0, 8)}`,
    name: String(name).trim().slice(0, 120),
    type,
    agentReadable: false,
    description: String(description).trim().slice(0, 1000),
    file,
    textContent: String(textContent || '').slice(0, 20000),
    createdAt: Date.now()
  };
  profile.entries.push(entry);
  profile.updatedAt = Date.now();
  saveUserBio(userId, doc);
  return entry;
}

export function updateEntry(userId, profileId, entryId, patch = {}) {
  const doc = loadUserBio(userId);
  const profile = doc.profiles.find((p) => p.id === profileId);
  if (!profile) throw new Error('Profile not found');
  const entry = profile.entries.find((e) => e.id === entryId);
  if (!entry) throw new Error('Entry not found');
  if (typeof patch.name === 'string' && patch.name.trim()) entry.name = patch.name.trim().slice(0, 120);
  if (typeof patch.description === 'string' && patch.description.trim()) {
    entry.description = patch.description.trim().slice(0, 1000);
  }
  if (typeof patch.agentReadable === 'boolean') {
    entry.agentReadable = patch.agentReadable;
  }
  if (typeof patch.textContent === 'string') {
    entry.textContent = patch.textContent.slice(0, 20000);
  }
  profile.updatedAt = Date.now();
  saveUserBio(userId, doc);
  return entry;
}

export function deleteEntry(userId, profileId, entryId) {
  const doc = loadUserBio(userId);
  const profile = doc.profiles.find((p) => p.id === profileId);
  if (!profile) throw new Error('Profile not found');
  const before = profile.entries.length;
  profile.entries = profile.entries.filter((e) => e.id !== entryId);
  if (profile.entries.length === before) throw new Error('Entry not found');
  profile.updatedAt = Date.now();
  saveUserBio(userId, doc);
  return profile.entries;
}

/** Stored user answers (from ask_user) — the ONLY source BIO writes may use. */
export function recordBioAnswer(userId, threadId, { question, answer }) {
  const doc = loadUserBio(userId);
  const record = {
    id: `answer-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
    threadId: String(threadId || ''),
    question: String(question || ''),
    answer: String(answer ?? ''),
    createdAt: Date.now()
  };
  doc.answers.push(record);
  if (doc.answers.length > 100) doc.answers = doc.answers.slice(-100);
  saveUserBio(userId, doc);
  return record;
}

export function getBioAnswer(userId, threadId, answerId) {
  if (!userId || !answerId) return null;
  const doc = loadUserBio(userId);
  return (
    doc.answers.find((a) => a.id === answerId && a.threadId === String(threadId || '')) || null
  );
}

export function createBioProposal(userId, { threadId, profileId, fieldId, value }) {
  const doc = loadUserBio(userId);
  const proposal = {
    id: `proposal-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
    threadId: String(threadId || ''),
    profileId,
    fieldId,
    value,
    status: 'pending',
    createdAt: Date.now()
  };
  doc.proposals.push(proposal);
  saveUserBio(userId, doc);
  return proposal;
}

export function applyBioProposal(userId, threadId) {
  const doc = loadUserBio(userId);
  const proposal = [...doc.proposals]
    .reverse()
    .find((p) => p.threadId === String(threadId || '') && p.status === 'pending');
  if (!proposal) return null;
  const profile = doc.profiles.find((p) => p.id === proposal.profileId);
  if (!profile) {
    proposal.status = 'discarded';
    saveUserBio(userId, doc);
    return null;
  }
  profile.fields[proposal.fieldId] = proposal.value;
  profile.updatedAt = Date.now();
  proposal.status = 'applied';
  proposal.appliedAt = Date.now();
  saveUserBio(userId, doc);
  return proposal;
}

export function discardBioProposal(userId, threadId) {
  const doc = loadUserBio(userId);
  const proposal = [...doc.proposals]
    .reverse()
    .find((p) => p.threadId === String(threadId || '') && p.status === 'pending');
  if (!proposal) return null;
  proposal.status = 'discarded';
  saveUserBio(userId, doc);
  return proposal;
}
