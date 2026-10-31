import { AUDIO, GRAPHICS, type GraphicsSettings, type QualityPreset } from '../config';

/** Les quatre volumes du son (0 à 1). */
export type VolumeKey = keyof typeof AUDIO.volumes;
export type Volumes = Record<VolumeKey, number>;

/** Préréglage en cours : l'un des préréglages, ou « personnalisé » dès qu'un réglage s'en écarte. */
export type PresetChoice = QualityPreset | 'custom';

const PRESETS = Object.keys(GRAPHICS.presets) as QualityPreset[];

interface Saved {
  graphics?: Partial<GraphicsSettings>;
  showFps?: boolean;
  volumes?: Partial<Volumes>;
  muted?: boolean;
}

/**
 * Réglages du joueur (graphismes, affichage des images/s, volumes du son), gardés dans le navigateur d'une partie à l'autre.
 * Prévient ses abonnés à chaque changement.
 */
export class Settings {
  graphics: GraphicsSettings;
  preset: PresetChoice;
  showFps = false;
  /** Volumes du son, et son coupé. */
  volumes: Volumes;
  muted = false;
  private readonly listeners: (() => void)[] = [];

  constructor() {
    const saved = load();
    this.graphics = { ...GRAPHICS.presets[GRAPHICS.defaultPreset], ...validGraphics(saved.graphics) };
    this.showFps = saved.showFps ?? false;
    this.volumes = { ...AUDIO.volumes };
    for (const key of Object.keys(AUDIO.volumes) as VolumeKey[]) {
      const v = saved.volumes?.[key];
      if (typeof v === 'number' && v >= 0 && v <= 1) this.volumes[key] = v;
    }
    this.muted = saved.muted === true;
    this.preset = this.matchingPreset();
  }

  onChange(listener: () => void) {
    this.listeners.push(listener);
  }

  applyPreset(preset: QualityPreset) {
    this.graphics = { ...GRAPHICS.presets[preset] };
    this.preset = preset;
    this.changed();
  }

  set<K extends keyof GraphicsSettings>(key: K, value: GraphicsSettings[K]) {
    this.graphics[key] = value;
    this.preset = this.matchingPreset();
    this.changed();
  }

  setShowFps(show: boolean) {
    this.showFps = show;
    this.changed();
  }

  setVolume(key: VolumeKey, value: number) {
    this.volumes[key] = Math.min(1, Math.max(0, value));
    this.changed();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.changed();
  }

  /** Le préréglage identique aux réglages actuels, sinon « personnalisé ». */
  private matchingPreset(): PresetChoice {
    const g = this.graphics;
    return PRESETS.find((p) => (Object.keys(g) as (keyof GraphicsSettings)[]).every((k) => GRAPHICS.presets[p][k] === g[k])) ?? 'custom';
  }

  private changed() {
    try {
      localStorage.setItem(GRAPHICS.storageKey, JSON.stringify({ graphics: this.graphics, showFps: this.showFps, volumes: this.volumes, muted: this.muted } satisfies Saved));
    } catch {
      // Stockage indisponible (navigation privée…) : les réglages valent pour cette partie seulement.
    }
    for (const listener of this.listeners) listener();
  }
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(GRAPHICS.storageKey);
    return raw ? (JSON.parse(raw) as Saved) : {};
  } catch {
    return {};
  }
}

/** Ne garde d'une sauvegarde que les réglages connus, du bon type (une ancienne version peut en avoir d'autres). */
function validGraphics(saved: Partial<GraphicsSettings> | undefined): Partial<GraphicsSettings> {
  if (!saved || typeof saved !== 'object') return {};
  const reference = GRAPHICS.presets.high;
  const valid: Record<string, unknown> = {};
  for (const key of Object.keys(reference) as (keyof GraphicsSettings)[]) {
    if (typeof saved[key] === typeof reference[key]) valid[key] = saved[key];
  }
  return valid as Partial<GraphicsSettings>;
}
