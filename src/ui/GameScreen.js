import { HEROES_BY_ID, TIER_LABEL } from '../data/heroes.js';
import { STAGE_LAYOUT } from '../data/assets.js';
import { missionDefinitions } from '../logic/missions.js';
import { summonNormal, summonRoulette } from '../logic/summon.js';
import {
  synthesize,
  craftMythic,
  sellHero,
  feedMythicToChad,
  sellGigaChad,
  countHeroOnField,
  craftableMythicCount,
  instantSummonFavorite,
} from '../logic/synthesis.js';
import {
  enhanceHero,
  moveHero,
  toggleBreakthrough,
  digTreasure,
  ENHANCE_GOLD_COST,
  ENHANCE_LUCKSTONE_COST,
} from '../logic/actions.js';
import { checkImmortalPromotion, cannibalizeTar, attemptSecondStageEvolution } from '../logic/immortal.js';
import { SECOND_STAGE_IMMORTAL } from '../data/heroes.js';
import { fieldOccupantCount } from '../state/gameState.js';
import { el } from './components/dom.js';
import { heroPlaceholder, placeholderBlock } from './components/heroPlaceholder.js';

/**
 * @param {{ getState:()=>object, dispatch:(s:object)=>void, onExit:()=>void }} props
 * @returns {{root:HTMLElement, update:(s:object)=>void}}
 */
