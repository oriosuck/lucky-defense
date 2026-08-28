import { HEROES_BY_ID, TIER_LABEL } from '../data/heroes.js';
import { BOSS_IMAGE, BACKGROUND_IMAGE, TAR_STAGE_IMAGES, DRAGON_DRAIN_IMAGE, FROG_TRANSFORM_IMAGES, STAGE_LAYOUT, UI_IMAGES } from '../data/assets.js';
import { missionDefinitions } from '../logic/missions.js';
import { summonNormal, summonRoulette } from '../logic/summon.js';
import { synthesize, craftMythic, sellHero, feedMythicToChad, sellGigaChad, countHeroOnField, instantSummonFavorite } from '../logic/synthesis.js';
import {
  enhanceHero, moveHero, toggleBreakthrough, ENHANCE_GOLD_COST, ENHANCE_LUCKSTONE_COST,
  GLOBAL_UPGRADE_TRACKS, GLOBAL_UPGRADE_MAX_LEVEL, globalUpgradeCost, upgradeGlobalTrack,
} from '../logic/actions.js';
import { checkImmortalPromotion, cannibalizeTar } from '../logic/immortal.js';
import { fieldOccupantCount } from '../state/gameState.js';
import { el } from './components/dom.js';

/**
 * @param {{ getState:()=>object, dispatch:(s:object)=>void, onExit:()=>void }} props
 * @returns {{root:HTMLElement, update:(s:object)=>void}}
 */
