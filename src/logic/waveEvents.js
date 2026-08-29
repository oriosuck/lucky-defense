import { waveDuration, TOTAL_WAVES, FIELD_ROWS, FIELD_COLS } from '../state/gameState.js';
import { fieldOccupantCount, findInstance } from '../state/gameState.js';
import { countHeroOnField } from './synthesis.js';
import { rollNormalTier } from './summon.js';
import { TIERS } from '../data/heroes.js';
import {
  MONSTER_MAX,
  MONSTER_PER_ROUND,
  MONSTER_KILL_GOLD,
  ROUND_END_LUCKSTONE,
  ROUND_END_FLAT_GOLD,
  VAULT_BONUS_PERCENT,
  FIRST_WAVE_SUBSIDY,
} from '../data/constants.js';

// ---- 이동불능(즉시형/게이지형) - 게임당 정확히 2회, 라운드는 createGameState에서 미리 확정됨 ----
// 실제로 이동불능 상태에 걸려 있는 시간(즉시형/게이지형 공통)은 20초로 통일한다
// (사용자 지정 - "공격 당했을 때 당하는 시간은 일단 20초로 통일해두자", 정확한 수치가
// 기획서에 없어 임시로 맞춘 값). 게이지형의 "차오르는 시간"(IMMOBILIZE_GAUGE_FILL_SEC)은
// 당하는 시간이 아니라 발동 전 예열 시간이라 별개로 그대로 둔다.
const IMMOBILIZE_INSTANT_SEC = 20;
export const IMMOBILIZE_GAUGE_FILL_SEC = 5;
const IMMOBILIZE_GAUGE_LOCK_SEC = 20;

// ---- 삭제 공격 ("삭제 있는 버전"에서만, 13/20라운드) ----
const DELETE_ROUNDS = [13, 20];
export const DELETE_START_AT_TIME_LEFT = 15;
export const DELETE_TRIGGER_AT_TIME_LEFT = 6;
const DELETE_IMMUNE_HERO_ID = 'm_orc_shaman';
const DELETE_IMMUNE_COUNT = 5;

// ---- 보스 레이드 창 (10/20라운드 전용) ----
const RAID_ROUNDS = [10, 20];
const RAID_BASE_DELAY_SEC = 4;
const RAID_MISSING_PENALTY_SEC = 5;
const RAID_KEY_HERO_IDS = ['m_mama', 'm_bane', 'm_roka'];

// ---- 보스 일반공격(디버프) - 이동불능과 별개, 1~2 주사위 간격으로 반복 발동 ----
// 실질 효과 없음(공격속도/공격력 감소 미반영), 대상 칸 표시만. 지속시간은 기획서에
// 명시되어 있지 않아 이동불능과 마찬가지로 20초로 통일한다(사용자 지정).
const DEBUFF_MARK_SEC = 20;

// ---- 인디 "보물 발굴" (5-4) ----
export const INDY_TREASURE_INTERVAL_SEC = 30;
export const INDY_DIG_DURATION_SEC = 2; // "발굴" 버튼을 눌렀을 때 실제 발굴에 걸리는 시간(사용자 지정)

