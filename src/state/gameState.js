import { defaultRelics, fieldMaxCapacity, startingGold } from '../data/relics.js';
import { createMissionProgress } from '../data/missions.js';
import { HEROES_BY_ID } from '../data/heroes.js';

export const FIELD_ROWS = 4;
export const FIELD_COLS = 6;
export const TOTAL_WAVES = 20;

// 웨이브별 제한시간(초). 10/20웨이브는 2분30초, 그 외 30초.
export function waveDuration(wave) {
  if (wave === 10 || wave === 20) return 150;
  return 30;
}

// 라운드가 오를수록 늘어나는 몬스터 누적치 - 실제 밸런스 수치 확인 전까지의 임시 곡선
function defaultMonsterMax() {
  return 200;
}

let instanceSeq = 0;
export function nextInstanceId() {
  instanceSeq += 1;
  return `inst_${Date.now()}_${instanceSeq}`;
}

// 자동 배치 순서: 1열(0열) 1~4행을 채운 뒤 2열로 넘어가는 열 우선 순서.
// (배열 순서 = findAutoPlaceSlot의 탐색 순서. 화면상 위치는 slot.row/col로 별도 지정)
function createEmptyField() {
  const slots = [];
  for (let col = 0; col < FIELD_COLS; col += 1) {
    for (let row = 0; row < FIELD_ROWS; row += 1) {
      slots.push({ row, col, occupants: [] });
    }
  }
  return slots;
}

/**
 * @param {{gameType:'no-delete'|'delete', immortalPet:boolean, relics:object, ownedHeroes:{heroId:string,immortal:boolean,favorite:boolean}[]}} config
 */
export function createGameState(config) {
  const relics = { ...defaultRelics(), ...config.relics };
  return {
    wave: 0,
    waveTimeLeft: 5, // 진입 5초 후 1웨이브 시작
    monsterCount: 0,
    monsterMax: defaultMonsterMax(),
    monsterSpawnTimer: 0,
    gold: startingGold(relics.wallet),
    luckstone: 0,
    normalSummonCost: 20,
    fieldMaxCapacity: fieldMaxCapacity(relics.meat),
    field: createEmptyField(),
    speed: 1,
    paused: false,
    gameType: config.gameType,
    relics,
    immortalPet: config.immortalPet,
    ownedHeroes: config.ownedHeroes ?? [],
    unlockedInstantSummons: [], // 즐겨찾기 등록 + 조합 완료된 신화 heroId 목록 (좌측 즉시소환 버튼)
    globalUpgrades: { normalRare: 1, hero: 1, legendaryImmortal: 1, summonRate: 1 }, // 강화 버튼: 등급대별 전체 강화 레벨(실제 게임 화면 기준)
    missions: createMissionProgress(),
    eventLog: { deleteEvent: null, incapacitateEvent: null, triggeredRounds: [] },
    counters: {
      enhanceCount: 0,
      sellCount: 0,
      legendaryRouletteFailCount: 0,
      moveCount: 0,
    },
    result: null, // 'win' | 'lose' | null
    log: [],
  };
}

export function fieldOccupantCount(state) {
  return state.field.reduce((sum, slot) => sum + slot.occupants.length, 0);
}

export function findSlot(state, row, col) {
  return state.field.find((s) => s.row === row && s.col === col) ?? null;
}

export function findInstance(state, instanceId) {
  for (const slot of state.field) {
    const inst = slot.occupants.find((o) => o.instanceId === instanceId);
    if (inst) return { slot, instance: inst };
  }
  return null;
}

export function canPlaceInSlot(state, slot, heroId) {
  const heroDef = HEROES_BY_ID[heroId];
  if (!heroDef) return false;
  const isSingleSlotTier = heroDef.tier === 'mythic' || heroDef.tier === 'immortal';
  if (slot.occupants.length === 0) return true;
  if (isSingleSlotTier) return false;
  const existingHeroId = slot.occupants[0].heroId;
  return existingHeroId === heroId && slot.occupants.length < 3;
}

export function createHeroInstance(heroId, overrides = {}) {
  return {
    instanceId: nextInstanceId(),
    heroId,
    isImmortalPath: false,
    progress: 0,
    enhanceLevel: 0,
    breakthrough: false,
    favorite: false,
    ...overrides,
  };
}

// 동일 종류가 쌓여있는 칸을 우선하고, 없으면 빈 칸을 찾는다.
export function findAutoPlaceSlot(state, heroId) {
  if (fieldOccupantCount(state) >= state.fieldMaxCapacity) return null;
  const heroDef = HEROES_BY_ID[heroId];
  if (!heroDef) return null;
  if (heroDef.tier !== 'mythic' && heroDef.tier !== 'immortal') {
    const stackable = state.field.find(
      (s) => s.occupants.length > 0 && s.occupants[0].heroId === heroId && s.occupants.length < 3,
    );
    if (stackable) return stackable;
  }
  return state.field.find((s) => s.occupants.length === 0) ?? null;
}

export function placeInstanceAtSlot(slot, instance) {
  slot.occupants.push(instance);
}

export function isNeighborSlot(a, b) {
  return Math.abs(a.row - b.row) <= 1 && Math.abs(a.col - b.col) <= 1 && !(a.row === b.row && a.col === b.col);
}

export function neighborsOf(state, slot) {
  return state.field.filter((s) => isNeighborSlot(slot, s));
}
