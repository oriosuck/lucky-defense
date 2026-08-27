import { waveDuration, TOTAL_WAVES, FIELD_ROWS, FIELD_COLS } from '../state/gameState.js';
import { countHeroOnField } from './synthesis.js';

const INCAPACITATE_ROUNDS = { 2: 15, 4: 20, 5: 1, 7: 1, 9: 10 };
const INCAPACITATE_FILL_SEC = 5;
const DELETE_ROUNDS = [13, 20];
const DELETE_START_AT_TIME_LEFT = 15;
const DELETE_TRIGGER_AT_TIME_LEFT = 6;

function randomInt(maxExclusive) {
  return Math.floor(Math.random() * maxExclusive);
}

function pickRandomSlots(state, count) {
  const shuffled = [...state.field].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((s) => ({ row: s.row, col: s.col }));
}

/**
 * 웨이브 타이머 진행. deltaSec는 실제 경과시간(배속/탭 비활성화 보정 포함).
 */
export function tickWave(state, deltaSec) {
  if (state.result) return state;
  const newState = structuredClone(state);

  newState.waveTimeLeft -= deltaSec;

  if (newState.wave === 0 && newState.waveTimeLeft <= 0) {
    newState.wave = 1;
    newState.waveTimeLeft += waveDuration(1);
    onWaveStart(newState);
  } else if (newState.wave >= 1 && newState.waveTimeLeft <= 0) {
    if (newState.wave >= TOTAL_WAVES) {
      newState.result = 'win';
    } else {
      newState.wave += 1;
      newState.waveTimeLeft += waveDuration(newState.wave);
      onWaveStart(newState);
    }
  }

  if (newState.wave >= 1 && !newState.result) {
    // 몬스터 누적치: 정식 밸런스 수치 확정 전까지의 임시 곡선
    newState.monsterCount += deltaSec * (1 + newState.wave * 0.1);
    if (newState.monsterCount >= newState.monsterMax) {
      newState.result = 'lose';
    }
  }

  return newState;
}

function onWaveStart(state) {
  if (state.gameType !== 'delete') return;
  if (INCAPACITATE_ROUNDS[state.wave] != null) {
    const duration = waveDuration(state.wave);
    state.eventLog.incapacitateEvent = {
      round: state.wave,
      phase: 'idle',
      triggerAtTimeLeft: randomInt(Math.max(1, duration - INCAPACITATE_FILL_SEC)),
      timer: 0,
      targetSlots: [],
    };
  }
  if (DELETE_ROUNDS.includes(state.wave)) {
    state.eventLog.deleteEvent = { round: state.wave, phase: 'idle', targetSlots: [] };
  }
}

/** 2/4/5/7/9라운드 보스 행동불능 공격 (전투 영향 없이 표시만) */
export function handleIncapacitateEvent(state) {
  const ev = state.eventLog.incapacitateEvent;
  if (!ev || ev.round !== state.wave) return state;
  const newState = structuredClone(state);
  const e = newState.eventLog.incapacitateEvent;

  if (e.phase === 'idle' && newState.waveTimeLeft <= e.triggerAtTimeLeft) {
    e.phase = 'filling';
    e.timer = INCAPACITATE_FILL_SEC;
    e.targetSlots = pickRandomSlots(newState, 6);
  } else if (e.phase === 'active' && e.timer <= 0) {
    e.phase = 'done';
  }
  return newState;
}

export function tickIncapacitateTimer(state, deltaSec) {
  const ev = state.eventLog.incapacitateEvent;
  if (!ev || (ev.phase !== 'filling' && ev.phase !== 'active')) return state;
  const newState = structuredClone(state);
  const e = newState.eventLog.incapacitateEvent;
  e.timer -= deltaSec;
  if (e.phase === 'filling' && e.timer <= 0) {
    e.phase = 'active';
    e.timer = INCAPACITATE_ROUNDS[e.round];
  }
  return newState;
}

/** 13/20라운드 삭제 공격 (기술설계서 4장 handleDeleteEvent 의사코드) */
export function handleDeleteEvent(state) {
  const ev = state.eventLog.deleteEvent;
  if (!ev || ev.round !== state.wave || ev.phase === 'done') return state;

  if (ev.round === 20 && countHeroOnField(state, 'm_orc_shaman').count >= 5) {
    const newState = structuredClone(state);
    newState.eventLog.deleteEvent.phase = 'done'; // 무효화
    return newState;
  }

  const newState = structuredClone(state);
  const e = newState.eventLog.deleteEvent;

  if (e.phase === 'idle' && newState.waveTimeLeft <= DELETE_START_AT_TIME_LEFT) {
    e.phase = 'filling';
    const isRow = Math.random() < 0.5;
    const index = isRow ? randomInt(4) : randomInt(6);
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
