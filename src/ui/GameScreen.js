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
  upgradeGlobalEnhance,
  ENHANCE_GOLD_COST,
  ENHANCE_LUCKSTONE_COST,
} from '../logic/actions.js';
import { checkImmortalPromotion, isImmortalPromotionReady, cannibalizeTar, attemptSecondStageEvolution } from '../logic/immortal.js';
import { IMMOBILIZE_GAUGE_FILL_SEC } from '../logic/waveEvents.js';
import { GLOBAL_ENHANCE_TRACKS, GLOBAL_ENHANCE_LABEL, GLOBAL_ENHANCE_COST, GLOBAL_ENHANCE_MAX_LEVEL } from '../data/constants.js';
import { fieldOccupantCount, FIELD_ROWS, FIELD_COLS } from '../state/gameState.js';
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
    popup: null, // null | 'mythic' | 'roulette' | 'enhance' | 'mission'
    mythicTab: 'mythic', // 'mythic' | 'immortal'
    mythicSelectedId: null,
    spinningTier: null, // 룰렛 스핀 연출 중인 등급
    rouletteFailTier: null, // 방금 실패해서 해골을 잠깐 보여줄 등급
    monsters: [], // 좌->우 굴을 지나가는 장식용 몬스터 애니메이션 상태
    monsterSpawnWave: null, // 아래 두 필드가 몇 라운드 기준인지(라운드 바뀌면 리셋)
    monsterSpawnedCount: 0, // 이번 라운드에 지금까지 스폰한 장식용 몬스터 수
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
    // 0.2초마다 전체 DOM을 갈아엎다 보니 신화 팝업의 등급 그리드(.mythic-grid,
    // overflow-y:auto)도 매번 새 엘리먼트로 다시 생겨서 scrollTop이 계속 0으로
    // 리셋됐다 - 사용자가 스크롤을 내려도 다음 렌더에서 바로 맨 위로 튕겨 보이니
    // "스크롤이 안 된다"로 보였다. 재생성 직전 스크롤 위치를 저장했다가 재생성 직후
    // 그대로 복원한다(같은 클래스의 새 노드에 값만 옮겨 붙이는 방식).
    const prevScrollEl = root.querySelector('.mythic-grid');
    const prevScrollTop = prevScrollEl ? prevScrollEl.scrollTop : null;
    root.innerHTML = '';
    const stage = renderStage(state);
    const stageWrap = el('div', { class: 'game-stage-wrap' }, [stage]);
    root.appendChild(stageWrap);
    sizeStageToFit(stageWrap, stage);
    if (prevScrollTop != null) {
      const newScrollEl = root.querySelector('.mythic-grid');
      if (newScrollEl) newScrollEl.scrollTop = prevScrollTop;
    }
  }

  window.addEventListener('resize', () => {
    if (root.isConnected) render(getState());
  });

  // 게임 루프가 0.2초마다 전체 DOM을 다시 그리는데, 그 사이에 클릭(mousedown~mouseup)이
  // 걸리면 누르고 있던 버튼이 통째로 교체돼서 클릭이 씹히는 문제가 있었다(매번 두 번씩
  // 눌러야 겨우 눌리던 버그의 원인). 포인터가 눌려있는 동안에는 주기적 재렌더링을 건너뛰고,
  // 클릭 핸들러 안에서 직접 호출하는 render()는 그대로 즉시 반영되게 둔다. 이 가드
  // 덕분에 드래그하는 동안(pointerdown~pointerup) DOM 노드가 안 바뀌므로, 포인터
  // 캡처로 잡은 시작 칸 엘리먼트가 드롭 시점까지 그대로 유지된다.
  let pointerDown = false;

  // 칸 드래그 이동: 버튼 클릭 대신 영웅이 있는 칸을 다른 칸으로 직접 드래그해서
  // 옮긴다(사용자 요청 - "이동은 버튼이 아니라 드래그 방식으로"). 이동량이 거의
  // 없으면(제자리에서 뗌) 기존처럼 탭으로 취급해 선택만 토글한다.
  const DRAG_MOVE_THRESHOLD_PX = 8;
  let dragState = null; // { instanceId, fromRow, fromCol, startX, startY, moved }
  let dragHoverEl = null;

  function setDragHover(el) {
    if (dragHoverEl === el) return;
    if (dragHoverEl) dragHoverEl.classList.remove('drag-hover');
    dragHoverEl = el;
    if (dragHoverEl) dragHoverEl.classList.add('drag-hover');
  }

  root.addEventListener('pointerdown', (e) => {
    pointerDown = true;
    const cellEl = e.target.closest('.field-slot');
    if (!cellEl || ui.popup) return;
    const row = Number(cellEl.dataset.row);
    const col = Number(cellEl.dataset.col);
    const state = getState();
    const slot = state.field.find((s) => s.row === row && s.col === col);
    if (!slot || slot.occupants.length === 0) return;
    dragState = {
      instanceId: slot.occupants[0].instanceId,
      fromRow: row, fromCol: col,
      startX: e.clientX, startY: e.clientY, moved: false,
      // 이동불능(속박) 상태인 칸은 탭 선택은 그대로 되지만 실제 드래그 이동은
      // endDrag에서 막는다(보스 이동불능 이벤트 지속 시간 동안 캐릭터를 움직일 수
      // 있던 버그 리포트 반영).
      immobilized: isImmobilized(state, slot),
    };
    cellEl.classList.add('dragging-source');
  });

  window.addEventListener('pointermove', (e) => {
    if (!dragState) return;
    if (!dragState.moved) {
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      if (Math.hypot(dx, dy) < DRAG_MOVE_THRESHOLD_PX) return;
      dragState.moved = true;
    }
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const cellEl = target?.closest('.field-slot');
    setDragHover(cellEl ?? null);
  });

  function endDrag(e) {
    pointerDown = false;
    if (!dragState) return;
    const sourceEl = root.querySelector('.dragging-source');
    if (sourceEl) sourceEl.classList.remove('dragging-source');
    setDragHover(null);
    const { instanceId, fromRow, fromCol, moved, immobilized } = dragState;
    dragState = null;
    if (!moved) {
      // 이동량이 거의 없으면 드래그가 아니라 탭 - 기존 선택 토글 동작을 그대로 수행.
      // (이동불능이어도 정보 확인용 선택은 막지 않는다 - 실제 이동만 아래에서 막음)
      const state = getState();
      const slot = state.field.find((s) => s.row === fromRow && s.col === fromCol);
      if (slot) onSlotClick(state, slot);
      return;
    }
    if (immobilized) return; // 이동불능 상태에선 드래그 이동 자체가 성립하지 않는다
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const cellEl = target?.closest('.field-slot');
    if (!cellEl) return;
    const toRow = Number(cellEl.dataset.row);
    const toCol = Number(cellEl.dataset.col);
    if (toRow === fromRow && toCol === fromCol) return;
    apply(moveHero(getState(), instanceId, toRow, toCol));
  }

  window.addEventListener('pointerup', (e) => { endDrag(e); });
  window.addEventListener('pointercancel', () => {
    pointerDown = false;
    const sourceEl = root.querySelector('.dragging-source');
    if (sourceEl) sourceEl.classList.remove('dragging-source');
    setDragHover(null);
    dragState = null;
  });

  const MONSTER_TRAVEL_MS = 10400; // 기존 2600ms의 4배로 느리게(사용자 요청)

  // 장식용 몬스터 스프라이트 개수를 몬스터 카운트 바에 표시되는 값(state.monsterCount)과
  // 항상 정확히 같게 유지한다 - 예전엔 몬스터가 한 바퀴(MONSTER_TRAVEL_MS) 돌고 나면
  // 사라지는 "1회성 애니메이션"이라 화면에 몇 마리가 보이든 카운트 숫자와 무관하게
  // 항상 비슷한 수(약 4마리)만 떠 있었다 - 이제는 스프라이트가 사라지지 않고 계속
  // 경로를 무한 반복하며, 개수 자체가 카운트를 그대로 따라간다(카운트가 늘면 새
  // 스프라이트 추가, 줄면 제거).
  //
  // 각 몬스터는 고정 delayMs가 아니라 실제 스폰 시각(spawnTime, performance.now()
  // 기준)을 저장해둔다 - 게임 루프가 0.2초마다 전체 DOM을 다시 그리는데(main.js
  // RENDER_INTERVAL_SEC), 고정 delayMs를 매번 그대로 animation-delay에 넣으면 새로
  // 생성된 <div>의 CSS 애니메이션이 항상 그 "같은 지점"에서부터 다시 0.2초만 재생되고
  // 리셋되기를 반복해서, 경로 전체(10.4초)를 도는 대신 제자리에서 아주 짧은 구간만
  // 왔다갔다하며 깜빡이는 것처럼 보였다("몬스터가 제자리에서 좌우로 왔다갔다하고
  // 중간에서 튀어나온다"는 리포트의 원인). 실제 경과 시간을 매 렌더마다 다시 계산해서
  // animation-delay를 그때그때 갱신해야 재생성되어도 애니메이션이 끊기지 않고
  // 이어진다.
  function updateMonsterAnimation(state) {
    const active = state.wave >= 1 && !state.result;
    const target = active ? Math.floor(state.monsterCount) : 0;
    while (ui.monsters.length < target) {
      // 전부 같은 타이밍에 나오면 한 덩어리로 뭉쳐 보이므로, 경로 한 바퀴(MONSTER_TRAVEL_MS)
      // 안에서 랜덤한 시점부터 시작한 것처럼 스폰 시각을 과거로 흩뿌린다.
      const staggerMs = Math.random() * MONSTER_TRAVEL_MS;
      ui.monsters.push({ id: `mon_${Date.now()}_${Math.random()}`, spawnTime: performance.now() - staggerMs });
    }
    if (ui.monsters.length > target) ui.monsters.length = target;
  }

  function renderStage(state) {
    const stage = el('div', { class: 'game-stage' });
    stage.appendChild(renderTopBadge(state));
    stage.appendChild(renderMonsterRow(state));
    stage.appendChild(renderBoss(state));
    const holeEffects = renderHoleEffects(state);
    if (holeEffects) stage.appendChild(holeEffects);
    for (const m of ui.monsters) {
      const phaseMs = (performance.now() - m.spawnTime) % MONSTER_TRAVEL_MS;
      stage.appendChild(
        el('div', {
          class: 'stage-monster',
          style: `top:${STAGE_LAYOUT.leftHole.y}%; left:${STAGE_LAYOUT.leftHole.x}%; animation: monster-travel ${MONSTER_TRAVEL_MS}ms linear infinite; animation-delay: -${phaseMs}ms;`,
        }, [el('img', { src: UI_IMAGES.monsterIcon, alt: '몬스터' })]),
      );
    }
    stage.appendChild(renderField(state));
    const quickActions = renderCellQuickActions(state);
    if (quickActions) stage.appendChild(quickActions);
    stage.appendChild(renderFavoriteBar(state));
    stage.appendChild(renderStageControls(state));
    stage.appendChild(renderResourceRow(state));
    stage.appendChild(renderSideControls(state));
    stage.appendChild(renderActionRow(state));
    stage.appendChild(renderEnhanceOpenBtn(state));
    if (ui.popup === 'roulette') stage.appendChild(renderRoulettePopup(state));
    if (ui.popup === 'enhance') stage.appendChild(renderEnhancePopup(state));
    if (ui.popup === 'mythic') stage.appendChild(renderMythicPopup(state));
    if (ui.popup === 'mission') stage.appendChild(renderMissionPopup(state));
    if (state.result) stage.appendChild(renderResultOverlay(state));
    return stage;
  }

  function formatClock(sec) {
    const s = Math.max(0, Math.ceil(sec));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function renderTopBadge(state) {
    return el('div', { class: 'top-badge' }, [
      el('span', { class: 'top-badge-label', text: `WAVE ${state.wave}` }),
      el('span', { class: 'top-badge-value', text: formatClock(state.waveTimeLeft) }),
    ]);
  }

  // 몬스터 카운트는 필드 누적치(state.monsterCount, 최대 state.monsterMax=110)를
  // 그대로 보여준다 - 라운드당 40마리(MONSTER_PER_ROUND)는 매 라운드 이 누적치에
  // 트리클로 더해지는 "증가분"일 뿐, 화면에 표시되는 최대값과는 다른 개념이다
  // (waveEvents.js의 tickWave 참고). 헷갈려서 한 번 40을 최대값으로 잘못 표시했었다.
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

  // 좌우 굴에 보라색 소용돌이(몬스터 등장 지점 강조)를 항상 띄우고, 라운드 종료
  // 5초 전부터는 왼쪽 굴 위에 카운트다운 배지를 추가로 띄운다.
  function renderHoleEffects(state) {
    if (state.wave < 1 || state.result) return null;
    const nodes = [
      el('div', { class: 'hole-vortex', style: `left:${STAGE_LAYOUT.leftHole.x}%; top:${STAGE_LAYOUT.leftHole.y}%;` }),
      el('div', { class: 'hole-vortex', style: `left:${STAGE_LAYOUT.rightHole.x}%; top:${STAGE_LAYOUT.rightHole.y}%;` }),
    ];
    const secLeft = Math.ceil(state.waveTimeLeft);
    if (secLeft >= 1 && secLeft <= 5) {
      nodes.push(el('div', {
        class: 'hole-countdown',
        style: `left:${STAGE_LAYOUT.leftHole.x}%; top:${STAGE_LAYOUT.leftHole.y}%;`,
      }, [
        el('span', { class: 'hole-countdown-icon', text: '⏱️' }),
        el('span', { class: 'hole-countdown-num', text: String(secLeft) }),
      ]));
    }
    return el('div', { class: 'hole-effects' }, nodes);
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

  // 좌측 세로 아이콘 목록. 두 종류를 함께 보여준다:
  // 1) 승급 가능한 불멸 - 조건을 채운 신화 개체를 칸 클릭 후 아래 "승급 시도" 버튼이
  //    아니라 신화 조합과 똑같은 방식으로 왼쪽 아이콘에 노출한다(사용자 지정 규칙 -
  //    "불멸이 먼저, 신화가 밑으로"). instance별 판정이라 heroId가 아니라 instanceId
  //    기준으로 찾는다.
  // 2) 지금 조합 가능한 신화("필드에 있는 신화"가 아니라 재료가 갖춰진 신화 - 기획서
  //    명시 사항) + 이미 한 번 조합해서 무료 즉시소환이 풀린 신화.
  // 정렬은 불멸 승급 후보를 항상 앞에 두고, 그 안에서/신화 목록 안에서는 각각
  // 즐겨찾기 우선.
  function favoriteBarItems(state) {
    const favoriteIds = new Set(state.heroSettings.filter((h) => h.favorite).map((h) => h.heroId));

    const promoteItems = [];
    for (const slot of state.field) {
      for (const occ of slot.occupants) {
        const heroDef = HEROES_BY_ID[occ.heroId];
        if (heroDef?.tier === 'mythic' && heroDef.immortalCondition && isImmortalPromotionReady(state, occ.instanceId)) {
          promoteItems.push({ kind: 'promote', instanceId: occ.instanceId, heroId: occ.heroId });
        }
      }
    }
    promoteItems.sort((a, b) => Number(favoriteIds.has(b.heroId)) - Number(favoriteIds.has(a.heroId)));

    const craftIds = heroesByTier('mythic')
      .filter((heroDef) => state.unlockedInstantSummons.includes(heroDef.id) || craftMaterialsReady(state, heroDef))
      .map((heroDef) => heroDef.id);
    craftIds.sort((a, b) => Number(favoriteIds.has(b)) - Number(favoriteIds.has(a)));
    const craftItems = craftIds.map((heroId) => ({
      kind: state.unlockedInstantSummons.includes(heroId) ? 'unlocked' : 'craft',
      heroId,
    }));

    return [...promoteItems, ...craftItems].slice(0, FAVORITE_BAR_MAX);
  }

  function renderFavoriteBar(state) {
    const items = favoriteBarItems(state);
    return el(
      'div',
      { class: 'favorite-bar' },
      items.map((item) => {
        const heroDef = HEROES_BY_ID[item.heroId];
        if (item.kind === 'promote') {
          return el(
            'button',
            {
              class: 'favorite-icon favorite-icon-promote',
              title: heroDef?.name,
              onclick: () => apply(checkImmortalPromotion(state, item.instanceId)),
            },
            [
              heroImage(heroDef, { className: 'favorite-icon-image' }),
              el('span', { class: 'favorite-icon-label', text: '승급 가능!' }),
            ],
          );
        }
        const unlocked = item.kind === 'unlocked';
        return el(
          'button',
          {
            class: 'favorite-icon',
            title: heroDef?.name,
            onclick: () => apply(unlocked ? instantSummonFavorite(state, item.heroId) : craftMythic(state, item.heroId)),
          },
          [
            heroImage(heroDef, { className: 'favorite-icon-image' }),
            el('span', { class: 'favorite-icon-label', text: unlocked ? '즉시 소환!' : '조합 가능' }),
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
      const filling = isImmobilizeFilling(state, slot);
      const cell = el('div', {
        class: [
          `field-slot count-${slot.occupants.length}`,
          slot.occupants.length ? '' : 'empty',
          filling ? 'immobilize-filling' : '',
          isImmobilized(state, slot) ? 'immobilize-active' : '',
        ].filter(Boolean).join(' '),
        style: `grid-column:${slot.col + 1}; grid-row:${slot.row + 1};${filling ? ` --fill-sec:${IMMOBILIZE_GAUGE_FILL_SEC}s; animation-delay:-${(IMMOBILIZE_GAUGE_FILL_SEC - state.eventLog.immobilizeEvent.timer) * 1000}ms;` : ''}`,
        'data-row': slot.row, 'data-col': slot.col,
        // 탭/드래그는 위쪽 root pointerdown/pointermove/pointerup 핸들러가 전담한다
        // (드래그 이동과 탭 선택을 한 제스처에서 구분해야 하므로 onclick을 쓰지 않음).
        // ondragstart를 막아야 하는 이유는 heroVisual.js의 draggable=false 주석 참고.
        ondragstart: (e) => e.preventDefault(),
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

  function fieldCellRect(row, col) {
    const cellW = STAGE_LAYOUT.field.width / FIELD_COLS;
    const cellH = STAGE_LAYOUT.field.height / FIELD_ROWS;
    return {
      left: STAGE_LAYOUT.field.left + col * cellW,
      top: STAGE_LAYOUT.field.top + row * cellH,
      width: cellW,
      height: cellH,
    };
  }

  // 선택된 영웅의 모든 조작(이동/강화/판매/합성/영웅별 특수 액션)을 큰 팝업 패널이
  // 아니라 선택된 칸 바로 위/아래에 붙는 작은 버튼 묶음으로 띄운다(사용자 지정 UI -
  // "칸 클릭했을 때 팝업이 뜨는 게 아니라 위 아래로 버튼이 뜨는 것"). 판매/이동/강화는
  // 칸 위쪽에 쌓고, 합성과 영웅별 특수 액션은 칸 아래쪽에 쌓는다.
  function renderCellQuickActions(state) {
    const found = selectedInstance(state);
    if (!found) return null;
    const { slot, instance } = found;
    const heroDef = HEROES_BY_ID[instance.heroId];
    if (heroDef.tier === 'imp') return null; // 마마가 만든 임프는 조작 대상이 아니다
    const rect = fieldCellRect(slot.row, slot.col);
    const centerX = rect.left + rect.width / 2;

    const above = [];
    const below = [];

    above.push(el('button', {
      class: 'cell-quick-btn cell-quick-close', text: '✕',
      onclick: () => { ui.selectedInstanceId = null; render(state); },
    }));

    // 일반~전설은 판매/합성 외에 다른 기능이 없다(이동/강화 버튼 없음). 신화~불멸은
    // 반대로 일반 판매가 안 되고 채드가 필드에 있을 때만 "먹이기"로 처분할 수 있다 -
    // 그 자리가 일반 판매 버튼과 같은 위치(above)에 온다.
    if (heroDef.tier !== 'mythic' && heroDef.tier !== 'immortal') {
      above.push(el('button', {
        class: 'cell-quick-btn cell-quick-sell', text: '판매',
        onclick: () => { apply(sellHero(state, instance.instanceId)); ui.selectedInstanceId = null; },
      }));
    } else if (instance.heroId !== 'm_chad' && instance.heroId !== 'i_giga_chad') {
      // 기가채드(불멸)는 전용 판매(below의 '판매(+6💧)')가 따로 있어 채드 먹이기 대상에서 제외.
      const chad = state.field.flatMap((s) => s.occupants).find((o) => o.heroId === 'm_chad');
      if (chad) {
        above.push(el('button', {
          class: 'cell-quick-btn cell-quick-sell', text: '채드 먹이기(+5💧)',
          onclick: () => { apply(feedMythicToChad(state, chad.instanceId, instance.instanceId)); ui.selectedInstanceId = null; },
        }));
      }
    }

    if (slot.occupants.length === 3 && heroDef.tier !== 'legendary') {
      below.push(el('button', {
        class: 'cell-quick-btn cell-quick-synth', text: '합성',
        onclick: () => apply(synthesize(state, slot.row, slot.col)),
      }));
    }
    if (instance.heroId === 'm_mama') {
      below.push(el('button', {
        class: `cell-quick-btn cell-quick-extra ${instance.breakthrough ? 'active' : ''}`, text: '돌파',
        onclick: () => apply(toggleBreakthrough(state, instance.instanceId)),
      }));
    }
    // 승급 시도는 더 이상 칸 아래 버튼이 아니라, 조건 충족 시 좌측 즉시소환 아이콘 바에
    // "승급 가능!"으로 노출된다(renderFavoriteBar/favoriteBarItems 참고 - 사용자 지정
    // 규칙: 불멸이 먼저, 신화가 밑으로).
    if (instance.heroId === 'i_giga_chad') {
      below.push(el('button', {
        class: 'cell-quick-btn cell-quick-extra', text: '판매(+6💧)',
        onclick: () => apply(sellGigaChad(state, instance.instanceId)),
      }));
    }
    if (instance.heroId === 'm_tar' && countHeroOnField(state, 'm_tar').count > 1) {
      below.push(el('button', {
        class: 'cell-quick-btn cell-quick-extra', text: '동족포식',
        onclick: () => apply(cannibalizeTar(state, instance.instanceId)),
      }));
    }
    if (instance.heroId === 'm_indy') {
      const canDig = state.indyTreasure.slot && state.indyTreasure.slot.row === slot.row && state.indyTreasure.slot.col === slot.col;
      below.push(el('button', {
        class: 'cell-quick-btn cell-quick-extra', text: '발굴', disabled: !canDig,
        onclick: () => apply(digTreasure(state, instance.instanceId)),
      }));
    }
    if (SECOND_STAGE_IMMORTAL[instance.heroId]) {
      below.push(el('button', {
        class: 'cell-quick-btn cell-quick-extra',
        text: `2차 변신(성공 ${Math.round(SECOND_STAGE_IMMORTAL[instance.heroId].successRate * 100)}%)`,
        onclick: () => { apply(attemptSecondStageEvolution(state, instance.instanceId)); ui.selectedInstanceId = null; },
      }));
    }
    // 이동은 이제 버튼이 아니라 칸을 직접 드래그하는 방식이라(아래 드래그 핸들러
    // 참고) 탑 베인도 별도 버튼이 필요 없다 - 드래그로 옮겨도 moveHero()가 그대로
    // 호출되어 불멸 진행도가 똑같이 쌓인다. 강화만 버튼으로 남겨둔다(드래그로 대체할
    // 수 없는 액션이라 아이언미야옹 전용 진행 조건 버튼을 유지).
    if (heroDef.immortalCondition?.eventType === 'enhance') {
      below.push(el('button', {
        class: 'cell-quick-btn cell-quick-extra',
        text: `강화 (${ENHANCE_GOLD_COST}G ${ENHANCE_LUCKSTONE_COST}💎)`,
        disabled: state.gold < ENHANCE_GOLD_COST || state.luckstone < ENHANCE_LUCKSTONE_COST,
        onclick: () => apply(enhanceHero(state, instance.instanceId)),
      }));
    }

    // 불멸 진행도/마마 임프 수/타르 단계 등 부가 정보는 큰 카드 대신 작은 배지 한 줄로만
    // 보여준다.
    const statusText = extraStatusText(instance, heroDef);
    const displayLabel = heroDisplayLabel(instance, heroDef);
    const statusParts = [];
    if (displayLabel !== heroDef.name) statusParts.push(displayLabel);
    if (heroDef.immortalCondition) {
      statusParts.push(`불멸 ${Math.floor(instance.progress ?? 0)}${heroDef.immortalCondition.target != null ? '/' + heroDef.immortalCondition.target : ''}`);
    }
    if (statusText) statusParts.push(statusText);
    if (statusParts.length) {
      above.unshift(el('div', { class: 'cell-status-badge', text: statusParts.join(' · ') }));
    }

    const aboveWrap = el('div', {
      class: 'cell-quick-stack cell-quick-stack-above',
      style: `left:${centerX}%; top:${rect.top}%;`,
    }, above);
    const belowWrap = below.length
      ? el('div', {
          class: 'cell-quick-stack cell-quick-stack-below',
          style: `left:${centerX}%; top:${rect.top + rect.height}%;`,
        }, below)
      : null;

    return el('div', { class: 'cell-quick-actions' }, [aboveWrap, belowWrap].filter(Boolean));
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
    const first = slot.occupants[0];
    ui.selectedInstanceId = first ? first.instanceId : null;
    render(getState());
  }

  // resource_bar.png("재화 및 맵 카운트 바.png")에는 코인/행운석/인원 아이콘과 "/" 구분자가
  // 전부 그림 안에 이미 박혀있다(빈 값 없이 장식으로만). 텍스트를 각 아이콘 자리 위에 그대로
  // 얹으면 숫자가 아이콘과 겹쳐서 안 보이는 문제가 있었다 - 실측(bbox 스캔)한 아이콘 위치
  // 기준으로 각 숫자를 아이콘 "다음" 빈 공간에 배치했다. 인원 칸은 그림에 이미 "/"가 있어서
  // 직접 만든 텍스트에 "/"를 또 넣지 않고, 그 "/" 좌우로 현재/최대값만 나눠서 배치한다.
  function renderResourceRow(state) {
    return el('div', { class: 'stage-resource-row' }, [
      el('div', { class: 'resource-bar' }, [
        el('span', { class: 'resource-value resource-gold', text: `${Math.floor(state.gold)}` }),
        el('span', { class: 'resource-value resource-luckstone', text: `${state.luckstone}` }),
        el('span', { class: 'resource-value resource-pop-current', text: `${fieldOccupantCount(state)}` }),
        el('span', { class: 'resource-value resource-pop-max', text: `${state.fieldMaxCapacity}` }),
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
        text: '☰',
        onclick: () => openPopup('mission', state),
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

  // 룰렛 휠은 이미지 대신 목업처럼 CSS로 직접 그린 원 + 등급 라벨 텍스트로 표시한다
  // (문제: 이미지마다 실제 비율이 달라 화면에서 크기가 들쭉날쭉해 보였음).
  const ROULETTE_TIERS = [
    { tier: 'rare', slot: 'left', colorClass: 'blue' },
    { tier: 'hero', slot: 'left', colorClass: 'purple' },
    { tier: 'legendary', slot: 'right', colorClass: 'gold' },
  ];

  const ROULETTE_SPIN_MS = 280; // 룰렛이 도는 시간 - 정확히 0.28초
  const ROULETTE_FAIL_FLASH_MS = 500; // 다 돌아간 뒤 해골을 보여주는 시간

  function onRouletteWheelClick(r) {
    if (ui.spinningTier) return; // 이미 도는 중이면 무시
    const cost = ROULETTE_COST[r.slot];
    if (getState().luckstone < cost) return;
    ui.spinningTier = r.tier;
    render(getState());
    setTimeout(() => {
      const fresh = getState();
      const result = summonRoulette(fresh, r.tier, r.slot);
      ui.spinningTier = null;
      if (!result.success && result.reason === 'roulette-fail') {
        ui.rouletteFailTier = r.tier;
        setTimeout(() => {
          ui.rouletteFailTier = null;
          if (root.isConnected) render(getState());
        }, ROULETTE_FAIL_FLASH_MS);
      }
      apply(result);
    }, ROULETTE_SPIN_MS);
  }

  function renderRoulettePopup(state) {
    const items = ROULETTE_TIERS.map((r) => {
      const cost = ROULETTE_COST[r.slot];
      const spinning = ui.spinningTier === r.tier;
      const failed = ui.rouletteFailTier === r.tier;
      return el('div', { class: 'roulette-item' }, [
        el('span', { class: 'roulette-pct', text: `${Math.round(ROULETTE_SUCCESS_RATE[r.tier] * 100)}%` }),
        el('button', {
          class: `roulette-wheel-btn${spinning ? ' spinning' : ''}`,
          disabled: state.luckstone < cost || Boolean(ui.spinningTier),
          onclick: () => onRouletteWheelClick(r),
        }, [
          el('div', { class: `roulette-wheel-circle ${r.colorClass}` }, [
            el('span', { class: 'roulette-wheel-label', text: TIER_LABEL[r.tier] }),
          ]),
          failed ? el('img', { class: 'roulette-fail-skull', src: UI_IMAGES.skullIcon, alt: '실패' }) : null,
        ]),
        el('span', { class: 'roulette-item-cost' }, [el('img', { src: UI_IMAGES.luckstoneIcon, alt: '' }), el('span', { text: String(cost) })]),
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

  // 강화 팝업 4칸(일반~희귀/영웅/전설~불멸/소환 확률) - 특정 선택 영웅이 아니라 계정
  // 전체에 적용되는 전역 트랙(GameState.globalEnhance, actions.js의 upgradeGlobalEnhance).
  // 데미지 계산이 범위 밖이라 레벨을 올려도 실질 효과는 없지만(소환 확률도 항상 고정),
  // 골드/보석은 실제로 차감되고 레벨도 실제로 오른다.
  const GLOBAL_ENHANCE_ICON = {
    common: UI_IMAGES.enhanceCommon,
    hero: UI_IMAGES.enhanceHero,
    legendary: UI_IMAGES.enhanceLegendary,
    rate: UI_IMAGES.enhanceRate,
  };

  function renderEnhancePopup(state) {
    const cols = GLOBAL_ENHANCE_TRACKS.map((track) => {
      const cost = GLOBAL_ENHANCE_COST[track];
      const level = state.globalEnhance[track] + 1;
      const maxLevel = GLOBAL_ENHANCE_MAX_LEVEL[track];
      const atMax = maxLevel != null && level >= maxLevel;
      const canAfford = !atMax && (!cost.gold || state.gold >= cost.gold) && (!cost.luckstone || state.luckstone >= cost.luckstone);
      return el('button', {
        class: 'enhance-col', disabled: !canAfford,
        onclick: () => apply(upgradeGlobalEnhance(state, track)),
      }, [
        el('img', { class: 'enhance-col-icon', src: GLOBAL_ENHANCE_ICON[track], alt: GLOBAL_ENHANCE_LABEL[track] }),
        el('span', { class: 'enhance-col-name', text: GLOBAL_ENHANCE_LABEL[track] }),
        el('span', { class: 'enhance-col-lv', text: `Lv.${level}` }),
        atMax
          ? el('span', { class: 'enhance-col-cost', text: 'MAX' })
          : el('span', { class: 'enhance-col-cost' }, [
              el('img', { src: cost.gold ? UI_IMAGES.goldIcon : UI_IMAGES.luckstoneIcon, alt: '' }),
              el('span', { text: String(cost.gold ?? cost.luckstone) }),
            ]),
      ]);
    });
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
      if (pointerDown) return; // 클릭 도중엔 건너뛰고, 다음 tick에 반영
      render(state);
    },
  };
}
