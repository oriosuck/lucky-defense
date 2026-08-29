import { createMissionProgress } from '../data/missions.js';
import { HEROES_BY_ID } from '../data/heroes.js';
import { STARTING_GOLD, FIELD_MAX_CAPACITY, MONSTER_MAX, NORMAL_SUMMON_INITIAL_COST } from '../data/constants.js';

export const FIELD_ROWS = 4;
export const FIELD_COLS = 6;
export const TOTAL_WAVES = 20;

// 웨이브별 제한시간(초). 10/20웨이브는 2분30초, 그 외 30초.
export function waveDuration(wave) {
  if (wave === 10 || wave === 20) return 150;
  return 30;
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

// 이동불능 이벤트가 발생할 라운드 2개를 게임 시작 시 한 번만 뽑는다.
// (기획서: 게임당 정확히 2회 - 1~9라운드 중 랜덤 1회 + 11~19라운드 중 랜덤 1회.
// 보스 일반공격(디버프) 스케줄과는 별개로 강제 발생한다)
function rollImmobilizeRounds() {
  const first = 1 + Math.floor(Math.random() * 9); // 1~9
  const second = 11 + Math.floor(Math.random() * 9); // 11~19
  return [first, second];
}

// 보스 일반공격(디버프) 스케줄: 1~2 사이 주사위를 굴려 다음 발동 라운드를 정한다
// (기술설계서 4장 scheduleNextBossAttack 의사코드).
function rollNextBossAttackRound(fromRound) {
  return fromRound + 1 + Math.floor(Math.random() * 2); // +1 또는 +2
}

/**
 * @param {{gameType:'no-delete'|'delete', immortalPet:boolean, heroSettings:{heroId:string,immortal:boolean,favorite:boolean}[]}} config
 */
export function createGameState(config) {
  return {
    wave: 0,
    waveTimeLeft: 5, // 진입 5초 후 1웨이브 시작
    monsterCount: 0,
    monsterMax: MONSTER_MAX, // 필드 누적 몬스터 최대치(110) - 라운드당 40마리(MONSTER_PER_ROUND)와는 별개 개념
    roundMonsterSpawnedSoFar: 0, // 이번 라운드에 지금까지 트리클로 등장시킨 수(0~40), 라운드 시작마다 리셋
    gold: STARTING_GOLD,
    luckstone: 0,
    normalSummonCost: NORMAL_SUMMON_INITIAL_COST,
    fieldMaxCapacity: FIELD_MAX_CAPACITY,
    field: createEmptyField(),
    speed: 1,
    paused: false,
    gameType: config.gameType,
    immortalPet: config.immortalPet,
    heroSettings: config.heroSettings ?? [],
    missions: createMissionProgress(),
    bossAttackSchedule: {
      nextAttackRound: rollNextBossAttackRound(0),
      immobilizeRounds: rollImmobilizeRounds(),
    },
    bossRaidWindow: null, // 10/20라운드 진입 시에만 세팅
    indyTreasure: { slot: null, timer: 30, digging: null, completedAt: null }, // 인디 "보물 발굴"(5-4) - 30초마다 새 칸에 등장
    // digging: {instanceId, timer} - "발굴" 버튼을 누르면 즉시 결과가 나오는 게 아니라
    // 2초짜리 발굴 시간을 준다(사용자 지정). completedAt: 쿨타임 게이지가 다 차서
    // 새 보물이 등장한 시각(Date.now()) - "완료" 텍스트를 잠깐 보여주는 용도.
    globalEnhance: { common: 0, hero: 0, legendary: 0, rate: 0 }, // 하단 강화 팝업의 전역 4트랙
    eventLog: {
      deleteEvent: null,
      immobilizeEvent: null,
      debuffEvent: null, // 보스 일반공격(디버프) - 실질 효과 없음, 대상 표시만
    },
    counters: {
      enhanceCount: 0,
      sellCount: 0,
      legendaryRouletteFailCount: 0,
      moveCount: 0,
      normalSummonLegendaryCount: 0, // "소환에서 전설 등급 등장" 미션용 - 일반 소환으로 전설을 뽑은 횟수
      normalSummonHeroCount: 0, // "소환에서 영웅 등급 등장 3번" 미션용 - 일반 소환으로 영웅을 뽑은 횟수
      rouletteAttemptCount: 0, // "룰렛 소환 시도 20번" 미션용 - 등급/성공 무관 전체 룰렛 시도 횟수
      rouletteFailCount: 0, // "룰렛 소환 실패 10번" 미션용 - 등급 무관 전체 룰렛 실패 횟수
      legendaryRouletteSuccessCount: 0, // "전설 룰렛 소환 성공 3번" 미션용
    },
    claimedMissionIds: [], // 이미 보상을 지급한 미션(missions.js checkMissions 참고, 중복 지급 방지
    missionToastQueue: [], // 새로 완료된 미션 알림 대기열(missions.js의 checkMissions/tickMissionToast 참고)
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
