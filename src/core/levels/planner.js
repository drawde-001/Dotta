/**
 * planner.js
 *
 * Level 3: Isolated Form Fill Planner.
 *
 * Security & Permission Rules:
 * - Has ONLY the BIO read tools for the active profile (when bioAccess.read === true).
 * - ZERO browser tools, ZERO network, ZERO shell, ZERO send/write tools.
 * - NEVER sees raw page text — only the VERIFIED, sanitized schema passed inside
 *   <verified_untrusted_form_schema>.
 * - Every READY value in the Fill Plan MUST cite a valid bioSource { profileId, fieldId }
 *   from the active profile (or explicit user attachment / stored answer).
 * - Never calls process_audio or process_video on ungranted entries (agentReadable !== true).
 */

import { getLevelToolRegistry, executeLevelTool } from './registries.js';
import { sanitizeVerifiedSchemaForPlanner } from './sanitizer.js';
import { validateFillPlan } from './schema.js';
import { writeTemporaryFillPlan, buildMaskedPlanAuditSummary } from './plan-file.js';
import { getActiveProfile } from '../bio/store.js';
import { executeBioIndex, executeBioGet } from '../bio/executors.js';
import { processDocument, processImage, processAudio, processVideo } from '../bio/process.js';

function isHighRiskOpenQuestion(label = '') {
  return /\b(salary|compensation|pay|remuneration|visa|sponsorship|work\s+authorization|legally\s+authorized|felony|background\s+check|ssn|social\s+security)\b/i.test(
    String(label || '')
  );
}