// 몬스터 처치 속도 - 데미지 계산이 시뮬레이션 범위 밖이라 임시로 둔 플레이스홀더 수치.
// 예전 값(2/초)은 일반 라운드(30초)의 트리클 스폰 속도(40/30≈1.33/초)보다 빨라서
// 필드에 영웅이 하나라도 있으면 monsterCount가 항상 0에 수렴해버렸다 - 카운트
// 표시도 0/110에서 안 움직이고, 화면의 장식용 몬스터 스프라이트 풀도
// Math.floor(monsterCount)에 연동돼 있어서 몬스터가 아예 안 보이는 버그의 원인이었다
// (사용자 리포트: "몬스터가 아예 맵에서 안보여"). 트리클 스폰 속도보다 낮은 값으로
// 낮춰서 일반 라운드에는 몬스터가 실제로 쌓여 보이게 하고, 대신 스폰 속도가 훨씬
// 느린 보스 라운드(150초, 40/150≈0.27/초)에서는 여전히 0까지 떨어져서 보스 레이드
// 창이 정상적으로 열리도록 했다(전체 시뮬레이션 결과 20라운드 클리어까지 110을
// 넘지 않음을 확인).
//
// 이후 사용자가 "영웅 숫자에 따른 몬스터 제거 시간"을 다시 지적 - 고정값이 아니라
// 필드의 영웅 수에 비례해서 처치 속도가 늘어나야 하고(영웅이 없으면 처치 자체가
// 0이어야 함), 10라운드(150초 보스 라운드)는 2분24초(144초) 안에 몬스터가 0마리가
// 될 수 있어야 한다는 조건이 확정됐었다(당시 0.04/초/마리로 확정).
//
// 이번에 사용자가 조건을 더 강하게 정정 - "10라운드 시작하고 4초가 지났을 때 모든
// 몬스터가 다 사라지는 수준"이어야 한다. 필드가 5~6라운드 만에 꽉 찬다(30마리)는
// 기존 가정으로 라운드 1~20을 시뮬레이션해보면, 처치가 매 라운드 스폰을 계속
// 갉아먹는 구조라 k값을 올릴수록 10라운드 시작 시점의 누적 몬스터 수 자체가
// 훨씬 줄어드는 효과가 있다(예: k=0.06이면 9라운드 종료 시점에 이미 1마리 미만으로
// 수렴) - "110마리를 4초 안에 처치"가 아니라 "이미 거의 다 줄어든 나머지를 4초
// 안에 마저 처치"하는 문제라 k를 크게 올리지 않아도 조건을 만족한다. 시뮬레이션
// 결과 k=0.06이면 10라운드 시작 후 약 0.5~3초 사이(가정한 영웅 증가 속도에 따라
// 편차 있음)에 0에 도달해 4초 조건을 항상 만족했고, 정상 라운드에서도 몬스터
// 최대 누적치가 110 근처까지 안 가고 60마리 선에서 머물러(시뮬레이션 확인) 화면에
// 몬스터가 쌓여 보이는 기존 느낌도 유지된다.
const MONSTER_KILL_RATE_PER_HERO_PER_SEC = 0.06; // 필드 영웅 1마리당 초당 처치량(영웅 0마리면 처치 0)

function randomInt(maxExclusive) {
  return Math.floor(Math.random() * maxExclusive);
}

function pickRandomSlots(state, count) {
  const shuffled = [...state.field].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((s) => ({ row: s.row, col: s.col }));
}

// 디버프는 이동불능(게이지형)과 마찬가지로 한 칸이 아니라 6칸을 한 번에 대상으로
// 삼는다(사용자 지정). 빈 칸을 물들여봐야 의미가 없으니(디버프는 캐릭터 색조
// 변경 연출이라) 점유된 칸 중에서만 뽑는다. 발동 시점의 "칸"이 아니라 그 칸에 있던
// "개체"를 대상으로 기록한다(사용자 지적 - 디버프 걸린 캐릭터를 다른 칸으로 옮기면
// 보라색도 같이 따라가야 한다, 칸에 눌러붙어 있으면 안 됨) - 그래서 좌표가 아니라
// instanceId 목록을 뽑아 반환한다.
function pickDebuffTargetInstanceIds(state, slotCount) {
  const occupied = state.field.filter((s) => s.occupants.length > 0);
  const shuffled = [...occupied].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, slotCount).flatMap((s) => s.occupants.map((o) => o.instanceId));
}

/**
 * 라운드 종료 보상 지급 (기술설계서 4장 applyRoundEndReward 의사코드).
 * 0→1라운드만 별도 고정값(FIRST_WAVE_SUBSIDY), 그 외에는 보유골드×10%+6010.
 */
function applyRoundEndReward(state, isFirstWave) {
  if (isFirstWave) {
    // "고정값"은 기존 보유 골드(STARTING_GOLD)에 더하는 게 아니라 시작 시점의 총
    // 골드를 이 값으로 확정 짓는 것이다(사용자 지적 - 0라운드에 아무것도 안 썼는데
    // 1라운드 시작 금액이 2284보다 더 많이 들어오던 버그, 원인은 여기서 += 로
    // STARTING_GOLD 위에 얹어버리고 있었기 때문).
    state.gold = FIRST_WAVE_SUBSIDY;
  } else {
    state.gold += state.gold * VAULT_BONUS_PERCENT + ROUND_END_FLAT_GOLD;
  }
  state.luckstone += ROUND_END_LUCKSTONE;
}

/**
 * 웨이브 타이머 진행. deltaSec는 실제 경과시간(배속/탭 비활성화 보정 포함).
 */
