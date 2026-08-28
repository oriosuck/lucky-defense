import { waveDuration, TOTAL_WAVES, FIELD_ROWS, FIELD_COLS } from '../state/gameState.js';
import { fieldOccupantCount } from '../state/gameState.js';
import { countHeroOnField } from './synthesis.js';
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
const IMMOBILIZE_INSTANT_SEC = 5;
const IMMOBILIZE_GAUGE_FILL_SEC = 5;
const IMMOBILIZE_GAUGE_LOCK_SEC = 10;

// ---- 삭제 공격 ("삭제 있는 버전"에서만, 13/20라운드) ----
const DELETE_ROUNDS = [13, 20];
const DELETE_START_AT_TIME_LEFT = 15;
const DELETE_TRIGGER_AT_TIME_LEFT = 6;
const DELETE_IMMUNE_HERO_ID = 'm_orc_shaman';
const DELETE_IMMUNE_COUNT = 5;

// ---- 보스 레이드 창 (10/20라운드 전용) ----
const RAID_ROUNDS = [10, 20];
const RAID_BASE_DELAY_SEC = 4;
const RAID_MISSING_PENALTY_SEC = 5;
const RAID_KEY_HERO_IDS = ['m_mama', 'm_bane', 'm_roka'];

// 몬스터 처치 속도 - 데미지 계산이 시뮬레이션 범위 밖이라 임시로 둔 플레이스홀더 수치
const MONSTER_KILL_RATE_PER_SEC = 2; // 필드에 영웅이 1마리라도 있으면 초당 2마리씩 처치

function randomInt(maxExclusive) {
  return Math.floor(Math.random() * maxExclusive);
}

function pickRandomSlots(state, count) {
  const shuffled = [...state.field].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((s) => ({ row: s.row, col: s.col }));
}

/**
 * 라운드 종료 보상 지급 (기술설계서 4장 applyRoundEndReward 의사코드).
 * 0→1라운드만 별도 고정값(FIRST_WAVE_SUBSIDY), 그 외에는 보유골드×10%+6010.
 */
function applyRoundEndReward(state, isFirstWave) {
  if (isFirstWave) {
    state.gold += FIRST_WAVE_SUBSIDY;
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
    if (fieldOccupantCount(newState) > 0) {
      const beforeKillCount = Math.floor(newState.monsterCount);
      newState.monsterCount = Math.max(0, newState.monsterCount - MONSTER_KILL_RATE_PER_SEC * deltaSec);
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
  // 매 라운드 40마리씩 신규 등장(누적 유지)
  state.monsterCount = Math.min(state.monsterMax, state.monsterCount + MONSTER_PER_ROUND);

  if (state.eventLog.immobilizeRounds.includes(state.wave)) {
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

  // "삭제 없는 버전"에서는 이 이벤트 자체를 만들지 않는다.
  if (state.gameType === 'delete' && DELETE_ROUNDS.includes(state.wave)) {
    state.eventLog.deleteEvent = { round: state.wave, phase: 'idle', targetSlots: [] };
  } else {
    state.eventLog.deleteEvent = null;
  }

  state.eventLog.raidWindow = RAID_ROUNDS.includes(state.wave) ? { open: false, delayRemaining: null } : null;
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
  const rw = state.eventLog.raidWindow;
  if (!rw || rw.open || state.result) return state;
  const newState = structuredClone(state);
  const r = newState.eventLog.raidWindow;

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
