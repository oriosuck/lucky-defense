// localStorage 어댑터: 프리셋 저장/불러오기/삭제
// 길드원 간 공유 저장소 없음 - 각자 브라우저의 localStorage에만 저장됨(기획 확정 사항)

const STORAGE_KEY = 'guildRaidPractice.presets.v1';
const DEFAULT_KEY = 'guildRaidPractice.presets.default.v1';
export const PRESET_NAME_MAX_LENGTH = 20;

function isStorageAvailable() {
  try {
    const testKey = '__storage_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
}

function readAll() {
  if (!isStorageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function writeAll(presets) {
  if (!isStorageAvailable()) {
    return { ok: false, reason: 'unavailable' };
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'quota' };
  }
}

export function listPresets() {
  return readAll();
}

/**
 * @param {string} name
 * @param {object} data  {gameType, immortalPet, heroSettings}
 * @returns {{ok:boolean, reason?:string}}
 */
export function savePreset(name, data) {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, reason: 'empty-name' };
  if (trimmed.length > PRESET_NAME_MAX_LENGTH) return { ok: false, reason: 'name-too-long' };

  const presets = readAll();
  if (presets.some((p) => p.name === trimmed)) {
    return { ok: false, reason: 'duplicate-name' };
  }
  presets.push({ id: `preset_${Date.now()}`, name: trimmed, ...data });
  return writeAll(presets);
}

export function deletePreset(id) {
  const presets = readAll().filter((p) => p.id !== id);
  const result = writeAll(presets);
  if (result.ok && getDefaultPresetId() === id) setDefaultPreset(null); // 기본값이던 프리셋이 삭제되면 기본값 지정도 같이 해제
  return result;
}

export function loadPreset(id) {
  return readAll().find((p) => p.id === id) ?? null;
}

// 시작 화면을 열 때마다 자동으로 불러올 "기본값" 프리셋 하나를 지정할 수 있다
// (사용자 요청). id가 하나만 저장되고(여러 개 아님), 그 프리셋을 지우면 자동으로 해제된다.
export function getDefaultPresetId() {
  if (!isStorageAvailable()) return null;
  try {
    return window.localStorage.getItem(DEFAULT_KEY);
  } catch (e) {
    return null;
  }
}

export function setDefaultPreset(id) {
  if (!isStorageAvailable()) return { ok: false, reason: 'unavailable' };
  try {
    if (id) window.localStorage.setItem(DEFAULT_KEY, id);
    else window.localStorage.removeItem(DEFAULT_KEY);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'quota' };
  }
}
