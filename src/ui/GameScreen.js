import { HEROES_BY_ID, TIER_LABEL, heroesByTier, SECOND_STAGE_IMMORTAL } from '../data/heroes.js';
import { STAGE_LAYOUT, BOSS_IMAGE, UI_IMAGES } from '../data/assets.js';
import { missionDefinitions } from '../logic/missions.js';
import { summonNormal, summonRoulette } from '../logic/summon.js';
import { ROULETTE_SUCCESS_RATE, ROULETTE_COST } from '../data/heroes.js';
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
import { IMMOBILIZE_GAUGE_FILL_SEC } from '../logic/waveEvents.js';
import { fieldOccupantCount } from '../state/gameState.js';
import { el } from './components/dom.js';
import { heroImage } from './components/heroVisual.js';

/**
 * @param {{ getState:()=>object, dispatch:(s:object)=>void, onExit:()=>void }} props
 * @returns {{root:HTMLElement, update:(s:object)=>void}}
 */
export function GameScreen({ getState, dispatch, onExit }) {
  const root = el('div', { class: 'screen game-screen' });
  const ui = {
    selectedInstanceId: null,
    moveMode: false,
    popup: null, // null | 'mythic' | 'roulette' | 'enhance' | 'mission'
    mythicTab: 'mythic', // 'mythic' | 'immortal'
    mythicSelectedId: null,
    monsters: [], // 좌->우 굴을 지나가는 장식용 몬스터 애니메이션 상태
    lastMonsterSpawnAt: null,
  };

  function apply(result) {
    if (result?.newState) dispatch(result.newState);
  }

  function openPopup(name, state) {
    ui.popup = name;
    render(state);
  }
  function closePopup(state) {
    ui.popup = null;
    render(state);
  }

  // 배경 원본 비율(688:1508)을 유지한다 - 순수 CSS만으로는 뷰포트 비율에 따라 눌려 보이는
  // 문제가 있어서 실측 후 픽셀로 못박는다(CLAUDE.md 참고).
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
    const stage = renderStage(state);
    const stageWrap = el('div', { class: 'game-stage-wrap' }, [stage]);
    root.appendChild(stageWrap);
    sizeStageToFit(stageWrap, stage);
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
    const stage = el('div', { class: 'game-stage' });
    stage.appendChild(renderTopBadge(state));
    stage.appendChild(renderMonsterRow(state));
    stage.appendChild(renderBoss(state));
    const now = Date.now();
    for (const m of ui.monsters) {
      const elapsed = Math.max(0, now - m.bornAt);
      stage.appendChild(
        el('div', {
          class: 'stage-monster',
          style: `top:${STAGE_LAYOUT.leftHole.y}%; left:${STAGE_LAYOUT.leftHole.x}%; animation: monster-travel ${MONSTER_TRAVEL_MS}ms linear forwards; animation-delay: -${elapsed}ms;`,
        }, [el('img', { src: UI_IMAGES.monsterIcon, alt: '몬스터' })]),
      );
    }
    stage.appendChild(renderField(state));
    stage.appendChild(renderFavoriteBar(state));
    stage.appendChild(renderStageControls(state));
    stage.appendChild(renderResourceRow(state));
    stage.appendChild(renderSideControls(state));
    const selPanel = renderSelectedPanel(state);
    if (selPanel) stage.appendChild(selPanel);
    stage.appendChild(renderActionRow(state));
    stage.appendChild(renderEnhanceOpenBtn(state));
    if (ui.popup === 'roulette') stage.appendChild(renderRoulettePopup(state));
    if (ui.popup === 'enhance') stage.appendChild(renderEnhancePopup(state));
    if (ui.popup === 'mythic') stage.appendChild(renderMythicPopup(state));
    if (ui.popup === 'mission') stage.appendChild(renderMissionPopup(state));
    if (state.result) stage.appendChild(renderResultOverlay(state));
    return stage;
  }

  function renderTopBadge(state) {
    return el('div', { class: 'top-badge' }, [
      el('span', { class: 'top-badge-label', text: `WAVE ${state.wave} · Lv.${state.wave}` }),
      el('span', { class: 'top-badge-value', text: `${Math.max(0, Math.ceil(state.waveTimeLeft))}s` }),
    ]);
  }

  function renderMonsterRow(state) {
    return el('div', { class: 'monster-row' }, [
      el('span', { class: 'monster-count-text', text: `${Math.floor(state.monsterCount)} / ${state.monsterMax}` }),
    ]);
  }

  function renderBoss(state) {
    const raid = state.bossRaidWindow;
    const raidLabel = raid ? (raid.open ? '레이드 창 열림!' : '몬스터 소탕 대기 중') : null;
    const boss = el('div', {
      class: 'stage-boss',
      style: `left:${STAGE_LAYOUT.boss.left}%; top:${STAGE_LAYOUT.boss.top}%; width:${STAGE_LAYOUT.boss.width}%; height:${STAGE_LAYOUT.boss.height}%;`,
    }, [el('img', { class: 'stage-boss-img', src: BOSS_IMAGE, alt: '보스' })]);
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
            heroImage(heroDef, { className: 'favorite-icon-image' }),
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
      const filling = isImmobilizeFilling(state, slot);
      const cell = el('div', {
        class: [
          `field-slot count-${slot.occupants.length}`,
          slot.occupants.length ? '' : 'empty',
          isTarget ? 'move-target' : '',
          filling ? 'immobilize-filling' : '',
          isImmobilized(state, slot) ? 'immobilize-active' : '',
        ].filter(Boolean).join(' '),
        style: `grid-column:${slot.col + 1}; grid-row:${slot.row + 1};${filling ? ` --fill-sec:${IMMOBILIZE_GAUGE_FILL_SEC}s; animation-delay:-${(IMMOBILIZE_GAUGE_FILL_SEC - state.eventLog.immobilizeEvent.timer) * 1000}ms;` : ''}`,
        onclick: () => onSlotClick(state, slot),
      });
      slot.occupants.forEach((occ) => {
        const heroDef = HEROES_BY_ID[occ.heroId];
        const debuffed = state.eventLog.debuffEvent?.instanceId === occ.instanceId;
        cell.appendChild(
          el('div', {
            class: `hero-token${occ.instanceId === ui.selectedInstanceId ? ' selected' : ''}${debuffed ? ' debuffed' : ''}`,
          }, [
            heroImage(heroDef, { className: 'hero-token-image', instance: occ }),
            occ.enhanceLevel ? el('span', { class: 'enhance-badge', text: `+${occ.enhanceLevel}` }) : null,
          ]),
        );
      });
      if (isImmobilized(state, slot)) {
        cell.appendChild(el('div', { class: 'immobilize-mark' }, [el('img', { src: UI_IMAGES.immobilizeIcon, alt: '이동불능' })]));
      }
      if (isDeleteTarget(state, slot)) cell.appendChild(el('div', { class: 'delete-mark', text: '❌' }));
      if (isTreasureSlot(state, slot)) cell.appendChild(el('div', { class: 'treasure-mark', text: '💰' }));
      grid.appendChild(cell);
    }
    return grid;
  }

  // m_tar(단계별)/m_dragon(드레인 준비) 등, 필드에서 상태에 따라 표시가 달라지던 영웅들을
  // 위한 이름 라벨.
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

  function renderResourceRow(state) {
    return el('div', { class: 'stage-resource-row' }, [
      el('div', { class: 'resource-bar' }, [
        el('span', { class: 'resource-value resource-gold', text: `${Math.floor(state.gold)}` }),
        el('span', { class: 'resource-value resource-luckstone', text: `${state.luckstone}` }),
        el('span', { class: 'resource-value resource-pop', text: `${fieldOccupantCount(state)}/${state.fieldMaxCapacity}` }),
      ]),
    ]);
  }

  function renderSideControls(state) {
    return el('div', { class: 'stage-side-controls' }, [
      el('button', {
        class: 'speed-toggle-btn',
        title: state.speed === 2 ? '배속 x2 (클릭 시 x1)' : '배속 x1 (클릭 시 x2)',
        onclick: () => {
          const next = structuredClone(state);
          next.speed = state.speed === 2 ? 1 : 2;
          dispatch(next);
        },
      }, [el('img', { src: state.speed === 2 ? UI_IMAGES.speedOn : UI_IMAGES.speedOff, alt: '배속' })]),
      el('button', {
        class: 'mission-toggle-btn',
        title: '미션',
        onclick: () => openPopup('mission', state),
      }, [el('img', { src: UI_IMAGES.skullIcon, alt: '미션' })]),
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
        heroImage(heroDef, { className: 'selected-image', instance }),
        el('div', { class: 'selected-title', text: `${heroDisplayLabel(instance, heroDef)} (${TIER_LABEL[heroDef.tier]}) +${instance.enhanceLevel}` }),
      ]),
      heroDef.immortalCondition
        ? el('div', { class: 'immortal-progress', text: `불멸 진행도: ${Math.floor(instance.progress ?? 0)}${heroDef.immortalCondition.target != null ? ' / ' + heroDef.immortalCondition.target : ''}` })
        : null,
      extraStatusText(instance, heroDef)
        ? el('div', { class: 'immortal-progress extra-status-line' }, [
            instance.heroId === 'm_mama' ? el('img', { class: 'extra-status-icon', src: UI_IMAGES.impIcon, alt: '' }) : null,
            el('span', { text: extraStatusText(instance, heroDef) }),
          ])
        : null,
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

  function renderActionRow(state) {
    const mythicBadgeCount = craftableMythicCount(state);
    return el('div', { class: 'action-row' }, [
      el('button', {
        class: 'side-btn', title: '신화',
        onclick: () => { ui.mythicSelectedId = null; openPopup('mythic', state); },
      }, [
        el('img', { src: UI_IMAGES.mythicBtn, alt: '신화' }),
        el('span', { class: 'hex-badge', text: String(mythicBadgeCount) }),
      ]),
      el('button', {
        class: 'summon-btn-wrap', title: '소환',
        disabled: state.gold < state.normalSummonCost || fieldOccupantCount(state) >= state.fieldMaxCapacity,
        onclick: () => apply(summonNormal(state)),
      }, [
        el('img', { src: UI_IMAGES.summonBtn, alt: '소환' }),
        el('span', { class: 'summon-cost-overlay', text: `${state.normalSummonCost}G` }),
      ]),
      el('button', {
        class: 'side-btn', title: '룰렛',
        onclick: () => openPopup('roulette', state),
      }, [el('img', { src: UI_IMAGES.rouletteBtn, alt: '룰렛' })]),
    ]);
  }

  function renderEnhanceOpenBtn(state) {
    return el('button', {
      class: 'enhance-open-btn', title: '강화',
      onclick: () => openPopup('enhance', state),
    }, [el('img', { src: UI_IMAGES.enhanceBtn, alt: '강화' })]);
  }

  const ROULETTE_TIERS = [
    { tier: 'rare', slot: 'left', img: UI_IMAGES.rouletteRare },
    { tier: 'hero', slot: 'left', img: UI_IMAGES.rouletteHero },
    { tier: 'legendary', slot: 'right', img: UI_IMAGES.rouletteLegendary },
  ];

  function renderRoulettePopup(state) {
    const items = ROULETTE_TIERS.map((r) => {
      const cost = ROULETTE_COST[r.slot];
      return el('div', { class: 'roulette-item' }, [
        el('span', { class: 'roulette-pct', text: `${Math.round(ROULETTE_SUCCESS_RATE[r.tier] * 100)}%` }),
        el('button', {
          class: 'roulette-wheel-btn',
          disabled: state.luckstone < cost,
          onclick: () => apply(summonRoulette(state, r.tier, r.slot)),
        }, [
          el('img', { src: r.img, alt: TIER_LABEL[r.tier] }),
          el('span', { class: 'roulette-item-cost' }, [el('img', { src: UI_IMAGES.luckstoneIcon, alt: '' }), el('span', { text: String(cost) })]),
        ]),
      ]);
    });
    return el('div', { class: 'game-popup' }, [
      el('div', { class: 'popup-topbar' }, [
        el('span', { class: 'popup-stat' }, [el('img', { src: UI_IMAGES.luckstoneIcon, alt: '' }), el('span', { text: String(state.luckstone) })]),
        el('span', { class: 'popup-stat', text: `👥 ${fieldOccupantCount(state)}/${state.fieldMaxCapacity}` }),
        el('button', { class: 'popup-close', text: '✕', onclick: () => closePopup(state) }),
      ]),
      el('div', { class: 'roulette-row' }, items),
    ]);
  }

  // 강화 팝업 4칸. "일반 강화"만 실제 메커니즘(enhanceHero, instance.enhanceLevel)과 연결되어
  // 있다. "확률 강화"는 기획서 확정대로 항상 맥스라 상태만 보여준다(눌러도 변화 없음).
  // "영웅/전설 강화"는 대응하는 실제 게임 상태가 없어 잠금(준비 중)으로 노출한다
  // (CLAUDE.md에 근거 정리해둠).
  function renderEnhancePopup(state) {
    const found = selectedInstance(state);
    const canEnhanceCommon = found && state.gold >= ENHANCE_GOLD_COST && state.luckstone >= ENHANCE_LUCKSTONE_COST;
    const cols = [
      el('button', {
        class: 'enhance-col', disabled: !canEnhanceCommon,
        onclick: () => { if (found) apply(enhanceHero(state, found.instance.instanceId)); },
      }, [
        el('img', { class: 'enhance-col-icon', src: UI_IMAGES.enhanceCommon, alt: '일반 강화' }),
        el('span', { class: 'enhance-col-lv', text: found ? `+${found.instance.enhanceLevel}` : '영웅 선택' }),
        el('span', { class: 'enhance-col-cost' }, [el('img', { src: UI_IMAGES.goldIcon, alt: '' }), el('span', { text: String(ENHANCE_GOLD_COST) })]),
      ]),
      el('button', { class: 'enhance-col', disabled: true }, [
        el('img', { class: 'enhance-col-icon', src: UI_IMAGES.enhanceRate, alt: '확률 강화' }),
        el('span', { class: 'enhance-col-lv', text: 'MAX' }),
        el('span', { class: 'enhance-col-locked-label', text: '항상 최대 고정' }),
      ]),
      el('button', { class: 'enhance-col', disabled: true }, [
        el('img', { class: 'enhance-col-icon', src: UI_IMAGES.enhanceEpic, alt: '영웅 강화' }),
        el('span', { class: 'enhance-col-locked-label', text: '준비 중' }),
      ]),
      el('button', { class: 'enhance-col', disabled: true }, [
        el('img', { class: 'enhance-col-icon', src: UI_IMAGES.enhanceLegend, alt: '전설 강화' }),
        el('span', { class: 'enhance-col-locked-label', text: '준비 중' }),
      ]),
    ];
    return el('div', { class: 'game-popup' }, [
      el('div', { class: 'popup-topbar' }, [
        el('span', { class: 'popup-stat' }, [el('img', { src: UI_IMAGES.goldIcon, alt: '' }), el('span', { text: String(Math.floor(state.gold)) })]),
        el('span', { class: 'popup-stat' }, [el('img', { src: UI_IMAGES.luckstoneIcon, alt: '' }), el('span', { text: String(state.luckstone) })]),
        el('button', { class: 'popup-close', text: '✕', onclick: () => closePopup(state) }),
      ]),
      el('div', { class: 'enhance-cols' }, cols),
    ]);
  }

  function renderMythicPopup(state) {
    const allMythics = heroesByTier('mythic');
    if (!ui.mythicSelectedId) {
      ui.mythicSelectedId = allMythics.find((h) => craftMaterialsReady(state, h))?.id ?? allMythics[0]?.id ?? null;
    }
    const selectedDef = HEROES_BY_ID[ui.mythicSelectedId];

    return el('div', { class: 'mythic-popup' }, [
      renderMythicDetailCard(state, selectedDef),
      ui.mythicTab === 'mythic' ? renderMythicGrid(state, allMythics) : renderImmortalGrid(state),
      el('div', { class: 'mythic-tabs' }, [
        el('button', { class: `mythic-tab ${ui.mythicTab === 'mythic' ? 'active' : ''}`, text: '신화', onclick: () => { ui.mythicTab = 'mythic'; render(state); } }),
        el('button', { class: `mythic-tab ${ui.mythicTab === 'immortal' ? 'active' : ''}`, text: '불멸', onclick: () => { ui.mythicTab = 'immortal'; render(state); } }),
      ]),
    ]);
  }

  function craftMaterialsReady(state, heroDef) {
    return (heroDef.synthMaterials ?? []).every((m) => countHeroOnField(state, m.heroId).count >= m.count);
  }

  function renderMythicDetailCard(state, heroDef) {
    if (!heroDef) {
      return el('div', { class: 'mythic-detail-card' }, [el('div', { class: 'mythic-empty-note', text: '신화 등급 영웅이 없습니다.' })]);
    }
    const materials = (heroDef.synthMaterials ?? []).flatMap((m) => {
      const owned = countHeroOnField(state, m.heroId).count;
      const matDef = HEROES_BY_ID[m.heroId];
      return [el('div', { class: `mat ${owned >= m.count ? 'ready' : ''}` }, [
        heroImage(matDef, { className: 'mat-image' }),
        el('span', { class: 'mat-count', text: `${Math.min(owned, m.count)}/${m.count}` }),
      ])];
    });
    const ready = craftMaterialsReady(state, heroDef);
    return el('div', { class: 'mythic-detail-card' }, [
      el('button', { class: 'popup-close', text: '✕', onclick: () => closePopup(state) }),
      el('div', { class: 'mythic-detail-name', text: heroDef.name }, [el('span', { class: 'tier-label', text: TIER_LABEL[heroDef.tier] })]),
      el('div', { class: 'mythic-materials' }, [
        ...materials,
        el('span', { class: 'mat-arrow', text: '→' }),
        el('div', { class: 'mat-result' }, [heroImage(heroDef, { className: 'mat-image' })]),
      ]),
      el('button', {
        class: 'mythic-summon-btn', text: '조합', disabled: !ready,
        onclick: () => apply(craftMythic(state, heroDef.id)),
      }),
    ]);
  }

  function renderMythicGrid(state, allMythics) {
    return el('div', { class: 'mythic-grid' }, allMythics.map((heroDef) => {
      const ready = craftMaterialsReady(state, heroDef);
      const fieldCount = countHeroOnField(state, heroDef.id).count;
      return el('div', {
        class: `mythic-cell ${ready ? 'ready' : ''} ${ui.mythicSelectedId === heroDef.id ? 'selected' : ''}`,
        onclick: () => { ui.mythicSelectedId = heroDef.id; render(state); },
      }, [
        heroImage(heroDef, { className: 'mythic-cell-image' }),
        el('div', { class: 'mythic-progress', text: fieldCount > 0 ? `보유 ${fieldCount}` : (ready ? '조합 가능' : '재료 부족') }),
      ]);
    }));
  }

  // 불멸 탭: 27개 불멸 등급 + N차 변신(사신개구리변신)까지 전부 나열, 실제 승급 조건
  // 충족 여부에 따라 잠김/해금 표시. 판정은 필드에 있는 원본(신화 또는 직전 불멸) 개체의
  // 실제 progress/immortalEligible 값을 그대로 쓴다.
  function immortalUnlockStatus(state, immortalDef) {
    const baseId = immortalDef.baseHeroId;
    const onField = state.field.flatMap((s) => s.occupants).filter((o) => o.heroId === baseId);
    if (!onField.length) return false;
    const baseDef = HEROES_BY_ID[baseId];
    const cond = baseDef?.immortalCondition;
    if (SECOND_STAGE_IMMORTAL[baseId]) return true; // 이미 불멸이면 2차 변신은 언제든 시도 가능
    if (!cond) return false;
    return onField.some((inst) => inst.immortalEligible || cond.target == null || (inst.progress ?? 0) >= cond.target);
  }

  function renderImmortalGrid(state) {
    const allImmortals = [...heroesByTier('immortal')];
    return el('div', { class: 'mythic-grid' }, allImmortals.map((heroDef) => {
      const unlocked = immortalUnlockStatus(state, heroDef);
      return el('div', { class: `mythic-cell ${unlocked ? 'ready' : 'locked'}` }, [
        heroImage(heroDef, { className: 'mythic-cell-image' }),
        el('div', { class: 'mythic-progress', text: unlocked ? '해금' : '잠김' }),
      ]);
    }));
  }

  function renderMissionPopup(state) {
    const items = missionDefinitions().map((def) => {
      const progress = state.missions.find((m) => m.missionId === def.id);
      return el('li', { class: progress?.completed ? 'completed' : '' }, `${def.name}: ${progress?.current ?? 0} / ${def.target} - ${def.description}`);
    });
    return el('div', { class: 'popup-overlay', onclick: (e) => { if (e.target === e.currentTarget) closePopup(state); } }, [
      el('div', { class: 'popup-box' }, [el('h3', { text: '미션' }), el('ul', {}, items), el('button', { class: 'btn', text: '닫기', onclick: () => closePopup(state) })]),
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