export function tickWave(state, deltaSec) {
  if (state.result) return state;
  const newState = structuredClone(state);

  newState.waveTimeLeft -= deltaSec;

  if (newState.wave === 0 && newState.waveTimeLeft <= 0) {
    applyRoundEndReward(newState, true); // 0→1 최초 지원금
    newState.wave = 1;
    newState.waveTimeLeft += waveDuration(1);
    onWaveStart(newState);
  } else if (newState.wave >= 1 && newState.waveTimeLeft <= 0) {
    if (newState.wave >= TOTAL_WAVES) {
      applyRoundEndReward(newState, false);
      newState.result = 'win';
    } else {
      applyRoundEndReward(newState, false);
      newState.wave += 1;
      newState.waveTimeLeft += waveDuration(newState.wave);
      onWaveStart(newState);
    }
  }

  if (newState.wave >= 1 && !newState.result) {
    // 이번 라운드에 새로 등장할 몬스터(최대 40마리)는 한꺼번에 추가되지 않고 라운드
    // 경과 시간에 비례해 한 마리씩 트리클로 늘어난다("시간이 되면 한마리씩 나오는
    // 개념") - monsterCount(필드 누적, 최대 110)에 더해진다. 이 최대 110은
    // 라운드당 40마리와는 별개의 개념(필드 누적 총량 한도)이라 서로 다른 상수다.
    const duration = waveDuration(newState.wave);
    const elapsed = Math.max(0, duration - newState.waveTimeLeft);
    const targetSpawnedThisRound = Math.max(0, Math.min(MONSTER_PER_ROUND, Math.floor((elapsed / duration) * MONSTER_PER_ROUND)));
    const newlySpawned = targetSpawnedThisRound - (newState.roundMonsterSpawnedSoFar ?? 0);
    if (newlySpawned > 0) {
      newState.monsterCount = Math.min(newState.monsterMax, newState.monsterCount + newlySpawned);
      newState.roundMonsterSpawnedSoFar = targetSpawnedThisRound;
    }

    const heroCount = fieldOccupantCount(newState);
    if (heroCount > 0) {
      const beforeKillCount = Math.floor(newState.monsterCount);
      const killRate = heroCount * MONSTER_KILL_RATE_PER_HERO_PER_SEC;
      newState.monsterCount = Math.max(0, newState.monsterCount - killRate * deltaSec);
      const killed = beforeKillCount - Math.floor(newState.monsterCount);
      if (killed > 0) newState.gold += killed * MONSTER_KILL_GOLD; // 몬스터 처치 시 골드 +30(마리당)
    }
    if (newState.monsterCount >= newState.monsterMax) {
      newState.result = 'lose';
    }
  }

  return newState;
}

function onWaveStart(state) {
  // 이번 라운드의 트리클 스폰 진행도를 0부터 다시 센다(실제 monsterCount 증가는
  // 위 tickWave에서 경과 시간에 비례해 처리).
  state.roundMonsterSpawnedSoFar = 0;

  if (state.bossAttackSchedule.immobilizeRounds.includes(state.wave)) {
    const duration = waveDuration(state.wave);
    const type = Math.random() < 0.5 ? 'instant' : 'gauge';
    state.eventLog.immobilizeEvent = {
      round: state.wave,
      type,
      phase: 'idle',
      triggerAtTimeLeft: randomInt(Math.max(1, duration - IMMOBILIZE_GAUGE_FILL_SEC)),
      timer: 0,
      targetSlots: [],
    };
  } else {
    state.eventLog.immobilizeEvent = null;
  }

  // 보스 일반공격(디버프) 스케줄 - 이동불능과 별개로, 예정된 라운드마다 발동하고 다음
  // 예정 라운드를 다시 주사위(1~2)로 굴린다. 대상은 칸이 아니라 그 칸에 있던 개체
  // (인스턴스)다(사용자 지적 - 칸에 고정되면 안 되고, 옮기면 디버프가 캐릭터를
  // 따라가야 한다). 칸 자체는 이동불능(게이지형)과 똑같이 6칸을 한 번에 골라 그
  // 안의 개체를 전부 대상으로 삼는다(사용자 지정).
  if (state.wave === state.bossAttackSchedule.nextAttackRound) {
    const targetIds = pickDebuffTargetInstanceIds(state, 6);
    state.eventLog.debuffEvent = targetIds.length ? { instanceIds: targetIds, timer: DEBUFF_MARK_SEC } : null;
    state.bossAttackSchedule.nextAttackRound = state.wave + 1 + randomInt(2);
  }

  // "삭제 없는 버전"에서는 이 이벤트 자체를 만들지 않는다.
  if (state.gameType === 'delete' && DELETE_ROUNDS.includes(state.wave)) {
    state.eventLog.deleteEvent = { round: state.wave, phase: 'idle', targetSlots: [] };
  } else {
    state.eventLog.deleteEvent = null;
  }

  state.bossRaidWindow = RAID_ROUNDS.includes(state.wave) ? { open: false, delayRemaining: null } : null;
}