export function GameScreen({ getState, dispatch, onExit }) {
  const root = el('div', { class: 'screen game-screen' });
  const ui = {
    selectedInstanceId: null,
    moveMode: false,
    mythicPopup: null, // null | { tab: 'mythic'|'immortal', selectedId: string|null }
    missionPopup: false,
    roulettePopup: false,
    enhancePopup: false,
    monsters: [], // 좌->우 굴을 지나가는 장식용 몬스터 애니메이션 상태
    lastMonsterSpawnAt: null,
  };

  function apply(result) {
    if (result?.newState) dispatch(result.newState);
  }

  const STAGE_RATIO = 688 / 1508;

  // CSS만으로는 "가로/세로 중 더 좁게 막히는 쪽 기준으로 비율 유지"가 안정적으로
  // 안 돼서(정사각형에 가까운 화면 등에서 배경이 눌려 보임) 실측해서 픽셀로 못박는다.
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
    if (ui.enhancePopup) root.appendChild(renderEnhancePopup(state));
    if (state.result) root.appendChild(renderResultOverlay(state));
  }

  window.addEventListener('resize', () => {
    if (root.isConnected) render(getState());
  });

  const MONSTER_SPAWN_INTERVAL_MS = 800; // 8초에 10마리
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
    const stage = el('div', { class: 'game-stage', style: `background-image: url(${BACKGROUND_IMAGE})` });
    stage.appendChild(
      el('img', {
        class: 'stage-boss',
        src: BOSS_IMAGE,
        alt: '보스',
        style: `left:${STAGE_LAYOUT.boss.left}%; top:${STAGE_LAYOUT.boss.top}%; width:${STAGE_LAYOUT.boss.width}%; height:${STAGE_LAYOUT.boss.height}%;`,
      }),
    );
    const now = Date.now();
    for (const m of ui.monsters) {
      const elapsed = Math.max(0, now - m.bornAt);
      // 해골 이미지는 룰렛 실패 표시 전용 자산이라 몬스터에는 쓰지 않는다(전용 이미지 미보유 -> 이모지로 대체).
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
    return el('div', { class: 'top-bar', style: `background-image: url(${UI_IMAGES.waveBar})` }, [
      el('div', { class: 'top-bar-wave' }, [
        el('span', { class: 'wave-label', text: `WAVE ${state.wave}` }),
        el('span', { class: 'timer', text: `${Math.max(0, Math.ceil(state.waveTimeLeft))}s` }),
      ]),
      el('div', { class: 'top-bar-level', text: `Lv.${state.wave}` }),
    ]);
  }

  function renderMonsterRow(state) {
    return el('div', { class: 'monster-row', style: `background-image: url(${UI_IMAGES.monsterBar})` }, [
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
    const favoriteIds = new Set(state.ownedHeroes.filter((h) => h.favorite).map((h) => h.heroId));
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
        return el(
          'button',
          {
            class: 'favorite-icon',
            title: HEROES_BY_ID[heroId]?.name,
            disabled: !unlocked,
            onclick: unlocked ? () => apply(instantSummonFavorite(state, heroId)) : undefined,
          },
          [
            el('img', { src: HEROES_BY_ID[heroId]?.image, alt: HEROES_BY_ID[heroId]?.name }),
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
        cell.appendChild(
          el('div', { class: `hero-token tier-${heroDef.tier}${occ.instanceId === ui.selectedInstanceId ? ' selected' : ''}` }, [
            el('img', { class: 'hero-token-image', src: heroImage(occ, heroDef), alt: heroDef.name }),
            occ.enhanceLevel ? el('span', { class: 'enhance-badge', text: `+${occ.enhanceLevel}` }) : null,
          ]),
        );
      });
      if (isIncapacitated(state, slot)) cell.appendChild(el('div', { class: 'incapacitate-mark', text: '😵' }));
      if (isDeleteTarget(state, slot)) cell.appendChild(el('div', { class: 'delete-mark', text: '❌' }));
      grid.appendChild(cell);
    }
    return grid;
  }

  function heroImage(instance, heroDef) {
    if (heroDef.id === 'm_tar') return TAR_STAGE_IMAGES[instance.tarStage ?? 1];
    if (heroDef.id === 'm_dragon' && instance.immortalEligible) return DRAGON_DRAIN_IMAGE;
    return heroDef.image;
  }

  function isIncapacitated(state, slot) {
    const ev = state.eventLog.incapacitateEvent;
    return ev && ev.phase === 'active' && ev.targetSlots.some((t) => t.row === slot.row && t.col === slot.col);
  }
  function isDeleteTarget(state, slot) {
    const ev = state.eventLog.deleteEvent;
    return ev && ev.phase === 'filling' && ev.targetSlots.some((t) => t.row === slot.row && t.col === slot.col);
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
      el('div', { class: 'resource-bar-image', style: `background-image: url(${UI_IMAGES.resourceBar})` }, [
        el('span', { class: 'resource-value resource-gold', text: `${Math.floor(state.gold)}` }),
        el('span', { class: 'resource-value resource-luckstone', text: `${state.luckstone}` }),
        el('span', { class: 'resource-value resource-pop', text: `${fieldOccupantCount(state)}` }),
        el('span', { class: 'resource-value resource-pop-max', text: `${state.fieldMaxCapacity}` }),
      ]),
      el('button', {
        class: 'speed-toggle-btn',
        style: `background-image: url(${state.speed === 2 ? UI_IMAGES.speed2xOn : UI_IMAGES.speed2xOff})`,
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
    buttons.push(el('button', {
      class: 'btn',
      text: `강화 (🍞${ENHANCE_GOLD_COST} 💧${ENHANCE_LUCKSTONE_COST})`,
      disabled: state.gold < ENHANCE_GOLD_COST || state.luckstone < ENHANCE_LUCKSTONE_COST,
      onclick: () => apply(enhanceHero(state, instance.instanceId)),
    }));

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
        el('img', { class: 'selected-image', src: heroImage(instance, heroDef), alt: heroDef.name }),
        el('div', { class: 'selected-title', text: `${heroDef.name} (${TIER_LABEL[heroDef.tier]}) +${instance.enhanceLevel}` }),
        FROG_TRANSFORM_IMAGES[instance.heroId]
          ? el('img', { class: 'selected-image transform', src: FROG_TRANSFORM_IMAGES[instance.heroId], alt: '변신 모습', title: '변신 모습' })
          : null,
      ]),
      heroDef.immortalCondition
        ? el('div', { class: 'immortal-progress', text: `불멸 진행도: ${Math.floor(instance.progress ?? 0)}${heroDef.immortalCondition.target != null ? ' / ' + heroDef.immortalCondition.target : ''}` })
        : null,
      el('div', { class: 'action-buttons' }, buttons),
    ]);
  }

  function renderBottomOverlay(state) {
    const mythicOwnedCount = state.ownedHeroes.filter((h) => HEROES_BY_ID[h.heroId]?.tier === 'mythic').length;
    return el('div', { class: 'stage-bottom-overlay' }, [
      el('div', { class: 'stage-bottom-row' }, [
        el('button', {
          class: 'img-btn mythic-btn-img',
          style: `background-image: url(${UI_IMAGES.mythicBtn})`,
          onclick: () => { ui.mythicPopup = { tab: 'mythic', selectedId: null }; render(state); },
        }, [el('span', { class: 'hex-badge', text: String(mythicOwnedCount) })]),
        el('button', {
          class: 'img-btn summon-btn-img',
          style: `background-image: url(${UI_IMAGES.summonBtn})`,
          onclick: () => apply(summonNormal(state)),
        }, [el('span', { class: 'summon-cost-overlay', text: String(state.normalSummonCost) })]),
        el('button', {
          class: 'img-btn roulette-btn-img',
          style: `background-image: url(${UI_IMAGES.rouletteBtn})`,
          onclick: () => { ui.roulettePopup = true; render(state); },
        }),
        el('button', { class: 'hex-btn hex-mission', onclick: () => { ui.missionPopup = true; render(state); } }, [
          el('span', { class: 'hex-icon', text: '☰' }),
        ]),
      ]),
      el('div', { class: 'stage-enhance-row' }, [
        el('button', {
          class: 'img-btn enhance-btn-img',
          style: `background-image: url(${UI_IMAGES.enhanceBtn})`,
          onclick: () => { ui.enhancePopup = true; render(state); },
        }),
      ]),
    ]);
  }

  const ROULETTE_TIERS = [
    { tier: 'rare', slot: 'left', cost: 1, img: UI_IMAGES.rouletteRare, cls: 'rr-rare' },
    { tier: 'hero', slot: 'left', cost: 1, img: UI_IMAGES.rouletteHero, cls: 'rr-hero' },
    { tier: 'legendary', slot: 'right', cost: 2, img: UI_IMAGES.rouletteLegendary, cls: 'rr-legendary' },
  ];

  function renderRoulettePopup(state) {
    const circles = ROULETTE_TIERS.map((r) =>
      el('button', {
        class: `roulette-item-btn ${r.cls}`,
        style: `background-image: url(${r.img})`,
        disabled: state.luckstone < r.cost,
        onclick: () => apply(summonRoulette(state, r.tier, r.slot)),
      }, [el('span', { class: 'roulette-item-cost', text: String(r.cost) })]),
    );
    return el('div', { class: 'popup-overlay', onclick: (e) => { if (e.target === e.currentTarget) { ui.roulettePopup = false; render(state); } } }, [
      el('div', { class: 'roulette-popup-frame', style: `background-image: url(${UI_IMAGES.roulettePopupBg})` }, [
        // 배경 아트 상단에 보석/인원 아이콘 + "/" 구분자가 이미 그려져 있어서, 그 자리에 숫자만 얹는다.
        el('span', { class: 'roulette-status-luckstone', text: String(state.luckstone) }),
        el('span', { class: 'roulette-status-field-cur', text: String(fieldOccupantCount(state)) }),
        el('span', { class: 'roulette-status-field-max', text: String(state.fieldMaxCapacity) }),
        el('button', { class: 'roulette-popup-close', text: '✕', onclick: () => { ui.roulettePopup = false; render(state); } }),
        el('div', { class: 'roulette-row' }, circles),
      ]),
    ]);
  }

  // 하단 "강화" 버튼: 영웅 선택 여부와 무관하게 항상 열리는 등급대별 전체 강화 팝업(실제 게임 화면 기준).
  function renderEnhancePopup(state) {
    const cards = Object.entries(GLOBAL_UPGRADE_TRACKS).map(([key, track]) => {
      const level = state.globalUpgrades[key];
      const maxed = level >= GLOBAL_UPGRADE_MAX_LEVEL;
      const cost = maxed ? null : globalUpgradeCost(key, level);
      const afford = !maxed && (track.currency === 'gold' ? state.gold >= cost : state.luckstone >= cost);
      return el('div', { class: 'enhance-track-card' }, [
        el('div', { class: 'enhance-track-label', text: track.label }),
        el('div', { class: 'enhance-track-level', text: `Lv.${level}` }),
        el('button', {
          class: 'btn enhance-track-buy',
          disabled: maxed || !afford,
          text: maxed ? 'MAX' : `${track.currency === 'gold' ? '🍞' : '💧'}${cost}`,
          onclick: () => apply(upgradeGlobalTrack(state, key)),
        }),
      ]);
    });
    return el('div', { class: 'popup-overlay popup-overlay-bottom', onclick: (e) => { if (e.target === e.currentTarget) { ui.enhancePopup = false; render(state); } } }, [
      el('div', { class: 'enhance-popup-box' }, [
        el('div', { class: 'enhance-popup-header' }, [
          el('span', { class: 'enhance-popup-currency', text: `🍞 ${Math.floor(state.gold)}` }),
          el('span', { class: 'enhance-popup-currency', text: `💧 ${state.luckstone}` }),
          el('button', { class: 'enhance-popup-close', text: '✕', onclick: () => { ui.enhancePopup = false; render(state); } }),
        ]),
        el('div', { class: 'enhance-track-row' }, cards),
      ]),
    ]);
  }

  // 신화 재료 확보율(%) - 조합 재료가 없는 영웅(예외 없음, 신화는 전부 조합 전용)은 항상 100.
  function mythicMaterialsProgress(state, heroDef) {
    const mats = heroDef.synthMaterials ?? [];
    if (!mats.length) return 100;
    let have = 0;
    let need = 0;
    for (const m of mats) {
      have += Math.min(countHeroOnField(state, m.heroId).count, m.count);
      need += m.count;
    }
    return need ? Math.round((have / need) * 100) : 100;
  }

  // 신화 버튼 팝업: 위쪽 = 선택된 조합 레시피(재료 보유 체크 + 소환 버튼), 아래쪽 = 보유 영웅 그리드(진행률 표시).
  // 실제 게임 화면 기준. 하단 탭으로 "신화"(조합)와 "불멸"(승급 진행도)을 전환한다.
  function renderMythicPopup(state) {
    const popupState = ui.mythicPopup;
    const ownedMythicIds = state.ownedHeroes
      .map((h) => h.heroId)
      .filter((id) => HEROES_BY_ID[id]?.tier === 'mythic');
    const favoriteIds = new Set(state.ownedHeroes.filter((h) => h.favorite).map((h) => h.heroId));

    const tabs = el('div', { class: 'popup-tabs mythic-popup-tabs' }, [
      el('button', { class: `btn ${popupState.tab === 'mythic' ? 'active' : ''}`, text: '신화', onclick: () => { popupState.tab = 'mythic'; render(state); } }),
      el('button', { class: `btn ${popupState.tab === 'immortal' ? 'active' : ''}`, text: '불멸', onclick: () => { popupState.tab = 'immortal'; render(state); } }),
    ]);

    let body;
    if (popupState.tab === 'mythic') {
      let selectedId = popupState.selectedId && ownedMythicIds.includes(popupState.selectedId) ? popupState.selectedId : null;
      if (!selectedId) {
        selectedId = ownedMythicIds.find((id) => mythicMaterialsProgress(state, HEROES_BY_ID[id]) >= 100) ?? ownedMythicIds[0] ?? null;
      }
      const selectedDef = selectedId ? HEROES_BY_ID[selectedId] : null;

      let recipePanel;
      if (selectedDef) {
        const mats = selectedDef.synthMaterials ?? [];
        const missing = mats.filter((m) => countHeroOnField(state, m.heroId).count < m.count);
        recipePanel = el('div', { class: 'mythic-recipe-panel' }, [
          el('div', { class: 'mythic-recipe-title', text: selectedDef.name }),
          el('div', { class: 'mythic-recipe-materials' }, mats.map((m) => {
            const matDef = HEROES_BY_ID[m.heroId];
            const owned = countHeroOnField(state, m.heroId).count >= m.count;
            return el('div', { class: `mythic-recipe-material ${owned ? 'owned' : 'missing'}` }, [
              el('img', { src: matDef.image, alt: matDef.name }),
              el('span', { class: 'mythic-recipe-material-check', text: owned ? '✔' : '✕' }),
            ]);
          })),
          el('span', { class: 'mythic-recipe-arrow', text: '→' }),
          el('img', { class: 'mythic-recipe-result', src: selectedDef.image, alt: selectedDef.name }),
          el('button', {
            class: 'btn btn-primary mythic-recipe-summon', text: '소환', disabled: missing.length > 0,
            onclick: () => apply(craftMythic(state, selectedId)),
          }),
        ]);
      } else {
        recipePanel = el('div', { class: 'mythic-recipe-empty', text: '영웅 선택 화면에서 신화 영웅을 먼저 보유로 선택해 주세요.' });
      }

      const grid = el('div', { class: 'mythic-grid' }, ownedMythicIds.map((id) => {
        const def = HEROES_BY_ID[id];
        const pct = mythicMaterialsProgress(state, def);
        return el('button', {
          class: `mythic-grid-item ${id === selectedId ? 'selected' : ''}`,
          onclick: () => { popupState.selectedId = id; render(state); },
        }, [
          favoriteIds.has(id) ? el('span', { class: 'mythic-grid-star', text: '★' }) : null,
          el('img', { src: def.image, alt: def.name }),
          el('span', { class: 'mythic-grid-progress', text: `진행률 ${pct}%` }),
        ]);
      }));

      body = el('div', { class: 'mythic-popup-body' }, [recipePanel, grid]);
    } else {
      const activeMythics = state.field.flatMap((s) => s.occupants.filter((o) => HEROES_BY_ID[o.heroId]?.tier === 'mythic'));
      body = activeMythics.length
        ? el('ul', { class: 'mythic-list' }, activeMythics.map((instance) => {
          const heroDef = HEROES_BY_ID[instance.heroId];
          const cond = heroDef.immortalCondition;
          return el('li', {}, [
            el('img', { class: 'mythic-list-image', src: heroImage(instance, heroDef), alt: heroDef.name }),
            el('span', { text: `${cond.name}: ${Math.floor(instance.progress ?? 0)}${cond.target != null ? ' / ' + cond.target : ''}` }),
          ]);
        }))
        : el('div', { text: '필드에 배치된 신화 등급 영웅이 없습니다.' });
    }

    return el('div', { class: 'popup-overlay', onclick: (e) => { if (e.target === e.currentTarget) { ui.mythicPopup = null; render(state); } } }, [
      el('div', { class: 'popup-box mythic-popup-box' }, [tabs, body, el('button', { class: 'btn', text: '닫기', onclick: () => { ui.mythicPopup = null; render(state); } })]),
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

  render(getState());
  return {
    root,
    update(state) {
      render(state);
    },
  };
}
