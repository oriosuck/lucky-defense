import { HEROES_BY_ID, TIER_LABEL } from '../data/heroes.js';
import { BOSS_IMAGE, BACKGROUND_IMAGE, TAR_STAGE_IMAGES, DRAGON_DRAIN_IMAGE, FROG_TRANSFORM_IMAGES, STAGE_LAYOUT } from '../data/assets.js';
import { missionDefinitions } from '../logic/missions.js';
import { summonNormal, summonRoulette } from '../logic/summon.js';
import { synthesize, craftMythic, sellHero, feedMythicToChad, sellGigaChad, countHeroOnField } from '../logic/synthesis.js';
import { enhanceHero, moveHero, toggleBreakthrough } from '../logic/actions.js';
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
    mythicPopup: null, // null | 'owned' | 'immortal'
    missionPopup: false,
    roulettePopup: false,
    monsters: [], // 좌->우 굴을 지나가는 장식용 몬스터 애니메이션 상태
    lastMonsterSpawnAt: null,
  };

  function apply(result) {
    if (result?.newState) dispatch(result.newState);
  }

  function render(state) {
    updateMonsterAnimation(state);
    root.innerHTML = '';
    root.appendChild(renderTopBar(state));
    root.appendChild(renderMonsterRow(state));
    root.appendChild(renderFavoriteBar(state));
    root.appendChild(el('div', { class: 'game-stage-wrap' }, [renderStage(state)]));
    root.appendChild(renderResourceRow(state));
    root.appendChild(renderSelectedPanel(state));
    root.appendChild(renderBottomBar(state));
    if (ui.mythicPopup) root.appendChild(renderMythicPopup(state));
    if (ui.missionPopup) root.appendChild(renderMissionPopup(state));
    if (ui.roulettePopup) root.appendChild(renderRoulettePopup(state));
    if (state.result) root.appendChild(renderResultOverlay(state));
  }

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
      stage.appendChild(
        el('div', {
          class: 'stage-monster',
          style: `top:${STAGE_LAYOUT.leftHole.y}%; left:${STAGE_LAYOUT.leftHole.x}%; animation: monster-travel ${MONSTER_TRAVEL_MS}ms linear forwards; animation-delay: -${elapsed}ms;`,
        }, ['👾']),
      );
    }
    stage.appendChild(renderField(state));
    return stage;
  }

  function renderTopBar(state) {
    return el('div', { class: 'top-bar' }, [
      el('span', { class: 'wave-label', text: `WAVE ${state.wave}` }),
      el('span', { class: 'timer', text: `${Math.max(0, Math.ceil(state.waveTimeLeft))}s` }),
      el('span', { class: 'level-label', text: `Lv.${state.wave}` }),
    ]);
  }

  function renderMonsterRow(state) {
    return el('div', { class: 'monster-row' }, [
      el('span', { text: '💀' }),
      el('span', { text: `${Math.floor(state.monsterCount)} / ${state.monsterMax}` }),
    ]);
  }

  function renderFavoriteBar(state) {
    const favorites = state.ownedHeroes.filter((h) => h.favorite);
    return el(
      'div',
      { class: 'favorite-bar' },
      favorites.map((h) =>
        el(
          'button',
          {
            class: 'favorite-icon',
            title: HEROES_BY_ID[h.heroId]?.name,
            onclick: () => moveFavoriteToTopLeft(state, h.heroId),
          },
          [el('img', { src: HEROES_BY_ID[h.heroId]?.image, alt: HEROES_BY_ID[h.heroId]?.name })],
        ),
      ),
    );
  }

  function moveFavoriteToTopLeft(state, heroId) {
    const found = state.field.find((s) => s.occupants.some((o) => o.heroId === heroId));
    if (!found) return;
    const instance = found.occupants.find((o) => o.heroId === heroId);
    apply(moveHero(state, instance.instanceId, 0, 0));
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

  function renderResourceRow(state) {
    return el('div', { class: 'resource-row' }, [
      el('span', { text: `골드 ${Math.floor(state.gold)}` }),
      el('span', { text: `행운석 ${state.luckstone}` }),
      el('span', { text: `인원 ${fieldOccupantCount(state)}/${state.fieldMaxCapacity}` }),
      el('button', {
        class: `btn ${state.speed === 2 ? 'active' : ''}`,
        text: 'x2',
        onclick: () => {
          const next = structuredClone(state);
          next.speed = state.speed === 2 ? 1 : 2;
          dispatch(next);
        },
      }),
      el('button', {
        class: `btn ${state.paused ? 'active' : ''}`,
        text: state.paused ? '재개' : '일시정지',
        onclick: () => {
          const next = structuredClone(state);
          next.paused = !state.paused;
          dispatch(next);
        },
      }),
      el('button', { class: 'btn btn-ghost', text: '나가기', onclick: onExit }),
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
    if (!found) return el('div', { class: 'selected-panel empty', text: '전장의 영웅을 선택하세요' });
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

  function renderBottomBar(state) {
    const mythicOwnedCount = state.ownedHeroes.filter((h) => HEROES_BY_ID[h.heroId]?.tier === 'mythic').length;
    return el('div', { class: 'bottom-bar' }, [
      el('div', { class: 'bottom-bar-row' }, [
        el('button', { class: 'hex-btn hex-mythic', onclick: () => { ui.mythicPopup = 'owned'; render(state); } }, [
          el('span', { class: 'hex-icon', text: '🔮' }),
          el('span', { class: 'hex-label', text: '신화' }),
          el('span', { class: 'hex-badge', text: String(mythicOwnedCount) }),
        ]),
        el('button', {
          class: 'summon-btn-main',
          onclick: () => apply(summonNormal(state)),
        }, [
          el('span', { class: 'summon-label', text: '소환' }),
          el('span', { class: 'summon-cost', text: `🪙 ${state.normalSummonCost}` }),
        ]),
        el('button', { class: 'hex-btn hex-roulette-main', onclick: () => { ui.roulettePopup = true; render(state); } }, [
          el('span', { class: 'hex-icon', text: '✨' }),
          el('span', { class: 'hex-label', text: '룰렛' }),
        ]),
        el('button', { class: 'hex-btn hex-mission', onclick: () => { ui.missionPopup = true; render(state); } }, [
          el('span', { class: 'hex-icon', text: '☰' }),
        ]),
      ]),
      el('button', {
        class: 'enhance-btn-full',
        text: '⬆ 강화',
        disabled: !ui.selectedInstanceId,
        onclick: () => apply(enhanceHero(state, ui.selectedInstanceId)),
      }),
    ]);
  }

  const ROULETTE_TIERS = [
    { tier: 'rare', slot: 'left', label: '희귀', cost: 1, colorClass: 'roulette-blue' },
    { tier: 'hero', slot: 'left', label: '영웅', cost: 1, colorClass: 'roulette-purple' },
    { tier: 'legendary', slot: 'right', label: '전설', cost: 2, colorClass: 'roulette-gold' },
  ];

  function renderRoulettePopup(state) {
    const circles = ROULETTE_TIERS.map((r) =>
      el('div', { class: 'roulette-item' }, [
        el('button', {
          class: `roulette-circle ${r.colorClass}`,
          disabled: state.luckstone < r.cost,
          onclick: () => apply(summonRoulette(state, r.tier, r.slot)),
        }, [el('span', { class: 'roulette-circle-label', text: r.label })]),
        el('div', { class: 'roulette-price', text: `💎 ${r.cost}` }),
      ]),
    );
    return el('div', { class: 'popup-overlay', onclick: (e) => { if (e.target === e.currentTarget) { ui.roulettePopup = false; render(state); } } }, [
      el('div', { class: 'popup-box roulette-popup-box' }, [
        el('h3', { text: `룰렛 (보유 💎 ${state.luckstone})` }),
        el('div', { class: 'roulette-row' }, circles),
        el('button', { class: 'btn', text: '닫기', onclick: () => { ui.roulettePopup = false; render(state); } }),
      ]),
    ]);
  }

  function renderMythicPopup(state) {
    const ownedMythicIds = state.ownedHeroes
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
          el('img', { class: 'mythic-list-image', src: heroDef.image, alt: heroDef.name }),
          el('span', { text: `${heroDef.name} ` }),
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
          el('img', { class: 'mythic-list-image', src: heroImage(instance, heroDef), alt: heroDef.name }),
          el('span', { text: `${cond.name}: ${Math.floor(instance.progress ?? 0)}${cond.target != null ? ' / ' + cond.target : ''}` }),
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

  render(getState());
  return {
    root,
    update(state) {
      render(state);
    },
  };
}
