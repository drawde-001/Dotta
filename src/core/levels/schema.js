/**
 * schema.js
 *
 * Strict JSON schemas and validators for inter-level messages in Omni's
 * multi-level architecture. Any message that fails validation is dropped
 * and logged, never forwarded to the next level.
 */

export const VALID_FIELD_TYPES = new Set([
  'text',
  'email',
  'tel',
  'url',
  'number',
  'date',
  'textarea',
  'select',
  'radio',
  'checkbox',
  'file',
  'password',
  'hidden_excluded'
]);

/**
 * Closed vocabulary of standard form field kinds that the Level 3 Planner
 * may map a VERIFIED field into. Anything outside this vocabulary is classified
 * as UNSUPPORTED and never executed as an instruction.
 */
export const CLOSED_BIO_FIELD_KINDS = Object.freeze([
  'fullName',
  'firstName',
  'lastName',
  'headline',
  'role',
  'email',
  'phone',
  'dateOfBirth',
  'gender',
  'address',
  'street',
  'city',
  'region',
  'postalCode',
  'country',
  'website',
  'linkedin',
  'github',
  'x',
  'portfolio',
  'bio',
  'aboutYou',
  'careerGoals',
  'proudProject',
  'hobbyProjects',
  'skills',
  'languages',
  'education',
  'workHistory',
  'certifications',
  'awards',
  'cv',
  'photo',
  'voiceIntro',
  'videoIntro',
  'openQuestion',
  'UNSUPPORTED'
]);

export const CLOSED_BIO_FIELD_SET = new Set(CLOSED_BIO_FIELD_KINDS);

const interLevelDropLog = [];

export function getInterLevelDropLog() {
  return [...interLevelDropLog];
}

export function clearInterLevelDropLog() {
  interLevelDropLog.length = 0;
}

function recordDrop(stage, errors, rawPayloadSummary = '') {
  const entry = {
    timestamp: Date.now(),
    stage,
    dropped: true,
    errors,
    preview: String(rawPayloadSummary || '').slice(0, 160)
  };
  interLevelDropLog.push(entry);
  return { valid: false, dropped: true, errors, logEntry: entry };
}

/**
 * Validate a FormSchema produced by Level 2A (Extractor) or Level 2B (Reader).
 */
export function validateFormSchema(payload, stage = 'form_schema') {
  let obj = payload;
  if (typeof payload === 'string') {
    try {
      obj = JSON.parse(payload);
    } catch (err) {
      return recordDrop(stage, [`Invalid JSON: ${err.message}`], payload);
    }
  }

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return recordDrop(stage, ['Root payload must be a JSON object.'], JSON.stringify(payload));
  }

  const errors = [];
  if (!Array.isArray(obj.fields)) {
    errors.push('Schema must contain a "fields" array.');
  } else {
    obj.fields.forEach((field, idx) => {
      if (!field || typeof field !== 'object' || Array.isArray(field)) {
        errors.push(`fields[${idx}] must be an object.`);
        return;
      }
      if (typeof field.label !== 'string' || !field.label.trim()) {
        errors.push(`fields[${idx}].label must be a non-empty string.`);
      }
      if (typeof field.type !== 'string' || !VALID_FIELD_TYPES.has(field.type)) {
        errors.push(`fields[${idx}].type "${field.type}" is not a valid field type.`);
      }
      if (typeof field.required !== 'boolean') {
        errors.push(`fields[${idx}].required must be a boolean.`);
      }
      if (field.options !== undefined && !Array.isArray(field.options)) {
        errors.push(`fields[${idx}].options must be an array when present.`);
      }
      if (field.section !== undefined && typeof field.section !== 'string') {
        errors.push(`fields[${idx}].section must be a string when present.`);
      }
      if (
        field.visibility !== undefined &&
        field.visibility !== 'visible' &&
        field.visibility !== 'hidden'
      ) {
        errors.push(`fields[${idx}].visibility must be "visible" or "hidden".`);
      }
    });
  }

  if (errors.length > 0) {
    return recordDrop(stage, errors, JSON.stringify(obj));
  }

  return {
    valid: true,
    dropped: false,
    data: {
      url: typeof obj.url === 'string' ? obj.url : '',
      title: typeof obj.title === 'string' ? obj.title : '',
      sections: Array.isArray(obj.sections) ? obj.sections : [],
      fields: obj.fields.map((f, idx) => ({
        fieldKey: String(f.fieldKey || f.id || `field_${idx + 1}`),
        selector: typeof f.selector === 'string' ? f.selector : '',
        label: f.label.trim(),
        normalizedLabel: typeof f.normalizedLabel === 'string' && f.normalizedLabel.trim()
          ? f.normalizedLabel.trim()
          : f.label.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(),
        type: f.type,
        required: Boolean(f.required),
        options: Array.isArray(f.options) ? f.options.map((o) => String(o)) : [],
        section: typeof f.section === 'string' && f.section.trim() ? f.section.trim() : 'General',
        visibility: f.visibility || 'visible',
        validationHints: typeof f.validationHints === 'string' ? f.validationHints : '',
        conditionalOn: typeof f.conditionalOn === 'string' ? f.conditionalOn : ''
      })),
      submitButtons: Array.isArray(obj.submitButtons) ? obj.submitButtons : [],
      interactiveElements: Array.isArray(obj.interactiveElements) ? obj.interactiveElements : []
    }
  };
}

