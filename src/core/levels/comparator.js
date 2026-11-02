/**
 * comparator.js
 *
 * Level 2C: Deterministic Code Comparator between Level 2A (Extractor) and Level 2B (Reader).
 *
 * Rules:
 * - Compares the two schemas field by field (normalizedLabel, type, required, options).
 * - A field is VERIFIED only when both layers agree.
 * - A field seen by only one layer, or described differently, is DISPUTED.
 * - The Reader (2B) can NEVER add a field to the Extractor's (2A) schema and can NEVER override it.
 * - Only VERIFIED fields are forwarded to the Level 3 Planner.
 * - DISPUTED fields are left empty, get a neutral note in the run log, and if a disputed field
 *   is required, it is included in the single batched question to the user as a field that could
 *   not be verified.
 */

import { normalizeLabelForComparison } from './extractor.js';

function normalizeOptionsArray(options = []) {
  if (!Array.isArray(options)) return [];
  return options
    .map((o) => String(o || '').trim().toLowerCase())
    .filter(Boolean);
}

function optionsMatch(optsA = [], optsB = []) {
  const normA = normalizeOptionsArray(optsA);
  const normB = normalizeOptionsArray(optsB);
  if (normA.length !== normB.length) return false;
  for (let i = 0; i < normA.length; i++) {
    if (normA[i] !== normB[i]) return false;
  }
  return true;
}

/**
 * Compare Level 2A Extractor schema and Level 2B Reader schema.
 */
export function compareExtractorAndReaderSchemas(extractorSchema, readerSchema) {
  const extFields = Array.isArray(extractorSchema?.fields) ? extractorSchema.fields : [];
  const rdrFields = Array.isArray(readerSchema?.fields) ? readerSchema.fields : [];

  const verifiedFields = [];
  const disputedFields = [];
  const disputedLog = [];
  const requiredDisputedForUser = [];

  // Index Reader fields by normalizedLabel (queue in case of duplicate labels in different sections)
  const readerMap = new Map();
  for (const rf of rdrFields) {
    const key = rf.normalizedLabel || normalizeLabelForComparison(rf.label);
    if (!key) continue;
    if (!readerMap.has(key)) readerMap.set(key, []);
    readerMap.get(key).push({ ...rf, _matched: false });
  }

  for (const ef of extFields) {
    const normKey = ef.normalizedLabel || normalizeLabelForComparison(ef.label);
    const candidates = readerMap.get(normKey) || [];
    const candidate = candidates.find((c) => !c._matched);

    if (!candidate) {
      const reason = 'Seen only by Level 2A Extractor; missing from Level 2B Reader.';
      const disputed = {
        ...ef,
        verificationStatus: 'DISPUTED',
        disputeReason: reason
      };
      disputedFields.push(disputed);
      disputedLog.push({
        fieldKey: ef.fieldKey,
        label: ef.label,
        status: 'DISPUTED',
        reason,
        required: Boolean(ef.required)
      });
      if (ef.required) {
        requiredDisputedForUser.push({
          fieldKey: ef.fieldKey,
          label: ef.label,
          reason: 'Field could not be verified across both independent page verification layers.'
        });
      }
      continue;
    }

    candidate._matched = true;

    const disagreements = [];
    if (String(ef.type).toLowerCase() !== String(candidate.type).toLowerCase()) {
      disagreements.push(`type mismatch (extractor="${ef.type}", reader="${candidate.type}")`);
    }
    if (Boolean(ef.required) !== Boolean(candidate.required)) {
      disagreements.push(`required flag mismatch (extractor=${Boolean(ef.required)}, reader=${Boolean(candidate.required)})`);
    }
    if (!optionsMatch(ef.options, candidate.options)) {
      disagreements.push('options list mismatch between extractor and reader');
    }

    if (disagreements.length > 0) {
      const reason = `Layers disagreed: ${disagreements.join('; ')}`;
      const disputed = {
        ...ef,
        verificationStatus: 'DISPUTED',
        disputeReason: reason
      };
      disputedFields.push(disputed);
      disputedLog.push({
        fieldKey: ef.fieldKey,
        label: ef.label,
        status: 'DISPUTED',
        reason,
        required: Boolean(ef.required)
      });
      if (ef.required || candidate.required) {
        requiredDisputedForUser.push({
          fieldKey: ef.fieldKey,
          label: ef.label,
          reason: `Field could not be verified (${disagreements.join(', ')}).`
        });
      }
      continue;
    }

    // Both layers agree — mark VERIFIED using the Extractor's canonical structural metadata
    verifiedFields.push({
      ...ef,
      verificationStatus: 'VERIFIED'
    });
  }

  // Any field present ONLY in Reader (2B) is NEVER added to the schema; it is marked DISPUTED and dropped
  for (const list of readerMap.values()) {
    for (const unmatchedReaderField of list) {
      if (unmatchedReaderField._matched) continue;
      const reason = 'Seen only by Level 2B Reader (not in DOM Extractor); Reader cannot add fields.';
      const disputed = {
        fieldKey: `reader_only_${normalizeLabelForComparison(unmatchedReaderField.label).replace(/\s+/g, '_')}`,
        label: unmatchedReaderField.label,
        normalizedLabel: normalizeLabelForComparison(unmatchedReaderField.label),
        type: unmatchedReaderField.type || 'text',
        required: Boolean(unmatchedReaderField.required),
        options: unmatchedReaderField.options || [],
        section: unmatchedReaderField.section || 'General',
        verificationStatus: 'DISPUTED',
        disputeReason: reason
      };
      disputedFields.push(disputed);
      disputedLog.push({
        fieldKey: disputed.fieldKey,
        label: disputed.label,
        status: 'DISPUTED',
        reason,
        required: Boolean(unmatchedReaderField.required)
      });
      if (unmatchedReaderField.required) {
        requiredDisputedForUser.push({
          fieldKey: disputed.fieldKey,
          label: disputed.label,
          reason: 'Field reported only by text reader and could not be verified in DOM.'
        });
      }
    }
  }

  return {
    verifiedFields,
    disputedFields,
    disputedLog,
    requiredDisputedForUser,
    summary: {
      totalExtractorFields: extFields.length,
      totalReaderFields: rdrFields.length,
      verifiedCount: verifiedFields.length,
      disputedCount: disputedFields.length
    }
  };
}
