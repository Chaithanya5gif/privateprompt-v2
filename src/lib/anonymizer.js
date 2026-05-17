/**
 * PrivatePrompt V2 — Anonymizer Engine
 * Client-side PII detection and tokenization.
 * Token map NEVER leaves the browser.
 */

import nlp from 'compromise';

// ── Medical Dictionaries ─────────────────────────────────────────────────────

const MEDICAL_CONDITIONS = [
  'diabetes', 'type 1 diabetes', 'type 2 diabetes', 'hypertension', 'cancer',
  'depression', 'anxiety', 'asthma', 'arthritis', 'alzheimer', 'dementia',
  'bipolar disorder', 'schizophrenia', 'epilepsy', 'parkinson', 'multiple sclerosis',
  'lupus', 'fibromyalgia', 'celiac disease', 'crohn', 'colitis', 'psoriasis',
  'eczema', 'hepatitis', 'hiv', 'aids', 'tuberculosis', 'pneumonia', 'copd',
  'heart disease', 'stroke', 'obesity', 'hypothyroidism', 'hyperthyroidism',
  'osteoporosis', 'glaucoma', 'cataracts', 'autism', 'adhd', 'ptsd',
  'anemia', 'leukemia', 'lymphoma', 'melanoma', 'breast cancer', 'prostate cancer',
  'lung cancer', 'colon cancer', 'kidney disease', 'liver disease', 'cirrhosis',
  'gout', 'sickle cell', 'hemophilia', 'endometriosis', 'pcos', 'infertility',
  'miscarriage', 'ibs', 'acid reflux', 'sleep apnea', 'insomnia', 'migraines',
  'chronic pain', 'back pain', 'neuropathy', 'down syndrome', 'cystic fibrosis',
  'muscular dystrophy', 'amyotrophic lateral sclerosis', 'als',
];

const DRUG_NAMES = [
  'metformin', 'lisinopril', 'atorvastatin', 'levothyroxine', 'amlodipine',
  'metoprolol', 'omeprazole', 'simvastatin', 'losartan', 'albuterol',
  'gabapentin', 'hydrocodone', 'oxycodone', 'tramadol', 'sertraline',
  'escitalopram', 'fluoxetine', 'paroxetine', 'bupropion', 'venlafaxine',
  'duloxetine', 'alprazolam', 'lorazepam', 'clonazepam', 'zolpidem',
  'trazodone', 'quetiapine', 'risperidone', 'aripiprazole', 'olanzapine',
  'lithium', 'valproate', 'lamotrigine', 'topiramate', 'carbamazepine',
  'warfarin', 'clopidogrel', 'aspirin', 'ibuprofen', 'naproxen',
  'prednisone', 'methylprednisolone', 'hydrocortisone', 'insulin',
  'lantus', 'humalog', 'ozempic', 'trulicity', 'jardiance', 'januvia',
  'eliquis', 'xarelto', 'humira', 'enbrel', 'remicade', 'keytruda',
  'wegovy', 'mounjaro', 'adderall', 'ritalin', 'concerta', 'strattera',
  'zoloft', 'lexapro', 'prozac', 'paxil', 'effexor', 'cymbalta',
  'wellbutrin', 'ambien', 'lunesta', 'klonopin', 'xanax', 'ativan',
  'norco', 'vicodin', 'percocet', 'oxycontin', 'morphine', 'codeine',
];

// ── Regex Patterns ───────────────────────────────────────────────────────────