function resolveStandardFieldFromBio(classifiedKind, field, profile, uploadsMap = {}, attachmentOverrides = {}) {
  const f = profile?.fields || {};
  const pid = profile?.id || '';

  // Check if user attached an explicit task file overriding a file field
  if (field.type === 'file' && attachmentOverrides[classifiedKind]) {
    const att = attachmentOverrides[classifiedKind];
    return {
      value: att.uploadRef || att.name,
      bioSource: { profileId: pid, fieldId: `user_attachment:${classifiedKind}` },
      confidence: 1.0,
      overrideNote: `Using the file you attached for this task (${att.name}) instead of your default BIO ${classifiedKind.toUpperCase()}.`
    };
  }

  switch (classifiedKind) {
    case 'fullName':
      if (f.fullName) return { value: String(f.fullName), bioSource: { profileId: pid, fieldId: 'fullName' }, confidence: 1.0 };
      break;
    case 'firstName':
      if (f.firstName) return { value: String(f.firstName), bioSource: { profileId: pid, fieldId: 'firstName' }, confidence: 1.0 };
      if (f.fullName) {
        const first = String(f.fullName).trim().split(/\s+/)[0] || '';
        if (first) return { value: first, bioSource: { profileId: pid, fieldId: 'fullName' }, confidence: 0.98 };
      }
      break;
    case 'lastName':
      if (f.lastName) return { value: String(f.lastName), bioSource: { profileId: pid, fieldId: 'lastName' }, confidence: 1.0 };
      if (f.fullName) {
        const parts = String(f.fullName).trim().split(/\s+/);
        const last = parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || '';
        if (last) return { value: last, bioSource: { profileId: pid, fieldId: 'fullName' }, confidence: 0.98 };
      }
      break;
    case 'email':
      if (f.email) return { value: String(f.email), bioSource: { profileId: pid, fieldId: 'email' }, confidence: 1.0 };
      break;
    case 'phone':
      if (f.phone) return { value: String(f.phone), bioSource: { profileId: pid, fieldId: 'phone' }, confidence: 1.0 };
      break;
    case 'dateOfBirth':
      if (f.dob) return { value: String(f.dob), bioSource: { profileId: pid, fieldId: 'dob' }, confidence: 1.0 };
      if (f.dateOfBirth) return { value: String(f.dateOfBirth), bioSource: { profileId: pid, fieldId: 'dob' }, confidence: 1.0 };
      break;
    case 'street':
      if (typeof f.address === 'string' && f.address.trim()) {
        return { value: f.address.trim(), bioSource: { profileId: pid, fieldId: 'address' }, confidence: 1.0 };
      }
      if (f.address?.street) return { value: String(f.address.street), bioSource: { profileId: pid, fieldId: 'address' }, confidence: 1.0 };
      break;
    case 'city':
      if (f.city) return { value: String(f.city), bioSource: { profileId: pid, fieldId: 'city' }, confidence: 1.0 };
      if (f.address?.city) return { value: String(f.address.city), bioSource: { profileId: pid, fieldId: 'address' }, confidence: 1.0 };
      break;
    case 'region':
      if (f.state) return { value: String(f.state), bioSource: { profileId: pid, fieldId: 'state' }, confidence: 1.0 };
      if (f.address?.region) return { value: String(f.address.region), bioSource: { profileId: pid, fieldId: 'address' }, confidence: 1.0 };
      break;
    case 'postalCode':
      if (f.zipCode) return { value: String(f.zipCode), bioSource: { profileId: pid, fieldId: 'zipCode' }, confidence: 1.0 };
      if (f.address?.postalCode) return { value: String(f.address.postalCode), bioSource: { profileId: pid, fieldId: 'address' }, confidence: 1.0 };
      break;
    case 'country':
      if (f.country) return { value: String(f.country), bioSource: { profileId: pid, fieldId: 'country' }, confidence: 1.0 };
      if (f.address?.country) return { value: String(f.address.country), bioSource: { profileId: pid, fieldId: 'address' }, confidence: 1.0 };
      break;
    case 'address':
      if (typeof f.address === 'string' && f.address.trim()) {
        const fullAddr = [f.address, f.city, f.state, f.zipCode, f.country].filter(Boolean).join(', ');
        return { value: fullAddr, bioSource: { profileId: pid, fieldId: 'address' }, confidence: 0.98 };
      }
      if (f.address && typeof f.address === 'object') {
        const formatted = [f.address.street, f.address.city, f.address.region, f.address.postalCode, f.address.country]
          .filter(Boolean)
          .join(', ');
        if (formatted) return { value: formatted, bioSource: { profileId: pid, fieldId: 'address' }, confidence: 0.98 };
      }
      break;
    case 'role':
      if (f.role) return { value: String(f.role), bioSource: { profileId: pid, fieldId: 'role' }, confidence: 1.0 };
      break;
    case 'headline':
      if (f.headline) return { value: String(f.headline), bioSource: { profileId: pid, fieldId: 'headline' }, confidence: 1.0 };
      break;
    case 'website':
    case 'portfolio':
      if (f.website) return { value: String(f.website), bioSource: { profileId: pid, fieldId: 'website' }, confidence: 1.0 };
      break;
    case 'linkedin':
      if (f.socialLinks?.linkedin) return { value: String(f.socialLinks.linkedin), bioSource: { profileId: pid, fieldId: 'socialLinks' }, confidence: 1.0 };
      break;
    case 'github':
      if (f.socialLinks?.github) return { value: String(f.socialLinks.github), bioSource: { profileId: pid, fieldId: 'socialLinks' }, confidence: 1.0 };
      break;
    case 'x':
      if (f.socialLinks?.x) return { value: String(f.socialLinks.x), bioSource: { profileId: pid, fieldId: 'socialLinks' }, confidence: 1.0 };
      break;
    case 'skills':
      if (Array.isArray(f.skills) && f.skills.length > 0) {
        return { value: f.skills.join(', '), bioSource: { profileId: pid, fieldId: 'skills' }, confidence: 0.96 };
      }
      if (Array.isArray(f.interests) && f.interests.length > 0) {
        return { value: f.interests.join(', '), bioSource: { profileId: pid, fieldId: 'interests' }, confidence: 0.95 };
      }
      break;
    case 'languages':
      if (typeof f.languages === 'string' && f.languages.trim()) {
        return { value: f.languages.trim(), bioSource: { profileId: pid, fieldId: 'languages' }, confidence: 0.96 };
      }
      if (Array.isArray(f.languages) && f.languages.length > 0) {
        return { value: f.languages.join(', '), bioSource: { profileId: pid, fieldId: 'languages' }, confidence: 0.96 };
      }
      break;
    case 'education':
      if (Array.isArray(f.education) && f.education.length > 0) {
        const ed = f.education[0];
        const summary = typeof ed === 'string' ? ed : [ed.degree, ed.school, ed.year].filter(Boolean).join(' — ');
        if (summary) return { value: summary, bioSource: { profileId: pid, fieldId: 'education' }, confidence: 0.95 };
      }
      break;
    case 'workHistory':
      if (Array.isArray(f.workHistory) && f.workHistory.length > 0) {
        const wh = f.workHistory[0];
        const summary = typeof wh === 'string' ? wh : [wh.title || wh.role, wh.company, wh.period, wh.summary].filter(Boolean).join(' — ');
        if (summary) return { value: summary, bioSource: { profileId: pid, fieldId: 'workHistory' }, confidence: 0.95 };
      }
      break;
    case 'proudProject':
    case 'hobbyProjects':
      if (f.proudProject) return { value: String(f.proudProject), bioSource: { profileId: pid, fieldId: 'hobbyProjects' }, confidence: 0.95 };
      if (f.hobbyProjects) return { value: String(f.hobbyProjects), bioSource: { profileId: pid, fieldId: 'hobbyProjects' }, confidence: 0.95 };
      break;
    case 'careerGoals':
      if (f.careerGoals) return { value: String(f.careerGoals), bioSource: { profileId: pid, fieldId: 'ideas' }, confidence: 0.95 };
      if (f.ideas) return { value: String(f.ideas), bioSource: { profileId: pid, fieldId: 'ideas' }, confidence: 0.95 };
      break;
    case 'aboutYou':
    case 'bio':
      if (f.aboutYou) return { value: String(f.aboutYou), bioSource: { profileId: pid, fieldId: 'background' }, confidence: 0.95 };
      if (f.background) return { value: String(f.background), bioSource: { profileId: pid, fieldId: 'background' }, confidence: 0.95 };
      if (f.headline) return { value: String(f.headline), bioSource: { profileId: pid, fieldId: 'headline' }, confidence: 0.9 };
      break;
    case 'cv':
      if (uploadsMap.cv || f.cv?.name) {
        return {
          value: uploadsMap.cv || f.cv.name,
          bioSource: { profileId: pid, fieldId: 'cv' },
          confidence: 1.0
        };
      }
      break;
    case 'photo':
      if (uploadsMap.photo || f.photo) {
        return {
          value: uploadsMap.photo || f.photo,
          bioSource: { profileId: pid, fieldId: 'photo' },
          confidence: 1.0
        };
      }
      break;
    case 'voiceIntro': {
      const grantedAudio = (profile?.entries || []).find(
        (e) => e.type === 'audio' && e.agentReadable === true
      );
      if (grantedAudio) {
        const entryKey = `entry:${grantedAudio.id}`;
        return {
          value: uploadsMap[entryKey] || grantedAudio.file?.name || grantedAudio.name,
          bioSource: { profileId: pid, fieldId: entryKey },
          confidence: 0.95
        };
      }
      break;
    }
    case 'videoIntro': {
      const grantedVideo = (profile?.entries || []).find(
        (e) => e.type === 'video' && e.agentReadable === true
      );
      if (grantedVideo) {
        const entryKey = `entry:${grantedVideo.id}`;
        return {
          value: uploadsMap[entryKey] || grantedVideo.file?.name || grantedVideo.name,
          bioSource: { profileId: pid, fieldId: entryKey },
          confidence: 0.95
        };
      }
      break;
    }
    default:
      break;
  }

  return null;
}