/**
 * Validate the Level 3 Planner's internal Fill Plan JSON.
 * Every READY entry MUST have a non-empty value and a valid bioSource { profileId, fieldId }.
 */
export function validateFillPlan(payload, { expectedProfileId = null } = {}) {
  let obj = payload;
  if (typeof payload === 'string') {
    try {
      obj = JSON.parse(payload);
    } catch (err) {
      return recordDrop('fill_plan', [`Invalid JSON: ${err.message}`], payload);
    }
  }

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return recordDrop('fill_plan', ['Fill plan root must be a JSON object.'], JSON.stringify(payload));
  }

  const errors = [];
  if (typeof obj.runId !== 'string' || !obj.runId.trim()) {
    errors.push('Fill plan must include a non-empty string "runId".');
  }
  if (!Array.isArray(obj.items)) {
    errors.push('Fill plan must include an "items" array.');
  } else {
    obj.items.forEach((item, idx) => {
      if (!item || typeof item !== 'object') {
        errors.push(`items[${idx}] must be an object.`);
        return;
      }
      if (typeof item.fieldKey !== 'string' || !item.fieldKey.trim()) {
        errors.push(`items[${idx}].fieldKey must be a non-empty string.`);
      }
      if (typeof item.label !== 'string' || !item.label.trim()) {
        errors.push(`items[${idx}].label must be a non-empty string.`);
      }
      if (!CLOSED_BIO_FIELD_SET.has(item.classifiedKind)) {
        errors.push(
          `items[${idx}].classifiedKind "${item.classifiedKind}" is outside the closed vocabulary.`
        );
      }
      if (!['READY', 'MISSING', 'UNSUPPORTED', 'DISPUTED'].includes(item.status)) {
        errors.push(`items[${idx}].status "${item.status}" must be READY, MISSING, UNSUPPORTED, or DISPUTED.`);
      }
      if (item.status === 'READY') {
        if (item.value === undefined || item.value === null || String(item.value).trim() === '') {
          errors.push(`items[${idx}] has status READY but value is empty.`);
        }
        if (
          !item.bioSource ||
          typeof item.bioSource !== 'object' ||
          typeof item.bioSource.profileId !== 'string' ||
          !item.bioSource.profileId.trim() ||
          typeof item.bioSource.fieldId !== 'string' ||
          !item.bioSource.fieldId.trim()
        ) {
          errors.push(
            `items[${idx}] has status READY for "${item.label}" without a valid bioSource { profileId, fieldId }.`
          );
        } else if (expectedProfileId && item.bioSource.profileId !== expectedProfileId) {
          errors.push(
            `items[${idx}] cites bioSource.profileId "${item.bioSource.profileId}" which does not match active profile "${expectedProfileId}".`
          );
        }
      }
    });
  }

  if (errors.length > 0) {
    return recordDrop('fill_plan', errors, JSON.stringify({ runId: obj?.runId, itemCount: obj?.items?.length }));
  }

  return {
    valid: true,
    dropped: false,
    data: obj
  };
}

/**
 * Validate Level 4 Reviewer response JSON ({ decision: 'allow' | 'deny', reason: string }).
 */
export function validateReviewerDecision(payload) {
  let obj = payload;
  if (typeof payload === 'string') {
    try {
      obj = JSON.parse(payload);
    } catch (err) {
      return recordDrop('reviewer_decision', [`Invalid JSON: ${err.message}`], payload);
    }
  }

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return recordDrop('reviewer_decision', ['Reviewer output must be a JSON object.'], JSON.stringify(payload));
  }

  const decision = String(obj.decision || '').trim().toLowerCase();
  if (decision !== 'allow' && decision !== 'deny') {
    return recordDrop(
      'reviewer_decision',
      [`Reviewer decision "${obj.decision}" must be "allow" or "deny".`],
      JSON.stringify(obj)
    );
  }
  if (typeof obj.reason !== 'string' || !obj.reason.trim()) {
    return recordDrop('reviewer_decision', ['Reviewer reason must be a non-empty string.'], JSON.stringify(obj));
  }

  const requiresUserConfirmation =
    typeof obj.requiresUserConfirmation === 'boolean'
      ? obj.requiresUserConfirmation
      : typeof obj.userAuthorizedSubmit === 'boolean'
        ? !obj.userAuthorizedSubmit
        : undefined;

  return {
    valid: true,
    dropped: false,
    data: {
      decision,
      reason: obj.reason.trim().slice(0, 400),
      ...(typeof requiresUserConfirmation === 'boolean' ? { requiresUserConfirmation } : {})
    }
  };
}
