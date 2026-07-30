/**
 * Built-in avatar presets — short IDs stored in avatar_url (not image blobs).
 */

export type AvatarPreset = {
  id: string;
  label: string;
  /** Tailwind-ish background for the circle */
  bg: string;
  /** Text / emoji glyph */
  glyph: string;
};

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: 'radareum', label: 'Radareum', bg: '#0052ff', glyph: 'R' },
  { id: 'aurora', label: 'Aurora', bg: '#7c3aed', glyph: 'A' },
  { id: 'orbit', label: 'Orbit', bg: '#0ea5e9', glyph: 'O' },
  { id: 'nova', label: 'Nova', bg: '#f7931a', glyph: 'N' },
  { id: 'ember', label: 'Ember', bg: '#ef4444', glyph: 'E' },
  { id: 'mint', label: 'Mint', bg: '#0ecb81', glyph: 'M' },
  { id: 'slate', label: 'Slate', bg: '#64748b', glyph: 'U' },
  { id: 'gold', label: 'Gold', bg: '#eab308', glyph: 'G' },
];

const PRESET_IDS = new Set(AVATAR_PRESETS.map(p => p.id));

/** Stored value format: `preset:<id>` */
export function toPresetAvatarUrl(id: string): string {
  return `preset:${id}`;
}

export function parsePresetAvatarId(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith('preset:')) {
    let id = avatarUrl.slice('preset:'.length);
    // Legacy brand preset id
    if (id === 'sentinel') id = 'radareum';
    return PRESET_IDS.has(id) ? id : null;
  }
  // Legacy data URLs / http URLs are ignored — fall back to initials
  return null;
}

export function getAvatarPreset(avatarUrl: string | null | undefined): AvatarPreset | null {
  const id = parsePresetAvatarId(avatarUrl);
  if (!id) return null;
  return AVATAR_PRESETS.find(p => p.id === id) || null;
}

export function isAllowedAvatarValue(value: string | null | undefined): boolean {
  if (value == null || value === '') return true;
  return parsePresetAvatarId(value) !== null;
}