function resolveOpenQuestionFromBio(field, profile, mode = 'default', storedAnswers = {}) {
  const pid = profile?.id || '';
  const f = profile?.fields || {};
  const label = String(field.label || '');
  const norm = label.toLowerCase();

  // 1. Check thread-stored user answers first
  for (const [qKey, ansObj] of Object.entries(storedAnswers || {})) {
    if (norm.includes(qKey.toLowerCase()) || qKey.toLowerCase().includes(norm)) {
      return {
        value: String(ansObj.value || ansObj),
        bioSource: { profileId: pid, fieldId: ansObj.fieldId || 'stored_user_answer' },
        confidence: 1.0
      };
    }
  }

  // 2. Match stored narrative BIO fields when semantically aligned
  const goalsText = f.careerGoals || f.ideas;
  if (/why\s+(do\s+you\s+want|this\s+role|us|join|apply)|career\s+goal/i.test(label) && goalsText) {
    return {
      value: String(goalsText),
      bioSource: { profileId: pid, fieldId: f.careerGoals ? 'careerGoals' : 'ideas' },
      confidence: 0.92
    };
  }

  const projectText = f.proudProject || f.hobbyProjects;
  if (/proud|project|achievement/i.test(label) && projectText) {
    return {
      value: String(projectText),
      bioSource: { profileId: pid, fieldId: f.proudProject ? 'proudProject' : 'hobbyProjects' },
      confidence: 0.92
    };
  }

  // 3. If high-risk commitment (salary, visa, work auth), NEVER synthesize even in Turbo mode
  if (isHighRiskOpenQuestion(label)) {
    return null;
  }

  // 4. In Turbo mode, draft a short, grounded answer strictly from BIO facts
  if (String(mode || '').toLowerCase() === 'turbo') {
    const facts = [];
    if (f.role) facts.push(`working as a ${f.role}`);
    const skillList = Array.isArray(f.skills) && f.skills.length > 0 ? f.skills : Array.isArray(f.interests) ? f.interests : [];
    if (skillList.length > 0) {
      facts.push(`experienced in ${skillList.slice(0, 5).join(', ')}`);
    }
    const aboutText = f.aboutYou || f.background;
    if (aboutText) {
      return {
        value: String(aboutText),
        bioSource: { profileId: pid, fieldId: 'background' },
        confidence: 0.85
      };
    }
    if (facts.length > 0) {
      return {
        value: `I am ${facts.join(' and ')}, excited to contribute to this role.`,
        bioSource: { profileId: pid, fieldId: f.role ? 'role' : 'interests' },
        confidence: 0.82
      };
    }
  }

  return null;
}