/** 이동불능 공격(즉시형: 즉시 속박 5초 / 게이지형: 6칸 5초 채워진 뒤 10초간 이동불가) */
export function handleImmobilizeEvent(state) {
  const ev = state.eventLog.immobilizeEvent;
  if (!ev || ev.round !== state.wave || ev.phase === 'done') return state;
  const newState = structuredClone(state);
  const e = newState.eventLog.immobilizeEvent;

  if (e.phase === 'idle' && newState.waveTimeLeft <= e.triggerAtTimeLeft) {
    if (e.type === 'instant') {
      e.targetSlots = pickRandomSlots(newState, 1);
      e.phase = 'active';
      e.timer = IMMOBILIZE_INSTANT_SEC;
    } else {
      e.targetSlots = pickRandomSlots(newState, 6);
      e.phase = 'filling';
      e.timer = IMMOBILIZE_GAUGE_FILL_SEC;
    }
  } else if (e.phase === 'filling' && e.timer <= 0) {
    e.phase = 'active';
    e.timer = IMMOBILIZE_GAUGE_LOCK_SEC;
  } else if (e.phase === 'active' && e.timer <= 0) {
    e.phase = 'done';
  }
  return newState;
}

export function tickImmobilizeTimer(state, deltaSec) {
  const ev = state.eventLog.immobilizeEvent;
  if (!ev || (ev.phase !== 'filling' && ev.phase !== 'active')) return state;
  const newState = structuredClone(state);
  newState.eventLog.immobilizeEvent.timer -= deltaSec;
  return newState;
}

/** 13/20라운드 삭제 공격 (기술설계서 4장 handleDeleteEvent 의사코드) */
export function handleDeleteEvent(state) {
  const ev = state.eventLog.deleteEvent;
  if (!ev || ev.round !== state.wave || ev.phase === 'done') return state;

  if (ev.round === 20 && countHeroOnField(state, DELETE_IMMUNE_HERO_ID).count >= DELETE_IMMUNE_COUNT) {
    const newState = structuredClone(state);
    newState.eventLog.deleteEvent.phase = 'done'; // 무효화
    return newState;
  }

  const newState = structuredClone(state);
  const e = newState.eventLog.deleteEvent;

  if (e.phase === 'idle' && newState.waveTimeLeft <= DELETE_START_AT_TIME_LEFT) {
    e.phase = 'filling';
    const isRow = Math.random() < 0.5;
    const index = isRow ? randomInt(FIELD_ROWS) : randomInt(FIELD_COLS);
    e.targetSlots = isRow
      ? Array.from({ length: FIELD_COLS }, (_, col) => ({ row: index, col }))
      : Array.from({ length: FIELD_ROWS }, (_, row) => ({ row, col: index }));
  } else if (e.phase === 'filling' && newState.waveTimeLeft <= DELETE_TRIGGER_AT_TIME_LEFT) {
    for (const slot of newState.field) {
      if (e.targetSlots.some((t) => t.row === slot.row && t.col === slot.col)) {
        slot.occupants = [];
      }
    }
    e.phase = 'done';
  }

  return newState;
}

/**
 * 보스 레이드 창(10/20라운드 전용): 필드에 몬스터가 0마리가 된 시점부터 지연시간을 세고,
 * 지연시간이 지나면 창이 열려 해당 웨이브가 끝날 때까지 유지된다.
 * 기본 지연 4초, 마마/베인/로카 중 필드에 없는 영웅이 있을 때마다 +5초.
 */
