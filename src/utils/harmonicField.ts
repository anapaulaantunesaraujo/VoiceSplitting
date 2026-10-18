/**
 * Utility for Musical Keys, Harmonic Fields (Campo Harmônico), and Chords
 */

export interface HarmonicChord {
  degree: string;       // e.g. "I", "ii", "iii", "IV", "V", "vi", "vii°"
  chord: string;        // e.g. "C", "Dm", "Em", "F", "G", "Am", "B°"
  fullName: string;     // e.g. "Dó Maior", "Ré Menor"
  notes: string[];      // e.g. ["C", "E", "G"]
}

export interface KeyHarmonicField {
  keyName: string;      // e.g. "C" or "Am"
  tonicNamePt: string;  // e.g. "Dó"
  mode: 'Major' | 'Minor';
  displayKey: string;   // e.g. "Dó Maior (C)" or "Lá Menor (Am)"
  chords: HarmonicChord[];
}

const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const NOTE_NAMES_PT: Record<string, string> = {
  'C': 'Dó', 'C#': 'Dó#', 'D': 'Ré', 'D#': 'Ré#', 'E': 'Mi', 'F': 'Fá',
  'F#': 'Fá#', 'G': 'Sol', 'G#': 'Sol#', 'A': 'Lá', 'A#': 'Lá#', 'B': 'Si'
};

// Major Triad intervals: I, ii, iii, IV, V, vi, vii°
const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const MAJOR_CHORD_TYPES = ['', 'm', 'm', '', '', 'm', '°'];
const MAJOR_DEGREES = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];

// Minor Triad intervals (Natural minor): i, ii°, III, iv, v (or V), VI, VII
const MINOR_SCALE_INTERVALS = [0, 2, 3, 5, 7, 8, 10];
const MINOR_CHORD_TYPES = ['m', '°', '', 'm', 'm', '', ''];
const MINOR_DEGREES = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];

export function getHarmonicField(rootNote: string, mode: 'Major' | 'Minor' = 'Major'): KeyHarmonicField {
  // Normalize rootNote (e.g. if passed "Gm", extract "G")
  let cleanRoot = rootNote.trim();
  let cleanMode = mode;

  if (cleanRoot.endsWith('m') && cleanRoot.length > 1 && !cleanRoot.endsWith('dim')) {
    cleanRoot = cleanRoot.replace(/m$/, '');
    cleanMode = 'Minor';
  } else if (cleanRoot.includes('Menor')) {
    cleanMode = 'Minor';
    const match = cleanRoot.match(/\(([A-G][#b]?)m?\)/);
    if (match) cleanRoot = match[1];
  } else if (cleanRoot.includes('Maior')) {
    cleanMode = 'Major';
    const match = cleanRoot.match(/\(([A-G][#b]?)\)/);
    if (match) cleanRoot = match[1];
  }

  // Handle flat to sharp normalization
  const flatMap: Record<string, string> = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };
  if (flatMap[cleanRoot]) cleanRoot = flatMap[cleanRoot];

  let rootIdx = PITCH_CLASSES.indexOf(cleanRoot);
  if (rootIdx === -1) rootIdx = 0; // fallback to C
  const actualRoot = PITCH_CLASSES[rootIdx];

  const intervals = cleanMode === 'Major' ? MAJOR_SCALE_INTERVALS : MINOR_SCALE_INTERVALS;
  const chordTypes = cleanMode === 'Major' ? MAJOR_CHORD_TYPES : MINOR_CHORD_TYPES;
  const degrees = cleanMode === 'Major' ? MAJOR_DEGREES : MINOR_DEGREES;

  const chords: HarmonicChord[] = intervals.map((iv, idx) => {
    const note = PITCH_CLASSES[(rootIdx + iv) % 12];
    const type = chordTypes[idx];
    const ptNote = NOTE_NAMES_PT[note] || note;
    const typeName = type === 'm' ? 'Menor' : (type === '°' ? 'Diminuto' : 'Maior');

    // Triad notes
    const thirdIv = (iv + (type === 'm' || type === '°' ? 3 : 4)) % 12;
    const fifthIv = (iv + (type === '°' ? 6 : 7)) % 12;
    const thirdNote = PITCH_CLASSES[(rootIdx + thirdIv) % 12];
    const fifthNote = PITCH_CLASSES[(rootIdx + fifthIv) % 12];

    return {
      degree: degrees[idx],
      chord: `${note}${type}`,
      fullName: `${ptNote} ${typeName}`,
      notes: [note, thirdNote, fifthNote]
    };
  });

  const ptRoot = NOTE_NAMES_PT[actualRoot] || actualRoot;
  const modePt = cleanMode === 'Major' ? 'Maior' : 'Menor';

  return {
    keyName: `${actualRoot}${cleanMode === 'Minor' ? 'm' : ''}`,
    tonicNamePt: ptRoot,
    mode: cleanMode,
    displayKey: `${ptRoot} ${modePt} (${actualRoot}${cleanMode === 'Minor' ? 'm' : ''})`,
    chords
  };
}

/**
 * Transpose a root note by semitones
 */
export function transposeKey(currentKey: string, semitones: number): string {
  let root = currentKey.replace(/m$/, '').replace(/[^A-G#b]/g, '');
  const isMinor = currentKey.includes('m') || currentKey.includes('Menor');

  const flatMap: Record<string, string> = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };
  if (flatMap[root]) root = flatMap[root];

  let idx = PITCH_CLASSES.indexOf(root);
  if (idx === -1) idx = 0;

  const newIdx = (idx + semitones + 120) % 12;
  const newNote = PITCH_CLASSES[newIdx];
  return `${newNote}${isMinor ? 'm' : ''}`;
}

/**
 * Formata qualquer chave musical bruta (ex: "Bm", "C", "F#m", "Si Menor (Bm)")
 * para a nomenclatura oficial amigável em Português com cifra (ex: "Si Menor (Bm)").
 */
export function formatMusicalKey(rawKey?: string): string {
  if (!rawKey || rawKey === '—' || !rawKey.trim()) return '—';
  const trimmed = rawKey.trim();
  // Se já estiver no padrão completo com parênteses, ex: "Si Menor (Bm)"
  if (trimmed.includes('(') && trimmed.includes(')')) return trimmed;

  let cleanRoot = trimmed;
  const isMinor = trimmed.endsWith('m') || trimmed.toLowerCase().includes('menor');
  if (cleanRoot.endsWith('m') && cleanRoot.length > 1 && !cleanRoot.endsWith('dim')) {
    cleanRoot = cleanRoot.replace(/m$/, '');
  }
  const flatMap: Record<string, string> = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };
  if (flatMap[cleanRoot]) cleanRoot = flatMap[cleanRoot];

  const rootIdx = PITCH_CLASSES.indexOf(cleanRoot);
  if (rootIdx === -1) return trimmed;

  const actualRoot = PITCH_CLASSES[rootIdx];
  const ptRoot = NOTE_NAMES_PT[actualRoot] || actualRoot;
  const modePt = isMinor ? 'Menor' : 'Maior';
  return `${ptRoot} ${modePt} (${actualRoot}${isMinor ? 'm' : ''})`;
}