/**
 * Run the Level 3 Planner on VERIFIED fields only.
 */
export async function runPlannerLevel({
  runId,
  userId,
  mode = 'default',
  model = 'muse-spark-open',
  verifiedFields = [],
  requiredDisputedForUser = [],
  attachmentOverrides = {},
  storedAnswers = {}
} = {}) {
  const profile = userId ? getActiveProfile(userId) : null;
  const bioAccess = {
    userId: userId || null,
    profileId: profile?.id || null,
    read: Boolean(profile?.grants?.read),
    write: Boolean(profile?.grants?.write)
  };

  // Enforce Level 3 tool registry in code
  const plannerTools = getLevelToolRegistry('planner', { bioAccess });
  const toolCallLog = [];

  const plannerExecutor = async (toolName, toolArgs) => {
    toolCallLog.push({ level: 'planner', tool: toolName, args: toolArgs, timestamp: Date.now() });
    if (toolName === 'bio_index') return executeBioIndex({ userId });
    if (toolName === 'bio_get') {
      return await executeBioGet({
        userId,
        fieldIds: toolArgs.field_ids,
        profileId: toolArgs.profile_id,
        model
      });
    }
    if (toolName === 'process_document') return await processDocument({ userId, ref: toolArgs.bio_ref, model });
    if (toolName === 'process_image') return await processImage({ userId, ref: toolArgs.bio_ref, model });
    if (toolName === 'process_audio') return await processAudio({ userId, ref: toolArgs.bio_ref, model });
    if (toolName === 'process_video') return await processVideo({ userId, ref: toolArgs.bio_ref, model });
    throw new Error(`Unsupported planner BIO tool: ${toolName}`);
  };

  // Sanitize and classify the VERIFIED schema into the closed vocabulary
  const { sanitizedFields, scannerWarnings, quotedBlock } = sanitizeVerifiedSchemaForPlanner(verifiedFields);

  let uploadsMap = {};
  const processedMediaLog = [];

  if (bioAccess.read && profile) {
    // 1. Index active BIO profile via Level 3 tool gate
    await executeLevelTool({
      level: 'planner',
      toolName: 'bio_index',
      toolArgs: {},
      context: { bioAccess },
      executor: plannerExecutor
    });

    // 2. Determine which BIO fields & readable media files are needed by the VERIFIED fields
    const neededFieldIds = new Set();
    let needsCv = false;
    let needsPhoto = false;
    let needsVoiceIntro = false;
    let needsVideoIntro = false;

    for (const sf of sanitizedFields) {
      if (sf.classifiedKind === 'UNSUPPORTED') continue;
      if (sf.classifiedKind === 'cv') {
        needsCv = true;
        neededFieldIds.add('cv');
      } else if (sf.classifiedKind === 'photo') {
        needsPhoto = true;
        neededFieldIds.add('photo');
      } else if (sf.classifiedKind === 'voiceIntro') {
        needsVoiceIntro = true;
      } else if (sf.classifiedKind === 'videoIntro') {
        needsVideoIntro = true;
      } else if (['firstName', 'lastName', 'fullName'].includes(sf.classifiedKind)) {
        neededFieldIds.add('fullName');
      } else if (['street', 'city', 'region', 'postalCode', 'country', 'address'].includes(sf.classifiedKind)) {
        neededFieldIds.add('address');
      } else if (['linkedin', 'github', 'x'].includes(sf.classifiedKind)) {
        neededFieldIds.add('socialLinks');
      } else if (sf.classifiedKind === 'openQuestion') {
        neededFieldIds.add('careerGoals');
        neededFieldIds.add('proudProject');
        neededFieldIds.add('aboutYou');
        neededFieldIds.add('role');
        neededFieldIds.add('skills');
      } else {
        neededFieldIds.add(sf.classifiedKind);
      }
    }

    if (neededFieldIds.size > 0) {
      const getRaw = await executeLevelTool({
        level: 'planner',
        toolName: 'bio_get',
        toolArgs: { field_ids: [...neededFieldIds], profile_id: profile.id },
        context: { bioAccess },
        executor: plannerExecutor
      });
      try {
        const parsed = JSON.parse(getRaw);
        uploadsMap = parsed.uploads || {};
      } catch {}
    }

    // 3. Process ONLY required & readable media files (never call process_audio on ungranted entries!)
    if (needsCv && profile.fields?.cv?.path && !attachmentOverrides.cv) {
      const docOut = await executeLevelTool({
        level: 'planner',
        toolName: 'process_document',
        toolArgs: { bio_ref: 'cv' },
        context: { bioAccess },
        executor: plannerExecutor
      });
      processedMediaLog.push({ kind: 'document', ref: 'cv', summary: String(docOut).slice(0, 180) });
      const refMatch = String(docOut).match(/uploadRef:\s*(biofile-[a-zA-Z0-9._-]+)/);
      if (refMatch) uploadsMap.cv = refMatch[1];
    }

    if (needsPhoto && profile.fields?.photo && !attachmentOverrides.photo) {
      const imgOut = await executeLevelTool({
        level: 'planner',
        toolName: 'process_image',
        toolArgs: { bio_ref: 'photo' },
        context: { bioAccess },
        executor: plannerExecutor
      });
      processedMediaLog.push({ kind: 'image', ref: 'photo', summary: String(imgOut).slice(0, 180) });
      const refMatch = String(imgOut).match(/uploadRef:\s*(biofile-[a-zA-Z0-9._-]+)/);
      if (refMatch) uploadsMap.photo = refMatch[1];
    }

    if (needsVoiceIntro) {
      const grantedAudio = (profile.entries || []).find(
        (e) => e.type === 'audio' && e.agentReadable === true
      );
      if (grantedAudio) {
        const ref = `entry:${grantedAudio.id}`;
        const audOut = await executeLevelTool({
          level: 'planner',
          toolName: 'process_audio',
          toolArgs: { bio_ref: ref },
          context: { bioAccess },
          executor: plannerExecutor
        });
        processedMediaLog.push({ kind: 'audio', ref, summary: String(audOut).slice(0, 180) });
        const refMatch = String(audOut).match(/uploadRef:\s*(biofile-[a-zA-Z0-9._-]+)/);
        if (refMatch) uploadsMap[ref] = refMatch[1];
      }
    }

    if (needsVideoIntro) {
      const grantedVideo = (profile.entries || []).find(
        (e) => e.type === 'video' && e.agentReadable === true
      );
      if (grantedVideo) {
        const ref = `entry:${grantedVideo.id}`;
        const vidOut = await executeLevelTool({
          level: 'planner',
          toolName: 'process_video',
          toolArgs: { bio_ref: ref },
          context: { bioAccess },
          executor: plannerExecutor
        });
        processedMediaLog.push({ kind: 'video', ref, summary: String(vidOut).slice(0, 180) });
        const refMatch = String(vidOut).match(/uploadRef:\s*(biofile-[a-zA-Z0-9._-]+)/);
        if (refMatch) uploadsMap[ref] = refMatch[1];
      }
    }
  }

  // 4. Build Fill Plan items
  const items = [];
  const batchedQuestions = [];
  const attachmentOverrideNotes = [];
  const unsupportedLog = [];

  for (const sf of sanitizedFields) {
    if (sf.classifiedKind === 'UNSUPPORTED') {
      items.push({
        fieldKey: sf.fieldKey,
        selector: sf.selector,
        label: sf.label,
        type: sf.type,
        required: sf.required,
        section: sf.section,
        classifiedKind: 'UNSUPPORTED',
        status: 'UNSUPPORTED',
        value: null,
        bioSource: null,
        confidence: 0,
        note: sf.unsupportedReason || 'Field outside closed vocabulary'
      });
      unsupportedLog.push({
        fieldKey: sf.fieldKey,
        preview: sf.label.slice(0, 60),
        reason: sf.unsupportedReason || 'outside_closed_vocabulary'
      });
      continue;
    }

    let resolved = null;
    if (bioAccess.read && profile) {
      if (sf.classifiedKind === 'openQuestion') {
        resolved = resolveOpenQuestionFromBio(sf, profile, mode, storedAnswers);
      } else {
        resolved = resolveStandardFieldFromBio(
          sf.classifiedKind,
          sf,
          profile,
          uploadsMap,
          attachmentOverrides
        );
      }
    }

    // If select/radio has options, pick matching option case-insensitively
    if (resolved && sf.options && sf.options.length > 0) {
      const valLower = String(resolved.value).toLowerCase();
      const matchedOpt = sf.options.find(
        (o) => o.toLowerCase() === valLower || o.toLowerCase().includes(valLower) || valLower.includes(o.toLowerCase())
      );
      if (matchedOpt) {
        resolved.value = matchedOpt;
      }
    }

    if (resolved && resolved.value !== undefined && resolved.value !== null && String(resolved.value).trim() !== '') {
      if (resolved.overrideNote) {
        attachmentOverrideNotes.push(resolved.overrideNote);
      }
      items.push({
        fieldKey: sf.fieldKey,
        selector: sf.selector,
        label: sf.label,
        type: sf.type,
        required: sf.required,
        section: sf.section,
        classifiedKind: sf.classifiedKind,
        status: 'READY',
        value: resolved.value,
        bioSource: resolved.bioSource,
        confidence: resolved.confidence ?? 1.0
      });
    } else {
      items.push({
        fieldKey: sf.fieldKey,
        selector: sf.selector,
        label: sf.label,
        type: sf.type,
        required: sf.required,
        section: sf.section,
        classifiedKind: sf.classifiedKind,
        status: 'MISSING',
        value: null,
        bioSource: null,
        confidence: 0
      });
      if (sf.required) {
        batchedQuestions.push({
          fieldKey: sf.fieldKey,
          question: sf.label,
          options: sf.options && sf.options.length > 0 ? sf.options : ['Provide answer', 'Skip field'],
          reason: 'required_missing_from_bio'
        });
      }
    }
  }

  // Include any required DISPUTED fields from Level 2C Comparator in the single batched question
  for (const disp of requiredDisputedForUser) {
    batchedQuestions.push({
      fieldKey: disp.fieldKey,
      question: `${disp.label} (could not be verified automatically — please confirm value if needed)`,
      options: ['Provide value', 'Leave blank'],
      reason: 'required_disputed_field'
    });
  }

  const fillPlan = {
    runId: String(runId || `run-${Date.now()}`),
    profileId: profile?.id || null,
    profileName: profile?.name || null,
    mode,
    createdAt: Date.now(),
    items
  };

  const validation = validateFillPlan(fillPlan, { expectedProfileId: profile?.id || null });
  if (!validation.valid) {
    return {
      valid: false,
      dropped: true,
      errors: validation.errors
    };
  }

  const planFileRecord = writeTemporaryFillPlan(fillPlan.runId, fillPlan, {
    expectedProfileId: profile?.id || null
  });

  return {
    valid: true,
    dropped: false,
    fillPlan: validation.data,
    maskedAuditSummary: buildMaskedPlanAuditSummary(validation.data),
    planFileRecord,
    plannerToolsCount: plannerTools.length,
    toolCallLog,
    processedMediaLog,
    scannerWarnings,
    unsupportedLog,
    attachmentOverrideNotes,
    batchedQuestions,
    quotedSchemaInput: quotedBlock
  };
}