export function GameScreen({ getState, dispatch, onExit }) {
  const root = el('div', { class: 'screen game-screen' });
  const ui = {
    selectedInstanceId: null,
    moveMode: false,
    mythicPopup: null, // null | 'owned' | 'immortal'
    missionPopup: false,
    roulettePopup: false,
    monsters: [], // 좌->우 굴을 지나가는 장식용 몬스터 애니메이션 상태
    lastMonsterSpawnAt: null,
  };

  function apply(result) {
    if (result?.newState) dispatch(result.newState);
  }

  // 배경 이미지는 이번 리팩토링에서 제외됐지만, 재적용 시 다시 어긋나지 않도록
  // 실제 원본 비율(688:1508)로 스테이지 컨테이너 크기를 유지한다(CLAUDE.md 참고).
  const STAGE_RATIO = 688 / 1508;

  function sizeStageToFit(wrap, stage) {
    const availW = wrap.clientWidth;
    const availH = wrap.clientHeight;
    if (!availW || !availH) return;
    let w;
    let h;
    if (availW / availH > STAGE_RATIO) {
      h = availH;
      w = h * STAGE_RATIO;
    } else {
      w = availW;
      h = w / STAGE_RATIO;
    }
    stage.style.width = `${w}px`;
    stage.style.height = `${h}px`;
  }

  function render(state) {
    updateMonsterAnimation(state);
    root.innerHTML = '';
    root.appendChild(renderTopBar(state));
    root.appendChild(renderMonsterRow(state));
    const stage = renderStage(state);
    const stageWrap = el('div', { class: 'game-stage-wrap' }, [stage]);
    root.appendChild(stageWrap);
    sizeStageToFit(stageWrap, stage);
    if (ui.mythicPopup) root.appendChild(renderMythicPopup(state));
    if (ui.missionPopup) root.appendChild(renderMissionPopup(state));
    if (ui.roulettePopup) root.appendChild(renderRoulettePopup(state));
    if (state.result) root.appendChild(renderResultOverlay(state));
  }

  window.addEventListener('resize', () => {
    if (root.isConnected) render(getState());
  });

  const MONSTER_SPAWN_INTERVAL_MS = 800; // 장식용 애니메이션 등장 간격(연출용, 실제 몬스터 수와는 별개)
  const MONSTER_TRAVEL_MS = 2600;

  function updateMonsterAnimation(state) {
    const now = Date.now();
    if (ui.lastMonsterSpawnAt == null) ui.lastMonsterSpawnAt = now;
    const active = state.wave >= 1 && !state.result && !state.paused;
    if (active) {
      while (now - ui.lastMonsterSpawnAt >= MONSTER_SPAWN_INTERVAL_MS) {
        ui.lastMonsterSpawnAt += MONSTER_SPAWN_INTERVAL_MS;
        ui.monsters.push({ id: `mon_${now}_${Math.random()}`, bornAt: ui.lastMonsterSpawnAt });
      }
    } else {
      ui.lastMonsterSpawnAt = now;
    }
    ui.monsters = ui.monsters.filter((m) => now - m.bornAt < MONSTER_TRAVEL_MS);
  }

  function renderStage(state) {
    const stage = el('div', { class: 'game-stage stage-placeholder-bg' });
    stage.appendChild(renderBoss(state));
    const now = Date.now();
    for (const m of ui.monsters) {
      const elapsed = Math.max(0, now - m.bornAt);
      stage.appendChild(
        el('div', {
          class: 'stage-monster',
          text: '👹',
          style: `top:${STAGE_LAYOUT.leftHole.y}%; left:${STAGE_LAYOUT.leftHole.x}%; animation: monster-travel ${MONSTER_TRAVEL_MS}ms linear forwards; animation-delay: -${elapsed}ms;`,
        }),
      );
    }
    stage.appendChild(renderField(state));
    stage.appendChild(renderFavoriteBar(state));
    stage.appendChild(renderStageControls(state));
    stage.appendChild(renderResourceOverlay(state));
    const selPanel = renderSelectedPanel(state);
    if (selPanel) stage.appendChild(selPanel);
    stage.appendChild(renderBottomOverlay(state));
    return stage;
  }

  function renderBoss(state) {
    const raid = state.bossRaidWindow;
    const raidLabel = raid ? (raid.open ? '레이드 창 열림!' : '몬스터 소탕 대기 중') : null;
    const boss = placeholderBlock('보스', { className: 'stage-boss' });
    boss.style.cssText = `left:${STAGE_LAYOUT.boss.left}%; top:${STAGE_LAYOUT.boss.top}%; width:${STAGE_LAYOUT.boss.width}%; height:${STAGE_LAYOUT.boss.height}%;`;
    if (raidLabel) boss.appendChild(el('span', { class: `raid-window-badge ${raid.open ? 'open' : ''}`, text: raidLabel }));
    return boss;
  }

  function renderStageControls(state) {
    return el('div', { class: 'stage-controls' }, [
      el('button', {
        class: `stage-control-btn ${state.paused ? 'active' : ''}`,
        text: state.paused ? '▶' : '⏸',
        onclick: () => {
          const next = structuredClone(state);
          next.paused = !state.paused;
          dispatch(next);
        },
      }),
      el('button', { class: 'stage-control-btn', text: '🚪', onclick: onExit }),
    ]);
  }

  function renderTopBar(state) {
    return el('div', { class: 'top-bar' }, [
      el('div', { class: 'top-bar-wave' }, [
        el('span', { class: 'wave-label', text: `WAVE ${state.wave}` }),
        el('span', { class: 'timer', text: `${Math.max(0, Math.ceil(state.waveTimeLeft))}s` }),
      ]),
      el('div', { class: 'top-bar-level', text: `Lv.${state.wave}` }),
    ]);
  }

  function renderMonsterRow(state) {
    return el('div', { class: 'monster-row' }, [
      el('span', { class: 'monster-count-icon', text: '💀' }),
      el('span', { class: 'monster-count-text', text: `${Math.floor(state.monsterCount)} / ${state.monsterMax}` }),
    ]);
  }

  const FAVORITE_BAR_MAX = 5;

  // 좌측 세로 아이콘 목록: 합성 완료된 신화·불멸 등급 영웅을 최대 5개까지, 즐겨찾기 우선 정렬로 표시.
  // 즐겨찾기로 등록해 둔 것 중 실제로 조합까지 완료한 것만 "즉시 소환!" 버튼으로 클릭 가능하다.
  function craftedShowcaseHeroIds(state) {
    const seen = new Set();
    const ids = [];
    for (const slot of state.field) {
      for (const occ of slot.occupants) {
        const def = HEROES_BY_ID[occ.heroId];
        if (def && (def.tier === 'mythic' || def.tier === 'immortal') && !seen.has(occ.heroId)) {
          seen.add(occ.heroId);
          ids.push(occ.heroId);
        }
      }
    }
    const favoriteIds = new Set(state.heroSettings.filter((h) => h.favorite).map((h) => h.heroId));
    ids.sort((a, b) => Number(favoriteIds.has(b)) - Number(favoriteIds.has(a)));
    return ids.slice(0, FAVORITE_BAR_MAX);
  }

  function renderFavoriteBar(state) {
    const heroIds = craftedShowcaseHeroIds(state);
    return el(
      'div',
      { class: 'favorite-bar' },
      heroIds.map((heroId) => {
        const unlocked = state.unlockedInstantSummons.includes(heroId);
        const heroDef = HEROES_BY_ID[heroId];
        return el(
          'button',
          {
            class: 'favorite-icon',
            title: heroDef?.name,
            disabled: !unlocked,
            onclick: unlocked ? () => apply(instantSummonFavorite(state, heroId)) : undefined,
          },
          [
            heroPlaceholder(heroDef, { className: 'favorite-icon-image' }),
            unlocked ? el('span', { class: 'favorite-icon-label', text: '즉시 소환!' }) : null,
          ],
        );
      }),
    );
  }

  function renderField(state) {
    const grid = el('div', {
      class: 'field-grid stage-field',
      style: `left:${STAGE_LAYOUT.field.left}%; top:${STAGE_LAYOUT.field.top}%; width:${STAGE_LAYOUT.field.width}%; height:${STAGE_LAYOUT.field.height}%;`,
    });
    for (const slot of state.field) {
      const isTarget = ui.moveMode && ui.selectedInstanceId;
      const cell = el('div', {
        class: `field-slot count-${slot.occupants.length}${slot.occupants.length ? '' : ' empty'}${isTarget ? ' move-target' : ''}`,
        style: `grid-column:${slot.col + 1}; grid-row:${slot.row + 1};`,
        onclick: () => onSlotClick(state, slot),
      });
      slot.occupants.forEach((occ) => {
        const heroDef = HEROES_BY_ID[occ.heroId];
        const debuffed = state.eventLog.debuffEvent?.instanceId === occ.instanceId;
        cell.appendChild(
          el('div', {
            class: `hero-token tier-${heroDef.tier}${occ.instanceId === ui.selectedInstanceId ? ' selected' : ''}${debuffed ? ' debuffed' : ''}`,
          }, [
            heroPlaceholder(heroDef, { className: 'hero-token-image', showName: false }),
            occ.enhanceLevel ? el('span', { class: 'enhance-badge', text: `+${occ.enhanceLevel}` }) : null,
          ]),
        );
      });
      if (isImmobilizeFilling(state, slot)) cell.appendChild(el('div', { class: 'immobilize-fill-mark', text: '⏳' }));
      if (isImmobilized(state, slot)) cell.appendChild(el('div', { class: 'immobilize-mark', text: '😵' }));
      if (isDeleteTarget(state, slot)) cell.appendChild(el('div', { class: 'delete-mark', text: '❌' }));
      if (isTreasureSlot(state, slot)) cell.appendChild(el('div', { class: 'treasure-mark', text: '💰' }));
      grid.appendChild(cell);
    }
    return grid;
  }

  // m_tar(단계별)/m_dragon(드레인 준비) 등, 필드에서 상태에 따라 표시가 달라지던 영웅들을
  // 위한 이름 라벨 - 이미지가 없는 지금은 상태를 텍스트로만 구분해 보여준다.
  function heroDisplayLabel(instance, heroDef) {
    if (heroDef.id === 'm_tar') return `${heroDef.name} ${instance.tarStage ?? 1}단계`;
    if (heroDef.id === 'm_dragon' && instance.immortalEligible) return `${heroDef.name}(드레인)`;
    return heroDef.name;
  }

  function isImmobilized(state, slot) {
    const ev = state.eventLog.immobilizeEvent;
    return ev && ev.phase === 'active' && ev.targetSlots.some((t) => t.row === slot.row && t.col === slot.col);
  }
  function isImmobilizeFilling(state, slot) {
    const ev = state.eventLog.immobilizeEvent;
    return ev && ev.phase === 'filling' && ev.targetSlots.some((t) => t.row === slot.row && t.col === slot.col);
  }
  function isDeleteTarget(state, slot) {
    const ev = state.eventLog.deleteEvent;
    return ev && ev.phase === 'filling' && ev.targetSlots.some((t) => t.row === slot.row && t.col === slot.col);
  }
  function isTreasureSlot(state, slot) {
    const t = state.indyTreasure.slot;
    return t && t.row === slot.row && t.col === slot.col;
  }

  function onSlotClick(state, slot) {
    if (ui.moveMode && ui.selectedInstanceId) {
      ui.moveMode = false;
      apply(moveHero(state, ui.selectedInstanceId, slot.row, slot.col));
      return;
    }
    const first = slot.occupants[0];
    ui.selectedInstanceId = first ? first.instanceId : null;
    render(getState());
  }

  function renderResourceOverlay(state) {
    return el('div', { class: 'stage-resource-row' }, [
      el('div', { class: 'resource-bar' }, [
        el('span', { class: 'resource-value resource-gold', text: `💰 ${Math.floor(state.gold)}` }),
        el('span', { class: 'resource-value resource-luckstone', text: `💎 ${state.luckstone}` }),
        el('span', { class: 'resource-value resource-pop', text: `👥 ${fieldOccupantCount(state)}/${state.fieldMaxCapacity}` }),
      ]),
      el('button', {
        class: `speed-toggle-btn ${state.speed === 2 ? 'active' : ''}`,
        text: state.speed === 2 ? 'x2' : 'x1',
        onclick: () => {
          const next = structuredClone(state);
          next.speed = state.speed === 2 ? 1 : 2;
          dispatch(next);
        },
      }),
    ]);
  }

  function selectedInstance(state) {
    if (!ui.selectedInstanceId) return null;
    for (const slot of state.field) {
      const instance = slot.occupants.find((o) => o.instanceId === ui.selectedInstanceId);
      if (instance) return { slot, instance };
    }
    ui.selectedInstanceId = null;
    return null;
  }

  function renderSelectedPanel(state) {
    const found = selectedInstance(state);
    if (!found) return null;
    const { slot, instance } = found;
    const heroDef = HEROES_BY_ID[instance.heroId];
    const buttons = [];

    buttons.push(el('button', { class: 'btn', text: '이동', onclick: () => { ui.moveMode = true; render(state); } }));

    if (heroDef.tier !== 'mythic' && heroDef.tier !== 'immortal') {
      buttons.push(el('button', {
        class: 'btn', text: '판매', onclick: () => { apply(sellHero(state, instance.instanceId)); ui.selectedInstanceId = null; },
      }));
    }
    if (slot.occupants.length === 3 && heroDef.tier !== 'legendary') {
      buttons.push(el('button', { class: 'btn', text: '합성', onclick: () => apply(synthesize(state, slot.row, slot.col)) }));
    }
    if (instance.heroId === 'm_mama') {
      buttons.push(el('button', {
        class: `btn ${instance.breakthrough ? 'active' : ''}`, text: '돌파', onclick: () => apply(toggleBreakthrough(state, instance.instanceId)),
      }));
    }
    if (heroDef.tier === 'mythic' && heroDef.immortalCondition) {
      buttons.push(el('button', {
        class: 'btn', text: '승급 시도',
        onclick: () => apply(checkImmortalPromotion(state, instance.instanceId)),
      }));
    }
    if (instance.heroId === 'i_giga_chad') {
      buttons.push(el('button', { class: 'btn', text: '판매(+6 행운석)', onclick: () => apply(sellGigaChad(state, instance.instanceId)) }));
    }
    if (instance.heroId === 'm_tar' && countHeroOnField(state, 'm_tar').count > 1) {
      buttons.push(el('button', { class: 'btn', text: '동족포식', onclick: () => apply(cannibalizeTar(state, instance.instanceId)) }));
    }
    if (instance.heroId === 'm_indy') {
      const canDig = state.indyTreasure.slot && state.indyTreasure.slot.row === slot.row && state.indyTreasure.slot.col === slot.col;
      buttons.push(el('button', {
        class: 'btn', text: '발굴', disabled: !canDig,
        onclick: () => apply(digTreasure(state, instance.instanceId)),
      }));
    }
    if (SECOND_STAGE_IMMORTAL[instance.heroId]) {
      buttons.push(el('button', {
        class: 'btn', text: `2차 변신 시도(성공 ${Math.round(SECOND_STAGE_IMMORTAL[instance.heroId].successRate * 100)}%, 실패 시 소멸)`,
        onclick: () => { apply(attemptSecondStageEvolution(state, instance.instanceId)); ui.selectedInstanceId = null; },
      }));
    }
    if (heroDef.tier === 'mythic' && instance.heroId !== 'm_chad') {
      const chad = state.field.flatMap((s) => s.occupants).find((o) => o.heroId === 'm_chad');
      if (chad) {
        buttons.push(el('button', {
          class: 'btn', text: '채드에게 먹이기(+5 행운석)',
          onclick: () => { apply(feedMythicToChad(state, chad.instanceId, instance.instanceId)); ui.selectedInstanceId = null; },
        }));
      }
    }

    return el('div', { class: 'selected-panel' }, [
      el('button', { class: 'selected-close', text: '✕', onclick: () => { ui.selectedInstanceId = null; render(state); } }),
      el('div', { class: 'selected-header' }, [
        heroPlaceholder(heroDef, { className: 'selected-image', label: heroDisplayLabel(instance, heroDef) }),
        el('div', { class: 'selected-title', text: `${heroDef.name} (${TIER_LABEL[heroDef.tier]}) +${instance.enhanceLevel}` }),
      ]),
      heroDef.immortalCondition
        ? el('div', { class: 'immortal-progress', text: `불멸 진행도: ${Math.floor(instance.progress ?? 0)}${heroDef.immortalCondition.target != null ? ' / ' + heroDef.immortalCondition.target : ''}` })
        : null,
      extraStatusText(instance, heroDef) ? el('div', { class: 'immortal-progress', text: extraStatusText(instance, heroDef) }) : null,
      el('div', { class: 'action-buttons' }, buttons),
    ]);
  }

  // 마마(임프 보유량)/인디(보유 보물 등급) 등 진행도 텍스트 외에 추가로 보여줄 상태 한 줄.
  function extraStatusText(instance, heroDef) {
    if (instance.heroId === 'm_mama') {
      const target = instance.breakthrough ? heroDef.immortalCondition.extra.breakthroughCost : heroDef.immortalCondition.extra.normalCost;
      return `임프: ${instance.impStock ?? 0} / ${target}${instance.breakthrough ? ' (돌파)' : ''}`;
    }
    if (instance.heroId === 'm_indy') {
      return `보유 보물: ${instance.indyTreasureTier ? TIER_LABEL[instance.indyTreasureTier] : '없음'}`;
    }
    return null;
  }

  function renderBottomOverlay(state) {
    const mythicBadgeCount = craftableMythicCount(state);
    return el('div', { class: 'stage-bottom-overlay' }, [
      el('div', { class: 'stage-bottom-row' }, [
        el('button', {
          class: 'stage-btn mythic-btn',
          onclick: () => { ui.mythicPopup = 'owned'; render(state); },
        }, [el('span', { class: 'stage-btn-label', text: '신화' }), el('span', { class: 'hex-badge', text: String(mythicBadgeCount) })]),
        el('button', {
          class: 'stage-btn summon-btn',
          onclick: () => apply(summonNormal(state)),
        }, [el('span', { class: 'stage-btn-label', text: '소환' }), el('span', { class: 'summon-cost-overlay', text: `${state.normalSummonCost}G` })]),
        el('button', {
          class: 'stage-btn roulette-btn',
          onclick: () => { ui.roulettePopup = true; render(state); },
        }, [el('span', { class: 'stage-btn-label', text: '룰렛' })]),
        el('button', { class: 'stage-btn mission-btn', onclick: () => { ui.missionPopup = true; render(state); } }, [
          el('span', { class: 'stage-btn-label', text: '☰' }),
        ]),
      ]),
      el('div', { class: 'stage-enhance-row' }, [
        el('button', {
          class: 'stage-btn enhance-btn',
          disabled: !ui.selectedInstanceId || state.gold < ENHANCE_GOLD_COST || state.luckstone < ENHANCE_LUCKSTONE_COST,
          onclick: () => apply(enhanceHero(state, ui.selectedInstanceId)),
        }, [el('span', { class: 'stage-btn-label', text: `강화 (${ENHANCE_GOLD_COST}G ${ENHANCE_LUCKSTONE_COST}💎)` })]),
      ]),
    ]);
  }

  const ROULETTE_TIERS = [
    { tier: 'rare', slot: 'left', cost: 1, cls: 'rr-rare', label: '희귀 룰렛' },
    { tier: 'hero', slot: 'left', cost: 1, cls: 'rr-hero', label: '영웅 룰렛' },
    { tier: 'legendary', slot: 'right', cost: 2, cls: 'rr-legendary', label: '전설 룰렛' },
  ];

  function renderRoulettePopup(state) {
    const items = ROULETTE_TIERS.map((r) =>
      el('button', {
        class: `roulette-item-btn ${r.cls}`,
        disabled: state.luckstone < r.cost,
        onclick: () => apply(summonRoulette(state, r.tier, r.slot)),
      }, [
        el('span', { class: 'roulette-item-label', text: r.label }),
        el('span', { class: 'roulette-item-cost', text: `💎${r.cost}` }),
      ]),
    );
    return el('div', { class: 'popup-overlay', onclick: (e) => { if (e.target === e.currentTarget) { ui.roulettePopup = false; render(state); } } }, [
      el('div', { class: 'popup-box roulette-popup-box' }, [
        el('button', { class: 'popup-close', text: '✕', onclick: () => { ui.roulettePopup = false; render(state); } }),
        el('h3', { text: '룰렛' }),
        el('div', { class: 'roulette-popup-status' }, [
          el('span', { text: `보유 행운석: ${state.luckstone}` }),
          el('span', { text: `필드 영웅: ${fieldOccupantCount(state)} / ${state.fieldMaxCapacity}` }),
        ]),
        el('div', { class: 'roulette-row' }, items),
      ]),
    ]);
  }

  function renderMythicPopup(state) {
    const ownedMythicIds = state.heroSettings
      .map((h) => h.heroId)
      .filter((id) => HEROES_BY_ID[id]?.tier === 'mythic');

    const tabs = el('div', { class: 'popup-tabs' }, [
      el('button', { class: `btn ${ui.mythicPopup === 'owned' ? 'active' : ''}`, text: '보유 영웅', onclick: () => { ui.mythicPopup = 'owned'; render(state); } }),
      el('button', { class: `btn ${ui.mythicPopup === 'immortal' ? 'active' : ''}`, text: '불멸 조건', onclick: () => { ui.mythicPopup = 'immortal'; render(state); } }),
    ]);

    let body;
    if (ui.mythicPopup === 'owned') {
      body = el('ul', { class: 'mythic-list' }, ownedMythicIds.map((id) => {
        const heroDef = HEROES_BY_ID[id];
        const missing = (heroDef.synthMaterials ?? []).filter((m) => countHeroOnField(state, m.heroId).count < m.count);
        return el('li', {}, [
          heroPlaceholder(heroDef, { className: 'mythic-list-image' }),
          el('button', {
            class: 'btn', text: '조합', disabled: missing.length > 0,
            onclick: () => apply(craftMythic(state, id)),
          }),
          missing.length ? el('span', { class: 'missing-note', text: ` 부족: ${missing.map((m) => HEROES_BY_ID[m.heroId].name).join(', ')}` }) : null,
        ]);
      }));
    } else {
      const activeMythics = state.field.flatMap((s) => s.occupants.filter((o) => HEROES_BY_ID[o.heroId]?.tier === 'mythic'));
      body = el('ul', { class: 'mythic-list' }, activeMythics.map((instance) => {
        const heroDef = HEROES_BY_ID[instance.heroId];
        const cond = heroDef.immortalCondition;
        return el('li', {}, [
          heroPlaceholder(heroDef, { className: 'mythic-list-image', label: heroDisplayLabel(instance, heroDef) }),
          el('span', { text: extraStatusText(instance, heroDef) ?? `${cond.name}: ${Math.floor(instance.progress ?? 0)}${cond.target != null ? ' / ' + cond.target : ''}` }),
        ]);
      }));
      if (!activeMythics.length) body = el('div', { text: '필드에 배치된 신화 등급 영웅이 없습니다.' });
    }

    return el('div', { class: 'popup-overlay', onclick: (e) => { if (e.target === e.currentTarget) { ui.mythicPopup = null; render(state); } } }, [
      el('div', { class: 'popup-box' }, [tabs, body, el('button', { class: 'btn', text: '닫기', onclick: () => { ui.mythicPopup = null; render(state); } })]),
    ]);
  }

  function renderMissionPopup(state) {
    const items = missionDefinitions().map((def) => {
      const progress = state.missions.find((m) => m.missionId === def.id);
      return el('li', { class: progress?.completed ? 'completed' : '' }, `${def.name}: ${progress?.current ?? 0} / ${def.target} - ${def.description}`);
    });
    return el('div', { class: 'popup-overlay', onclick: (e) => { if (e.target === e.currentTarget) { ui.missionPopup = false; render(state); } } }, [
      el('div', { class: 'popup-box' }, [el('h3', { text: '미션' }), el('ul', {}, items), el('button', { class: 'btn', text: '닫기', onclick: () => { ui.missionPopup = false; render(state); } })]),
    ]);
  }

  function renderResultOverlay(state) {
    return el('div', { class: 'result-overlay' }, [
      el('div', { class: 'result-box' }, [
        el('h2', { text: state.result === 'win' ? '승리!' : '패배...' }),
        el('button', { class: 'btn btn-primary', text: '홈으로', onclick: onExit }),
      ]),
    ]);
  }

  // 최초 렌더링은 main.js가 root를 문서에 붙인 직후 update()로 호출한다.
  // (stageWrap이 아직 DOM에 붙기 전에 sizeStageToFit을 돌리면 clientWidth/Height가
  // 0으로 읽혀서 스테이지가 다음 tick 재렌더링 전까지 잠깐 빈 화면으로 보이는 문제가 있었다.)
  return {
    root,
    update(state) {
      render(state);
    },
  };
}