export function tickBossRaidWindow(state, deltaSec) {
  const rw = state.bossRaidWindow;
  if (!rw || rw.open || state.result) return state;
  const newState = structuredClone(state);
  const r = newState.bossRaidWindow;

  if (Math.floor(newState.monsterCount) > 0) {
    r.delayRemaining = null; // 몬스터가 다시 쌓이면 카운트다운 리셋
    return newState;
  }

  if (r.delayRemaining == null) {
    const missing = RAID_KEY_HERO_IDS.filter((id) => countHeroOnField(newState, id).count === 0).length;
    r.delayRemaining = RAID_BASE_DELAY_SEC + missing * RAID_MISSING_PENALTY_SEC;
  } else {
    r.delayRemaining -= deltaSec;
    if (r.delayRemaining <= 0) {
      r.open = true;
      r.delayRemaining = 0;
    }
  }
  return newState;
}

/** 보스 일반공격(디버프) 표시 - 실질 효과 없이 짧게 표시만 하고 사라진다. */
export function tickDebuffTimer(state, deltaSec) {
  const ev = state.eventLog.debuffEvent;
  if (!ev) return state;
  const newState = structuredClone(state);
  newState.eventLog.debuffEvent.timer -= deltaSec;
  if (newState.eventLog.debuffEvent.timer <= 0) newState.eventLog.debuffEvent = null;
  return newState;
}

/**
 * 인디 "보물 발굴"(5-4): 30초마다 필드 임의의 칸에 새 보물이 등장한다. 인디가 아직
 * 필드에 없으면 등장 자체가 말이 안 되므로(사용자 지적 - "인디도 없는데 돈주머니가
 * 뜨는 건 불가") 인디가 있을 때만 타이머를 돌리고, 없으면 남아있던 보물 표시도 지운다.
 */
export function tickIndyTreasure(state, deltaSec) {
  if (state.result) return state;
  const hasIndy = state.field.some((s) => s.occupants.some((o) => o.heroId === 'm_indy'));
  if (!hasIndy) {
    if (!state.indyTreasure.slot) return state;
    const newState = structuredClone(state);
    newState.indyTreasure.slot = null;
    return newState;
  }
  // 발굴 중(digging)일 때는 쿨타임을 멈춘다 - 안 그러면 발굴 결과가 나오기 전에
  // 자연 만료로 새 자리가 뽑혀서 발굴 중이던 자리가 바뀌어 보일 수 있다.
  if (state.indyTreasure.digging) return state;
  const newState = structuredClone(state);
  const t = newState.indyTreasure;
  t.timer -= deltaSec;
  if (t.timer <= 0) {
    t.timer += INDY_TREASURE_INTERVAL_SEC;
    const slot = newState.field[randomInt(newState.field.length)];
    t.slot = { row: slot.row, col: slot.col };
    t.completedAt = Date.now(); // 게이지가 다 찬 순간 - UI가 "완료" 텍스트를 잠깐 보여주는 기준
  }
  return newState;
}

/**
 * "발굴" 버튼을 누르면 즉시 결과가 나오지 않고 INDY_DIG_DURATION_SEC(2초) 동안
 * digging 상태로 대기한 뒤 이 함수가 실제 결과를 확정한다(사용자 지정 - "보물
 * 발굴 누르고 발굴하는 시간 2초 부여"). 판정 로직 자체는 예전 즉시 처리 로직과
 * 동일(일반 소환과 같은 확률표, 기존 보유 등급보다 낮으면 교체하지 않음) - 시작을
 * actions.js의 digTreasure()가 맡고, 여기서는 시간이 다 됐을 때의 확정만 담당한다.
 */
export function tickIndyDig(state, deltaSec) {
  if (!state.indyTreasure.digging) return state;
  const newState = structuredClone(state);
  const digging = newState.indyTreasure.digging;
  digging.timer -= deltaSec;
  if (digging.timer > 0) return newState;

  const found = findInstance(newState, digging.instanceId);
  newState.indyTreasure.digging = null;
  if (found) {
    const rolledTier = rollNormalTier();
    const current = found.instance.indyTreasureTier;
    const upgraded = !current || TIERS.indexOf(rolledTier) > TIERS.indexOf(current);
    if (upgraded) found.instance.indyTreasureTier = rolledTier;
  }
  newState.indyTreasure.slot = null;
  newState.indyTreasure.timer = INDY_TREASURE_INTERVAL_SEC;
  return newState;
}