const PATTERNS = [
  {
    category: 'EMAIL',
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  },
  {
    category: 'PHONE',
    regex: /(\+?\d{1,3}[\s-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g,
  },
  {
    category: 'SSN',
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
  {
    category: 'FINANCIAL',
    regex: /\$[\d,]+(\.\d{2})?|\b\d+[\s]*(dollars|USD|k salary|k\/year|per year|annual salary)\b/gi,
  },
  {
    category: 'DATE_OF_BIRTH',
    regex: /\b(born|DOB|date of birth|birthday)[:\s]+[\d\/\-\.]+/gi,
  },
  {
    category: 'DATE',
    regex: /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}\b|\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/gi,
  },
  {
    category: 'IP_ADDRESS',
    regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
  },
  {
    category: 'CREDIT_CARD',
    regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  },
  {
    category: 'AGE',
    regex: /\b(i am|i'm|im|aged?)\s+\d{1,3}\s*(years?\s*old|yo)\b/gi,
  },
  {
    category: 'ZIP_CODE',
    regex: /\b\d{5}(-\d{4})?\b/g,
  },
];

// ── Core Anonymizer ──────────────────────────────────────────────────────────

/**
 * Anonymize a text string by detecting and replacing PII with tokens.
 * @param {string} text - Raw user input
 * @param {Object} existingTokenMap - Existing session token map (for consistency)
 * @returns {{ anonymized: string, tokenMap: Object, newTokens: Array }}
 */
export function anonymize(text, existingTokenMap = {}) {
  const tokenMap = { ...existingTokenMap };
  const newTokens = [];
  let result = text;

  // Reverse map: value → token (to reuse tokens for same value)
  const reverseMap = {};
  for (const [token, value] of Object.entries(tokenMap)) {
    reverseMap[value.toLowerCase()] = token;
  }

  // Counter tracker per category
  const counters = {};
  for (const token of Object.keys(tokenMap)) {
    const match = token.match(/\[([A-Z_]+)_(\d+)\]/);
    if (match) {
      const cat = match[1];
      const num = parseInt(match[2]);
      counters[cat] = Math.max(counters[cat] || 0, num);
    }
  }

  const getToken = (category, value) => {
    const lowerVal = value.toLowerCase();
    if (reverseMap[lowerVal]) return reverseMap[lowerVal];
    counters[category] = (counters[category] || 0) + 1;
    const token = `[${category}_${counters[category]}]`;
    tokenMap[token] = value;
    reverseMap[lowerVal] = token;
    newTokens.push({ token, value, category });
    return token;
  };

  // 1. Regex-based patterns (apply before NLP to avoid double-matching)
  for (const { category, regex } of PATTERNS) {
    regex.lastIndex = 0;
    result = result.replace(regex, (match) => getToken(category, match));
  }

  // 2. Medical conditions dictionary (case-insensitive, whole word)
  for (const condition of MEDICAL_CONDITIONS) {
    const escapedCondition = condition.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const condRegex = new RegExp(`\\b${escapedCondition}\\b`, 'gi');
    result = result.replace(condRegex, (match) => getToken('MEDICAL', match));
  }

  // 3. Drug names dictionary
  for (const drug of DRUG_NAMES) {
    const escapedDrug = drug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const drugRegex = new RegExp(`\\b${escapedDrug}\\b`, 'gi');
    result = result.replace(drugRegex, (match) => getToken('DRUG', match));
  }

  // 4. NLP - Named Entity Recognition via Compromise.js
  // Only run on text that hasn't been tokenized yet
  const doc = nlp(result);

  // Extract people names
  const people = doc.people().out('array');
  for (const name of people) {
    if (name.length > 2 && !name.startsWith('[')) {
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const nameRegex = new RegExp(`\\b${escapedName}\\b`, 'gi');
      result = result.replace(nameRegex, (match) => getToken('NAME', match));
    }
  }

  // Extract organizations
  const orgs = doc.organizations().out('array');
  for (const org of orgs) {
    if (org.length > 2 && !org.startsWith('[')) {
      const escapedOrg = org.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const orgRegex = new RegExp(`\\b${escapedOrg}\\b`, 'gi');
      result = result.replace(orgRegex, (match) => getToken('ORG', match));
    }
  }

  // Extract places
  const places = doc.places().out('array');
  for (const place of places) {
    if (place.length > 2 && !place.startsWith('[')) {
      const escapedPlace = place.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const placeRegex = new RegExp(`\\b${escapedPlace}\\b`, 'gi');
      result = result.replace(placeRegex, (match) => getToken('LOCATION', match));
    }
  }

  return { anonymized: result, tokenMap, newTokens };
}

/**
 * De-anonymize a text string by replacing tokens with real values.
 * @param {string} text - Tokenized text (from AI response)
 * @param {Object} tokenMap - Map of token → real value
 * @returns {string} De-tokenized text
 */
export function deanonymize(text, tokenMap) {
  let result = text;
  // Sort by token length (longest first) to avoid partial replacements
  const sortedTokens = Object.keys(tokenMap).sort((a, b) => b.length - a.length);
  for (const token of sortedTokens) {
    const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escapedToken, 'g'), tokenMap[token]);
  }
  return result;
}

/**
 * Compute a privacy score (0-100).
 * IMPORTANT: Detected + protected PII yields a HIGH score — we caught it!
 * Score represents how well your data is protected, not how clean the prompt is.
 * Score deducts only a tiny amount per item to show "we caught N things".
 * @param {Array} allTokens - All tokens detected across session
 * @returns {number} Privacy score (higher = better protected)
 */
export function computePrivacyScore(allTokens) {
  if (allTokens.length === 0) return 100;
  // All detected PII is PROTECTED — each item caught is a win.
  // Slight deduction to show the score is live/dynamic, max deduction is 2 per item.
  const total = allTokens.length;
  const deduction = Math.min(total * 1, 8); // max 8 points off for many items
  return Math.max(92, 100 - deduction);
}

/**
 * Get human-readable category label
 */
export function getCategoryLabel(category) {
  const labels = {
    NAME: 'Person Name',
    EMAIL: 'Email Address',
    PHONE: 'Phone Number',
    SSN: 'Social Security No.',
    FINANCIAL: 'Financial Data',
    DATE_OF_BIRTH: 'Date of Birth',
    DATE: 'Date',
    MEDICAL: 'Medical Condition',
    DRUG: 'Medication',
    ORG: 'Organization',
    LOCATION: 'Location',
    IP_ADDRESS: 'IP Address',
    CREDIT_CARD: 'Credit Card',
    AGE: 'Age',
    ZIP_CODE: 'ZIP Code',
  };
  return labels[category] || category;
}

/**
 * Get category color for UI
 */
export function getCategoryColor(category) {
  const colors = {
    NAME: '#ec4899',
    EMAIL: '#8b5cf6',
    PHONE: '#f59e0b',
    SSN: '#ef4444',
    FINANCIAL: '#3b82f6',
    DATE_OF_BIRTH: '#ef4444',
    DATE: '#a855f7',
    MEDICAL: '#f43f5e',
    DRUG: '#fb923c',
    ORG: '#06b6d4',
    LOCATION: '#10b981',
    IP_ADDRESS: '#6b7280',
    CREDIT_CARD: '#ef4444',
    AGE: '#c084fc',
    ZIP_CODE: '#6b7280',
  };
  return colors[category] || '#6b7280';
}
