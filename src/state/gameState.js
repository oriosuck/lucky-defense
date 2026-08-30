import { createMissionProgress } from '../data/missions.js';
import { HEROES_BY_ID, IMP_HERO_ID } from '../data/heroes.js';
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
    },
    bossRaidWindow: null, // 10/20라운드 진입 시에만 세팅
    // 마마 임프 생성 공유 타이머 - 마마가 몇 마리든 이 타이머 하나만 돈다(사용자
    // 지정 - "마마 임프 생성 속도는 1마리만 소환하는 걸로 가자 여러마리 소환됐더라도"
    // - 예전엔 마마 개체마다 독립 타이머라 마마가 늘수록 생성 속도가 배로 빨라졌음).
    // immortal.js의 tickMamaImps()가 지연 생성한다.
    mamaImpTick: null,
    // 인디 "보물 발굴"(5-4) - 인디 개체마다 독립된 쿨타임/보물 위치를 가져야 한다
    // (사용자 지적 - "인디 두마리 이상 소환될 때 쿨타임 두마리가 똑같이 적용돼.
    // 개별 적용이 아니라" - 예전엔 이 상태가 게임 전체에 하나뿐인 전역 객체라
    // 인디를 몇 마리를 두든 전부 같은 타이머/같은 칸을 공유했다). instanceId를
    // 키로 하는 맵으로 바꿔서 인디 개체별로 독립된
    // {slot, timer, digging, completedAt}을 가진다 - 항목은 waveEvents.js의
    // tickIndyTreasure가 필드에서 처음 발견한 인디 개체마다 지연 생성한다(게임
    // 시작 시점엔 인디가 아직 없으므로 여기서는 빈 맵으로만 시작).
    // digging: {instanceId, timer} - "발굴" 버튼을 누르면 즉시 결과가 나오는 게 아니라
    // 2초짜리 발굴 시간을 준다(사용자 지정). completedAt: 쿨타임 게이지가 다 차서
    // 새 보물이 등장한 시각(Date.now()) - "완료" 텍스트를 잠깐 보여주는 용도.
    indyTreasures: {},
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

// 마마가 만드는 임프(x_imp)는 실제 필드 토큰으로 존재하긴 하지만 "캐릭터 카운트"
// (인원 X/30, 소환/조합 필드 꽉 참 판정)에는 안 잡혀야 한다(사용자 지정 - 임프가
// 쌓이면서 30칸이 금방 차버려 정작 진짜 영웅을 소환/조합할 자리가 없어지는 문제였음).
// 임프도 물리적으로는 칸을 차지하므로(findAutoPlaceSlot이 실제 빈 칸/스택 여유를
// 그대로 확인) 필드가 진짜로 꽉 차면 임프도 더 못 놓이는 건 그대로다 - 여기서
// 빼는 건 "인원수 상한(30)" 판정에서만이다.
export function fieldOccupantCount(state) {
  return state.field.reduce(
    (sum, slot) => sum + slot.occupants.filter((o) => o.heroId !== IMP_HERO_ID).length,
    0,
  );
}

// 마마 임프는 인원수 상한(fieldOccupantCount)엔 안 잡히지만 칸은 실제로 차지한다
// (위 fieldOccupantCount 주석 참고) - 그래서 임프가 24칸을 전부 3마리씩 채워버리면
// 인원수 표시는 여유가 있어 보여도(임프 자체가 카운트 안 되므로) 물리적으로는
// 새 영웅이 들어갈 자리가 단 한 칸도 없는 상태가 될 수 있다. 이 경우 findAutoPlaceSlot이
// 항상 null을 반환하는데도 소환 버튼은 인원수만 보고 계속 활성 상태였던 게 버그였다
// (사용자 지적 - "임프 포함 필드가 꽉차면 마리수가 남아도 소환이 안되어야해").
//
// **처음엔 "모든 칸이 3마리(또는 신화/불멸 1마리)까지 꽉 찼는지"로 구현했었는데**,
// 그러면 24칸이 전부 서로 다른 1마리씩(칸마다 다른 종류라 스택 매칭이 안 되는
// 상태, 인원수는 24로 아직 30 미만)으로 채워진 경우를 못 잡는다 - 그 상태에서
// 새로 뽑힌 영웅이 기존 어느 스택과도 안 맞으면 findAutoPlaceSlot이 여전히 null을
// 반환해 골드만 날아간다. 사용자가 다시 지적했다 - "필드가 가득 차면(만약에
// 30마리가 다 안되더라도) 룰렛이 돌아가면 안돼. 소환도." 새로 뽑힐 영웅의 종류를
// 미리 알 수 없으니(스택 매칭은 순전히 운) "완전히 빈 칸이 하나라도 있는가"만이
// 유일하게 신뢰할 수 있는 기준이다 - 빈 칸이 하나도 없으면 어떤 결과가 나오든
// 배치가 보장되지 않으므로 이 시점에 이미 "꽉 찼다"로 취급한다.
export function isFieldPhysicallyFull(state) {
  return state.field.every((s) => s.occupants.length > 0);
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
  // 임프는 캐릭터 카운트(인원 30 상한)에 안 잡히니(fieldOccupantCount 참고) 이
  // 상한 체크도 임프 배치에는 적용하면 안 된다 - 그렇지 않으면 진짜 영웅이 이미
  // 30마리로 꽉 찬 상태에서는(물리적 빈 칸이 있어도) 임프가 하나도 못 나오게
  // 막혀버려서, "임프는 캐릭터 카운트에 안 들어간다"는 의도와 반대로 인원 상한에
  // 여전히 종속되는 셈이 된다.
  if (heroId !== IMP_HERO_ID && fieldOccupantCount(state) >= state.fieldMaxCapacity) return null;
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
