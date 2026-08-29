import { HEROES_BY_ID, TIER_LABEL, heroesByTier, SECOND_STAGE_IMMORTAL, IMP_HERO_ID } from '../data/heroes.js';
import { STAGE_LAYOUT, BOSS_IMAGE, UI_IMAGES } from '../data/assets.js';
import { missionDefinitions, MISSION_TOAST_SEC } from '../logic/missions.js';
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
import { IMMOBILIZE_GAUGE_FILL_SEC, DELETE_START_AT_TIME_LEFT, DELETE_TRIGGER_AT_TIME_LEFT, INDY_TREASURE_INTERVAL_SEC } from '../logic/waveEvents.js';
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
    selectedSlot: null, // {row,col} | null - 선택 기준은 개체가 아니라 칸 자체
    popup: null, // null | 'mythic' | 'roulette' | 'enhance' | 'mission'
    mythicTab: 'mythic', // 'mythic' | 'immortal'
    mythicSelectedId: null,
    spinningTier: null, // 룰렛 스핀 연출 중인 등급
    rouletteFailTier: null, // 방금 실패해서 해골을 잠깐 보여줄 등급
    rouletteSuccessHero: null, // 방금 성공해서 나온 영웅 그림을 잠깐 보여줄 heroId
    monsters: [], // 좌->우 굴을 지나가는 장식용 몬스터 애니메이션 상태
    monsterSpawnWave: null, // 아래 두 필드가 몇 라운드 기준인지(라운드 바뀌면 리셋)
    monsterSpawnedCount: 0, // 이번 라운드에 지금까지 스폰한 장식용 몬스터 수
    chadSellMode: false, // 채드 "판매하기" 버튼을 눌러 화살표 선택 모드에 들어간 상태
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

  // 뷰포트 비율이 STAGE_RATIO와 안 맞을 때 "cover"(꽉 채우고 넘치는 부분 자르기)로
  // 바꿔봤었는데, 카카오톡 인앱 브라우저 같은 환경에서 위쪽 UI(상단 배지)가 통째로
  // 잘려나가는 부작용이 나왔다(사용자 스크린샷으로 확인) - "안되면 크기 그냥
  // 원래대로 해야할거 같아"라는 지시대로 "contain"(전체가 다 보이게, 안 맞는
  // 쪽엔 검은 여백)으로 되돌렸다. 이때 여백을 우회하려고 추가했던 전체화면 버튼은
  // 이후 사용자 요청으로 제거했다(renderStageControls 참고).
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

  // window에 등록하는 리스너(resize/pointermove/pointerup/pointercancel)는 root와
  // 달리 게임 화면을 나가도 저절로 사라지지 않는다 - root는 DOM에서 떨어져 나가면
  // 참조가 없어져 가비지 컬렉션되지만, window는 페이지가 살아있는 한 계속 남아있어서
  // 그 안에 등록된 리스너(와 그 클로저가 붙잡고 있는 이 GameScreen 인스턴스 전체)도
  // 계속 살아있게 된다. 사용자가 게임을 나갔다가 다시 시작하는(mountGame이 다시
  // 호출되는) 매 라운드마다 이 4개가 누적돼서, 여러 판을 하고 나면 겹겹이 쌓인
  // 리스너들이 매 pointermove/resize마다 전부 실행돼 체감 랙("버벅거리고 멈추고")의
  // 원인이 될 수 있다 - 한 판만 해도 즉시 눈에 띄는 정도는 아니지만 재시작을 반복할수록
  // 누적되는 전형적인 메모리/리스너 누수 패턴이다. 함수 참조를 변수로 잡아뒀다가
  // destroy()에서 명시적으로 해제한다(main.js가 onExit 시 호출).
  const handleResize = () => {
    if (root.isConnected) render(getState());
  };
  window.addEventListener('resize', handleResize);

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

    // 팝업이 하나라도 열려 있으면 팝업 바깥을 누르는 즉시 자동으로 닫는다(사용자
    // 요청 - "팝업 뜨는것들은 전부 팝업 외부를 눌렀을 때 자동으로 꺼지게 해줘").
    // 미션 팝업(.popup-overlay)은 이미 자체적으로 어두운 배경 클릭 시 닫히는 로직이
    // 있어서(popup-box 내부는 제외) 여기서는 그 팝업 전체를 "안쪽"으로만 판정해
    // 건드리지 않는다(이중 처리 방지). 룰렛 팝업이 열려 있을 때는 필드 조작이
    // 예외적으로 허용되므로(이전 요청 - "룰렛 팝업이 떠있을 때에도 필드에 있는
    // 캐릭터 조작 가능하게") 필드 칸/액션을 누르는 것도 "안쪽"과 동등하게 취급해
    // 닫히지 않게 한다.
    if (ui.popup) {
      const insidePopup = e.target.closest('.game-popup, .mythic-popup, .popup-overlay');
      const insideFieldWhileRoulette = ui.popup === 'roulette'
        && e.target.closest('.field-slot, .cell-quick-actions, .chad-arrow-layer');
      if (!insidePopup && !insideFieldWhileRoulette) {
        ui.popup = null;
        render(getState());
        return;
      }
    }

    const cellEl = e.target.closest('.field-slot');
    if (!cellEl) {
      // 칸도, 그 칸의 액션 버튼도, 채드 화살표도 아닌 곳을 누르면 선택 해제
      // (사용자 지정 - "칸 선택 후 다른 곳 아무데나 누르면 해제").
      if (!ui.popup && ui.selectedSlot && !e.target.closest('.cell-quick-actions') && !e.target.closest('.chad-arrow-layer')) {
        ui.selectedSlot = null;
        render(getState());
      }
      return;
    }
    // 위 팝업 자동 닫힘 처리를 이미 통과했으므로, 여기까지 왔다는 건 팝업이 없거나
    // 룰렛 팝업이 열려 있는 상태뿐이다 - 그 외 팝업은 이미 위에서 닫혔다.
    const row = Number(cellEl.dataset.row);
    const col = Number(cellEl.dataset.col);
    const state = getState();
    const slot = state.field.find((s) => s.row === row && s.col === col);
    if (!slot) return;
    // 빈 칸이어도 dragState를 세워야 한다 - 그래야 pointerup의 endDrag()가
    // onSlotClick()까지 도달해서 "다른(빈) 칸을 누르면 바로 선택 해제"가 된다
    // (사용자 지적 - "다른곳 누르면 바로 선택 해제되어야 하는데 지금 바로
    // 해제가 안돼"). 예전엔 여기서 빈 칸을 바로 return 해버려서 endDrag/
    // onSlotClick 경로 자체를 못 타 해제가 안 됐다. 드래그 이동(moveHero)은
    // 빈 칸이 출발지면 자체적으로 안전하게 실패 처리되므로 빈 칸에서 드래그를
    // 시작해도 부작용이 없다.
    dragState = {
      fromRow: row, fromCol: col,
      startX: e.clientX, startY: e.clientY, moved: false,
      // 이동불능(속박) 상태인 칸은 탭 선택은 그대로 되지만 실제 드래그 이동은
      // endDrag에서 막는다(보스 이동불능 이벤트 지속 시간 동안 캐릭터를 움직일 수
      // 있던 버그 리포트 반영).
      immobilized: isImmobilized(state, slot),
    };
    cellEl.classList.add('dragging-source');
  });

  const handlePointerMove = (e) => {
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
  };
  window.addEventListener('pointermove', handlePointerMove);

  function endDrag(e) {
    pointerDown = false;
    if (!dragState) return;
    const sourceEl = root.querySelector('.dragging-source');
    if (sourceEl) sourceEl.classList.remove('dragging-source');
    setDragHover(null);
    const { fromRow, fromCol, moved, immobilized } = dragState;
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
    apply(moveHero(getState(), fromRow, fromCol, toRow, toCol));
  }

  const handlePointerUp = (e) => { endDrag(e); };
  const handlePointerCancel = () => {
    pointerDown = false;
    const sourceEl = root.querySelector('.dragging-source');
    if (sourceEl) sourceEl.classList.remove('dragging-source');
    setDragHover(null);
    dragState = null;
  };
  window.addEventListener('pointerup', handlePointerUp);
  window.addEventListener('pointercancel', handlePointerCancel);

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
    const deleteLine = renderDeleteLineEffect(state);
    if (deleteLine) stage.appendChild(deleteLine);
    stage.appendChild(renderHeroTokenLayer(state));
    const quickActions = renderCellQuickActions(state);
    if (quickActions) stage.appendChild(quickActions);
    const chadArrows = renderChadArrowLayer(state);
    if (chadArrows) stage.appendChild(chadArrows);
    stage.appendChild(renderFavoriteBar(state));
    stage.appendChild(renderStageControls(state));
    stage.appendChild(renderResourceRow(state));
    stage.appendChild(renderSideControls(state));
    stage.appendChild(renderActionRow(state));
    stage.appendChild(renderEnhanceOpenBtn(state));
    const missionToast = renderMissionToast(state);
    if (missionToast) stage.appendChild(missionToast);
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
  // 5초 전부터는 왼쪽 굴 위에 카운트다운 배지를 추가로 띄운다. 0라운드(1웨이브
  // 시작 전 5초 대기 구간)에도 이미 waveTimeLeft가 5→0으로 카운트다운 중이라
  // 똑같이 보여준다(사용자 요청 - "0라운드부터 보라색이 나타나야 함").
  function renderHoleEffects(state) {
    if (state.wave < 0 || state.result) return null;
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

  // 전체화면 버튼은 사용자 요청으로 제거했다(모바일 검은 여백 문제 우회용으로
  // 넣었던 것 - "전체화면 모드는 제거해줘").
  function renderStageControls(state) {
    const buttons = [
      el('button', {
        class: `stage-control-btn ${state.paused ? 'active' : ''}`,
        text: state.paused ? '▶' : '⏸',
        onclick: () => {
          const next = structuredClone(state);
          next.paused = !state.paused;
          dispatch(next);
        },
      }),
    ];
    buttons.push(el('button', { class: 'stage-control-btn', text: '🚪', onclick: onExit }));
    return el('div', { class: 'stage-controls' }, buttons);
  }

  const FAVORITE_BAR_MAX = 5;

  // 좌측 세로 아이콘 목록. 두 종류를 함께 보여준다:
  // 1) 승급 가능한 불멸 - 조건을 채운 신화 개체를 칸 클릭 후 아래 "승급 시도" 버튼이
  //    아니라 신화 조합과 똑같은 방식으로 왼쪽 아이콘에 노출한다(사용자 지정 규칙 -
  //    "불멸이 먼저, 신화가 밑으로"). instance별 판정이라 heroId가 아니라 instanceId
  //    기준으로 찾는다.
  // 2) 지금 조합 가능한 신화(재료가 필드에 다 갖춰진 신화). 신화 소환은 항상 "재료를
  //    먼저 없애고 신화를 추가"하는 방식이라 무료 재소환 같은 예외가 없다(사용자
  //    지적 - 예전엔 즐겨찾기 등록 + 한 번 조합한 신화는 재료 없이 무한 재소환되는
  //    "즉시소환" 버튼이 따로 있었는데, "재료도 안 없어지고 소환만 되는 중"이라는
  //    지적을 받고 그 예외를 완전히 없앴다. `unlockedInstantSummons`/
  //    `instantSummonFavorite`도 함께 삭제 - 항상 craftMythic() 하나로 통일).
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
      .filter((heroDef) => craftMaterialsReady(state, heroDef))
      .map((heroDef) => heroDef.id);
    craftIds.sort((a, b) => Number(favoriteIds.has(b)) - Number(favoriteIds.has(a)));
    const craftItems = craftIds.map((heroId) => ({ kind: 'craft', heroId }));

    return [...promoteItems, ...craftItems].slice(0, FAVORITE_BAR_MAX);
  }

  function renderFavoriteBar(state) {
    const items = favoriteBarItems(state);
    const favoriteIds = new Set(state.heroSettings.filter((h) => h.favorite).map((h) => h.heroId));
    // 즐겨찾기로 등록해 둔 영웅은 왼쪽 아이콘에도 별표를 달아 표시한다(사용자 요청).
    const starBadge = (heroId) => (favoriteIds.has(heroId) ? el('span', { class: 'favorite-icon-star', text: '★' }) : null);
    return el(
      'div',
      { class: 'favorite-bar' },
      items.map((item) => {
        const heroDef = HEROES_BY_ID[item.heroId];
        if (item.kind === 'promote') {
          // 빨간 테두리 원 안에는 지금(신화) 그림이 아니라 승급될 불멸 그림이 들어가야
          // 한다(사용자 지정 - 목표를 미리 보여주는 자리).
          const immortalDef = HEROES_BY_ID[heroDef.immortalCondition.id] ?? heroDef;
          return el(
            'button',
            {
              class: 'favorite-icon favorite-icon-promote',
              title: immortalDef?.name,
              onclick: () => apply(checkImmortalPromotion(state, item.instanceId)),
            },
            [
              heroImage(immortalDef, { className: 'favorite-icon-image' }),
              starBadge(item.heroId),
              el('span', { class: 'favorite-icon-label', text: '승급 가능!' }),
            ],
          );
        }
        return el(
          'button',
          {
            class: 'favorite-icon',
            title: heroDef?.name,
            onclick: () => apply(craftMythic(state, item.heroId)),
          },
          [
            heroImage(heroDef, { className: 'favorite-icon-image' }),
            starBadge(item.heroId),
            el('span', { class: 'favorite-icon-label', text: '조합 가능' }),
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
      // 이동불능 사슬 아이콘은 칸 구석의 작은 아이콘이 아니라 캐릭터 앞을 덮는 큰
      // 아이콘이어야 한다는 사용자 지적(참고 이미지) - renderHeroTokenLayer가 캐릭터
      // 토큰과 같은 좌표계에서 그린다(여기서는 더 이상 그리지 않음).
      // 보물 위치는 필드 임의의 칸에 랜덤 등장한다(기획서 명시 사항) - 작은 코너 아이콘이
      // 아니라 칸 전체가 노란색으로 빛나야 눈에 띈다는 사용자 지적을 반영해 글로우로 표시.
      if (isTreasureSlot(state, slot)) cell.appendChild(el('div', { class: 'treasure-mark' }, [el('span', { text: '💰' })]));
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

  // 13/20라운드 삭제 공격: 로직(waveEvents.js handleDeleteEvent)은 이미 행/열 하나를
  // 골라 targetSlots에 담아두고 phase:'filling' 동안 9초(DELETE_START~TRIGGER_AT_TIME_LEFT
  // 차이)를 세다가 다 차면 그 라인을 지운다 - 여기서는 그 라인 전체를 감싸는 네모
  // 테두리를 그리고, 왼쪽(행)/위쪽(열)에서부터 게이지가 차오르는 오버레이를 겹쳐서
  // 사용자가 요청한 시각 효과로 표현한다.
  function renderDeleteLineEffect(state) {
    const ev = state.eventLog.deleteEvent;
    if (!ev || ev.phase !== 'filling' || ev.targetSlots.length === 0) return null;
    const isRow = ev.targetSlots.every((t) => t.row === ev.targetSlots[0].row);
    const first = fieldCellRect(ev.targetSlots[0].row, ev.targetSlots[0].col);
    const last = fieldCellRect(
      ev.targetSlots[ev.targetSlots.length - 1].row,
      ev.targetSlots[ev.targetSlots.length - 1].col,
    );
    const rect = {
      left: Math.min(first.left, last.left),
      top: Math.min(first.top, last.top),
      width: isRow ? STAGE_LAYOUT.field.width : first.width,
      height: isRow ? first.height : STAGE_LAYOUT.field.height,
    };
    const totalFillSec = DELETE_START_AT_TIME_LEFT - DELETE_TRIGGER_AT_TIME_LEFT;
    const elapsedSec = DELETE_START_AT_TIME_LEFT - state.waveTimeLeft;
    const progress = Math.max(0, Math.min(1, elapsedSec / totalFillSec));
    return el('div', {
      class: 'delete-line-box',
      style: `left:${rect.left}%; top:${rect.top}%; width:${rect.width}%; height:${rect.height}%;`,
    }, [
      el('div', {
        class: `delete-line-gauge ${isRow ? 'from-left' : 'from-top'}`,
        style: isRow ? `width:${progress * 100}%;` : `height:${progress * 100}%;`,
      }),
    ]);
  }

  // 필드 캐릭터는 칸 안에 눕혀 넣는 flex 자식이 아니라, 칸 좌표를 기준으로 절대배치되는
  // 별도 오버레이 레이어로 그린다(.field-slot이 overflow:hidden이라 칸보다 큰 이미지를
  // 담을 수 없어서). z-index를 그리드 행(row) 번호로 매겨 아래쪽(화면 앞쪽) 행 캐릭터가
  // 위쪽(화면 뒷쪽) 행 캐릭터를 가리는 입체감을 낸다(사용자 참고 스크린샷 그대로 -
  // 원근감 있는 배치).
  // 캐릭터의 "맨 밑선"(발)을 칸 바닥선이 아니라 칸 정중앙에 맞춘다(사용자 지정 -
  // "캐릭터 맨 밑선 기준으로 중앙에다가 정렬"). 박스 전체를 칸 중앙에 놓는 게
  // 아니라 발끝이 중앙에 오도록 박스를 위로 끌어올리는 방식이라, 몸통/머리는
  // 칸 위로 넘치고 발은 칸 안쪽(정중앙)에 남는다.
  //
  // 3배로 키웠던 걸 사용자가 "너무 크다"고 되돌렸다 - 이번엔 "3마리가 쌓였을 때
  // 그 발끝(맨 하단)들이 전부 칸 하나의 가로 폭 안에 들어와야 한다"는 조건으로
  // 크기를 역산했다. stackOffsets(3)의 좌우 오프셋이 ±0.3*tokenWidth이고 각
  // 캐릭터 폭이 tokenWidth이므로, 3마리의 가로 전체 스팬은
  // 2*(0.3+0.5)*tokenWidth = 1.6*tokenWidth - 이게 칸 너비(1.0) 안에 들어오려면
  // tokenWidth <= 0.625여야 한다. 여유를 좀 두고 0.55로 잡았다(스팬 0.88, 칸 폭의
  // 88%만 사용 - 발끝이 칸 가장자리에 닿을 듯 말 듯하지 않게). 높이는 예전
  // 비율(0.8/0.44≈1.82)을 그대로 유지해서 0.55*1.82≈1.0으로 잡았다 - 정확히 칸
  // 높이 1배라 계산이 깔끔하기도 하고, 캐릭터가 서 있을 때 칸 하나 높이만큼
  // 위로 솟아 있는 정도라 "적당히 크다"는 느낌과도 맞아떨어진다.
  //
  // 캐릭터 크기는 그 칸에 몇 마리가 쌓여있든 항상 고정이다(사용자 지적 - 예전엔
  // 칸 너비를 마리 수만큼 나눠서 1마리일 때와 3마리일 때 크기가 달라졌었음).
  //
  // "신화/불멸이 일반~전설보다 커야 하는데 지금 반대로 보인다"는 지적에 맞춰
  // 일반~전설 기준 비율을 20% 줄이고(0.55/1.0 → 0.44/0.8), 신화/불멸 배율은 기존
  // 절대 크기(1.25배) 대비 20% 더 키웠다 - 신화/불멸 배율은 이 기준 비율에 곱해지는
  // 값이라, 최종 신화 절대 크기가 "예전 신화 크기(0.55×1.25=0.6875)의 120%"가
  // 되도록 역산하면 0.6875×1.2 / 0.44 = 1.875. 이후 사용자 요청으로 그 1.875배에서
  // 다시 10%를 줄였다(1.875 × 0.9 = 1.6875).
  const HERO_TOKEN_HEIGHT_RATIO = 0.8;
  const HERO_TOKEN_WIDTH_RATIO = 0.44;
  const IMP_TOKEN_SCALE = 0.5; // 마마 임프는 다른 캐릭터의 절반 크기(사용자 지적 - 너무 컸음)
  const MYTHIC_TOKEN_SCALE = 1.6875;
  const ULTIMATE_FLASH_MS = 3000; // 베인 궁 이펙트 지속 시간(사용자 요청으로 3초로 연장)
  const ATTACK_CYCLE_MS = 900; // 공격 모션(위아래 스쿼시-스트레치) 반복 주기

  // 한 칸에 쌓인 마리 수별 배치 오프셋(토큰 폭/높이 대비 비율). 3마리는 일렬이 아니라
  // 뒤 2마리 + 앞 1마리의 삼각형 대열로 배치한다(사용자 참고 이미지). 인덱스 순서가
  // 뒤→앞이라 나중에 그려지는 앞쪽 캐릭터가 자연히 뒤쪽 위에 겹쳐 보인다(같은 칸
  // 안에서는 z-index를 따로 안 써도 DOM에 그려지는 순서만으로 앞/뒤가 갈림).
  // 3마리 배치 규칙(사용자 정정 - "위에 있는 2마리는 밑선을 가운데에 맞추고 그
  // 아래에 한 마리를 추가하는 걸로 가자. 지금은 정렬이 흐트러져 보여"): 뒤 2마리의
  // 발끝(dy:0)이 다른 마리 수와 똑같이 칸 중앙에 오도록 맞추고, 앞 1마리는 그
  // 기준선보다 아래(dy:양수)에 별도로 추가한다 - 뒤 2마리끼리는 같은 높이로
  // 나란히 정렬되고, 앞 1마리만 그 아래 걸쳐 보인다.
  function stackOffsets(n) {
    if (n <= 1) return [{ dx: 0, dy: 0 }];
    if (n === 2) return [{ dx: -0.22, dy: 0 }, { dx: 0.22, dy: 0 }];
    return [
      { dx: -0.3, dy: 0 }, // 뒤-왼쪽(밑선이 칸 중앙)
      { dx: 0.3, dy: 0 }, // 뒤-오른쪽(밑선이 칸 중앙)
      { dx: 0, dy: 0.2 }, // 앞-중앙(그 아래 추가)
    ];
  }

  // 인스턴스마다 애니메이션 시작 위상을 다르게 흩뿌리기 위한 안정적 해시 - 같은
  // 개체는 항상 같은 위상을 가져야 렌더마다(0.2초마다 DOM이 통째로 재생성돼도)
  // 애니메이션이 튀지 않는다.
  function hashPhase(id, mod) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return h % mod;
  }

  // "합성 가능" 표시는 칸을 감싸는 사각 테두리가 아니라(사용자 지적 - "누가
  // 네모로 하랬냐"), 캐릭터 이미지의 실제 알파 채널(실루엣)을 따라가는 흰색
  // 외곽선이어야 한다. drop-shadow를 여러 방향으로 얇게 겹쳐 쌓으면 투명 배경은
  // 그대로 투명하게 두고 그림이 있는 픽셀 가장자리에만 색이 번져서 실루엣
  // 외곽선처럼 보인다.
  // 함정: CSS `filter: drop-shadow(A) drop-shadow(B) ...`는 각 항이 원본이 아니라
  // "이전까지 누적된 결과물"에 다시 적용된다(체이닝) - 8방향을 그대로 다 겹치면
  // 오프셋들이 서로 누적돼 실제 시각적 크기가 훨씬 크게 부풀어 보인다. 지난 라운드에
  // 이걸 0.6px/4방향까지 줄였더니 이번엔 반대로 아예 안 보인다는 지적을 받았다 -
  // 1.5px로 다시 키워서 눈에 띄면서도 예전(2px/8방향)처럼 뭉개지지 않는 지점을
  // 찾았다(Playwright 스크린샷으로 직접 눈으로 확인하며 맞춤).
  const OUTLINE_OFFSET_PX = 1.5;
  function outlineFilter(color = '#fff') {
    const offsets = [
      [OUTLINE_OFFSET_PX, 0], [-OUTLINE_OFFSET_PX, 0], [0, OUTLINE_OFFSET_PX], [0, -OUTLINE_OFFSET_PX],
    ];
    return offsets.map(([x, y]) => `drop-shadow(${x}px ${y}px 0 ${color})`).join(' ');
  }

  // 인디가 보유한 보물 등급에 따라 인디 본인의 외곽선 색을 바꾼다(사용자 지정) -
  // 등급 색은 기존 팔레트(main.css의 --tier-color 변수들)와 맞춰뒀다.
  const INDY_TREASURE_OUTLINE_COLOR = {
    normal: '#8b93a8', rare: '#4fc3f7', hero: '#9b6df0', legendary: '#f5a623',
  };

  const INDY_GAUGE_FLASH_MS = 1500; // "완료" 텍스트가 잠깐 떠 있는 시간(1회성)

  // 인디의 보물 발굴 쿨타임(30초)을 인디 캐릭터 바로 밑에 항상 보여주는 게이지
  // (사용자 지정 - "이건 클릭 안 해도 보여지게"). 칸을 선택했는지와 무관하게 항상
  // 그린다(renderHeroTokenLayer에서 인디가 있는 칸마다 호출). 게이지가 다 차서 새
  // 보물이 등장한 순간(indyTreasure.completedAt)부터 INDY_GAUGE_FLASH_MS 동안만
  // "완료" 텍스트를 한 번 보여준다 - 궁극기 링/공격 모션과 같은 이유로 고정 delay가
  // 아니라 실제 경과 시간으로 판정한다(0.2초마다 DOM이 재생성되는 구조라 매 렌더
  // 새로 계산해야 멈추지 않고 자연스럽게 사라진다).
  function renderIndyTreasureGauge(state, rect) {
    const fillRatio = Math.max(0, Math.min(1, 1 - state.indyTreasure.timer / INDY_TREASURE_INTERVAL_SEC));
    const completedElapsedMs = state.indyTreasure.completedAt ? Date.now() - state.indyTreasure.completedAt : Infinity;
    const showComplete = completedElapsedMs < INDY_GAUGE_FLASH_MS;
    const gaugeTop = rect.top + rect.height + 1.2;
    return el('div', {
      class: 'indy-treasure-gauge',
      style: `left:${rect.left}%; top:${gaugeTop}%; width:${rect.width}%;`,
    }, [
      el('div', { class: 'indy-treasure-gauge-fill', style: `width:${fillRatio * 100}%;` }),
      showComplete ? el('div', { class: 'indy-treasure-gauge-complete', text: '완료' }) : null,
    ]);
  }

  function renderHeroTokenLayer(state) {
    const layer = el('div', { class: 'stage-hero-layer' });
    for (const slot of state.field) {
      if (slot.occupants.length === 0) continue;
      const rect = fieldCellRect(slot.row, slot.col);
      const firstHeroTier = HEROES_BY_ID[slot.occupants[0].heroId]?.tier;
      const isImpCell = slot.occupants[0].heroId === IMP_HERO_ID;
      const isMythicCell = firstHeroTier === 'mythic' || firstHeroTier === 'immortal';
      const sizeScale = isImpCell ? IMP_TOKEN_SCALE : isMythicCell ? MYTHIC_TOKEN_SCALE : 1;
      const tokenHeight = rect.height * HERO_TOKEN_HEIGHT_RATIO * sizeScale;
      const n = slot.occupants.length;
      // 발끝(박스 하단) 기준선: 일반~영웅은 칸 정중앙(사용자 지정) - 마리 수와
      // 무관하게 항상 같은 기준선을 쓴다. 3마리일 때 뒤 2마리의 발끝이 바로 이
      // 기준선에 오고, 앞 1마리만 stackOffsets의 dy로 그 아래에 별도로 걸린다
      // (사용자 정정 - "위에 있는 2마리는 밑선을 가운데에 맞추고 그 아래에 한
      // 마리를 추가"). 신화/불멸(항상 1마리, 훨씬 큼)은 그 "앞 1마리" 기준선에
      // 맞춘다(사용자 지정 - "일반 3마리일 때 아래에 있는 애 발선 있잖아 거기
      // 맞추면 됨") - 칸 정중앙에서 기본(1배) 칸 높이의 0.2배만큼 더 아래.
      const baseTop = isMythicCell
        ? rect.top + rect.height * (0.5 + 0.2 * HERO_TOKEN_HEIGHT_RATIO) - tokenHeight
        : rect.top + rect.height / 2 - tokenHeight;
      const tokenWidth = rect.width * HERO_TOKEN_WIDTH_RATIO * sizeScale; // 마리 수와 무관하게 항상 고정
      const cellCenterX = rect.left + rect.width / 2;
      const offsets = stackOffsets(n);
      const positions = offsets.map((o) => ({
        centerX: cellCenterX + o.dx * tokenWidth,
        top: baseTop + o.dy * tokenHeight,
      }));

      // 흰 외곽선은 선택 여부와 무관하게 3마리가 다 찬 칸에만 뜬다(합성 가능한
      // 등급 - 일반~영웅만, 전설 이상은 스택 개념이 없거나 합성 대상이 아님).
      // 사용자가 명시적으로 정정한 규칙 - "흰색 테두리는 내가 3마리 있을때만
      // 하라 했다. 1~2마리일 때 칸 클릭해도 뜨면 안 된다" - 그래서 선택
      // 여부(`selected`)는 이 판정에서 아예 빼야 한다.
      const firstHeroDef = HEROES_BY_ID[slot.occupants[0].heroId];
      const readyToCombine = n === 3 && ['normal', 'rare', 'hero'].includes(firstHeroDef?.tier);
      const outlined = readyToCombine;

      slot.occupants.forEach((occ, i) => {
        const heroDef = HEROES_BY_ID[occ.heroId];
        // 디버프는 개체 하나가 아니라 칸 전체에 적용되고(사용자 지적 - 한 칸에 3마리가
        // 있으면 그 중 1마리만이 아니라 칸에 있는 전원이 대상이어야 한다), 칸도 한 번에
        // 6개까지 동시에 물든다(사용자 지정 - 이동불능 게이지형과 동일).
        // 디버프는 칸이 아니라 개체(instanceId) 기준 - 캐릭터를 다른 칸으로 옮기면
        // 보라색도 같이 따라가야 한다(사용자 지적).
        const debuffEv = state.eventLog.debuffEvent;
        const debuffed = debuffEv && debuffEv.instanceIds.includes(occ.instanceId);
        // 탑 베인이 방금 궁극기 환산 임계치(이동 왕복 15~20회 랜덤)를 넘겼으면 잠깐
        // 이펙트를 준다(사용자 요청 - immortal.js의 recordImmortalEvent가 남긴
        // 타임스탬프 확인). 게임 루프가 0.2초마다 전체 DOM을 다시 그리는 구조라
        // (main.js), infinite 애니메이션에 고정 delay를 넣으면 매번 처음부터
        // 재생되며 멈춘 것처럼 보인다(몬스터 이동 애니메이션과 같은 함정, CLAUDE.md
        // 참고) - 실제 경과 시간 기준으로 animation-delay를 매 렌더 다시 계산해서
        // 넣는다.
        const ultimateElapsedMs = occ.ultimateFlashAt ? Date.now() - occ.ultimateFlashAt : Infinity;
        const usingUltimate = occ.heroId === 'm_bane' && ultimateElapsedMs < ULTIMATE_FLASH_MS;
        const { centerX, top } = positions[i];

        // filter는 CSS 클래스를 여러 개 동시에 걸어도 서로 값을 덮어쓸 뿐 합쳐지지
        // 않는다(마지막에 매치된 규칙만 적용됨) - 합성가능 외곽선/디버프/궁극기
        // 발광이 동시에 필요할 수 있어서 상태에 맞는 filter 문자열을 직접 합성해
        // 인라인 style로 넣는다.
        const filterParts = ['drop-shadow(0 2px 3px rgba(0, 0, 0, 0.5))'];
        if (usingUltimate) filterParts.push('drop-shadow(0 0 10px #ffd54a)', 'drop-shadow(0 0 18px #ff9d2f)');
        if (debuffed) filterParts.push('sepia(1)', 'hue-rotate(220deg)', 'saturate(3)');
        if (outlined) filterParts.push(outlineFilter());
        // 인디가 보유한 보물 등급에 따라 인디 자신의 외곽선 색을 바꾼다(사용자 지정).
        const indyOutlineColor = occ.heroId === 'm_indy' ? INDY_TREASURE_OUTLINE_COLOR[occ.indyTreasureTier] : null;
        if (indyOutlineColor) filterParts.push(outlineFilter(indyOutlineColor));

        // 공격 모션(위아래로 살짝 늘어났다 줄어드는 스쿼시-스트레치)도 궁 링/몬스터
        // 이동과 같은 이유로 실제 경과 시간 기준 위상을 매 렌더 다시 계산한다 - 예전
        // token-pop 팝인 애니메이션은 고정 delay라 0.2초 재렌더마다 처음부터 다시
        // 재생되며 "깜빡이는" 것처럼 보였다(사용자 지적으로 제거, main.css 참고).
        const attackStagger = hashPhase(occ.instanceId, ATTACK_CYCLE_MS);
        const attackPhase = (Date.now() + attackStagger) % ATTACK_CYCLE_MS;
        const imgStyle = `filter:${filterParts.join(' ')}; animation-delay:-${attackPhase}ms;`;

        layer.appendChild(el('div', {
          class: `stage-hero-token${usingUltimate ? ' ultimate-flash' : ''}`,
          style: `left:${centerX}%; top:${top}%; width:${tokenWidth}%; height:${tokenHeight}%; z-index:${2 + slot.row};${usingUltimate ? ` --ring-delay:-${ultimateElapsedMs % 800}ms;` : ''}`,
        }, [
          el('div', { class: 'stage-hero-shadow' }),
          heroImage(heroDef, { className: 'stage-hero-image', instance: occ, style: imgStyle }),
          occ.enhanceLevel ? el('span', { class: 'enhance-badge', text: `+${occ.enhanceLevel}` }) : null,
        ]));
      });

      // 이동불능(속박) 사슬 아이콘 - 칸 구석의 작은 아이콘이 아니라 캐릭터 바로
      // 앞(위)을 덮는 큰 아이콘으로 표시해달라는 사용자 지적(참고 이미지: 캐릭터
      // 크기만큼 큰 사슬 X가 캐릭터 앞에 겹쳐 보임). 캐릭터 토큰과 같은 좌표계
      // (cellCenterX/baseTop/tokenWidth/tokenHeight)를 그대로 재사용한다. 처음엔
      // 1.6/1.15배로 키웠는데 사용자가 "너무 크다"고 다시 줄여달라고 해서
      // 캐릭터 크기에 더 가깝게(1.05/0.9배) 낮췄다 - 여전히 캐릭터보다 살짝 크게
      // 덮으면서도 화면을 압도하지 않는다.
      if (isImmobilized(state, slot)) {
        const chainWidth = tokenWidth * 1.05;
        const chainHeight = tokenHeight * 0.9;
        layer.appendChild(el('div', {
          class: 'stage-immobilize-mark',
          style: `left:${cellCenterX}%; top:${baseTop + tokenHeight / 2}%; width:${chainWidth}%; height:${chainHeight}%; z-index:${20 + slot.row};`,
        }, [el('img', { src: UI_IMAGES.immobilizeIcon, alt: '이동불능' })]));
      }

      // 인디 쿨타임 게이지는 칸에 다른 영웅이 같이 쌓여 있어도(보물이 이미 다른
      // 캐릭터가 있는 칸에 등장할 수 있다는 것과는 별개로, 인디 본인이 서 있는 칸
      // 기준) 항상 그린다 - 선택 여부와 무관.
      if (slot.occupants.some((o) => o.heroId === 'm_indy')) {
        layer.appendChild(renderIndyTreasureGauge(state, rect));
      }
    }
    return layer;
  }

  // 선택된 영웅의 모든 조작(이동/강화/판매/합성/영웅별 특수 액션)을 큰 팝업 패널이
  // 아니라 선택된 칸 바로 위/아래에 붙는 작은 버튼 묶음으로 띄운다(사용자 지정 UI -
  // "칸 클릭했을 때 팝업이 뜨는 게 아니라 위 아래로 버튼이 뜨는 것"). 판매/이동/강화는
  // 칸 위쪽에 쌓고, 합성과 영웅별 특수 액션은 칸 아래쪽에 쌓는다.
  function renderCellQuickActions(state) {
    if (ui.chadSellMode) return null; // 화살표 선택 모드 중엔 다른 칸 클릭을 방해하지 않게 숨김
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
      onclick: () => { ui.selectedSlot = null; render(state); },
    }));

    // 일반~전설은 판매/합성 외에 다른 기능이 없다(이동/강화 버튼 없음). 신화~불멸은
    // 일반 판매가 안 되고, 채드의 "판매하기" 버튼으로 화살표 모드에 들어가야만 처분할
    // 수 있다(아래 renderChadArrowLayer 참고 - 신화/불멸을 선택했다고 자동으로 먹이기
    // 버튼이 뜨는 게 아니라, 채드 쪽에서 먼저 시작해야 하는 사용자 지정 순서).
    if (heroDef.tier !== 'mythic' && heroDef.tier !== 'immortal') {
      above.push(el('button', {
        class: 'cell-quick-btn cell-quick-sell', text: '판매',
        onclick: () => apply(sellHero(state, instance.instanceId)),
      }));
    }

    if (slot.occupants.length === 3 && heroDef.tier !== 'legendary') {
      below.push(el('button', {
        class: 'cell-quick-btn cell-quick-synth', text: '합성',
        onclick: () => apply(synthesize(state, slot.row, slot.col)),
      }));
    }
    // 승급 가능 상태가 되면(왼쪽 즉시소환 바에 "승급 가능!"으로 이미 노출 중) 칸
    // 위의 돌파 버튼은 더 이상 필요 없어서 숨긴다(사용자 지정 - 불멸 조건 충족 시
    // 캐릭터 쪽에는 돌파/승급 버튼이 남아있으면 안 됨).
    if (instance.heroId === 'm_mama' && !isImmortalPromotionReady(state, instance.instanceId)) {
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
    // 채드 전용: "판매하기"를 누르면 팝니다 버튼이 아니라 필드의 신화/불멸(채드/기가채드
    // 본인 제외) 머리 위에 초록 화살표가 뜨는 모드로 들어간다 - 그 화살표를 눌러야
    // 비로소 판매(먹이기)가 실행된다(사용자 지정 순서: 채드 하단 버튼 → 화살표 표시 →
    // 화살표 클릭 → 판매).
    if (instance.heroId === 'm_chad') {
      below.push(el('button', {
        class: `cell-quick-btn cell-quick-extra ${ui.chadSellMode ? 'active' : ''}`,
        text: ui.chadSellMode ? '취소' : '판매하기',
        onclick: () => { ui.chadSellMode = !ui.chadSellMode; render(state); },
      }));
    }
    if (instance.heroId === 'm_tar' && countHeroOnField(state, 'm_tar').count > 1) {
      below.push(el('button', {
        class: 'cell-quick-btn cell-quick-extra', text: '동족포식',
        onclick: () => apply(cannibalizeTar(state, instance.instanceId)),
      }));
    }
    if (instance.heroId === 'm_indy') {
      const onTreasureSlot = state.indyTreasure.slot && state.indyTreasure.slot.row === slot.row && state.indyTreasure.slot.col === slot.col;
      const digging = state.indyTreasure.digging;
      const isDiggingHere = digging?.instanceId === instance.instanceId;
      below.push(el('button', {
        class: 'cell-quick-btn cell-quick-extra',
        text: isDiggingHere ? '발굴 중...' : '발굴',
        disabled: !onTreasureSlot || (!!digging && !isDiggingHere) || isDiggingHere,
        onclick: () => apply(digTreasure(state, instance.instanceId)),
      }));
    }
    if (SECOND_STAGE_IMMORTAL[instance.heroId]) {
      below.push(el('button', {
        class: 'cell-quick-btn cell-quick-extra',
        text: `2차 변신(성공 ${Math.round(SECOND_STAGE_IMMORTAL[instance.heroId].successRate * 100)}%)`,
        onclick: () => apply(attemptSecondStageEvolution(state, instance.instanceId)),
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

    // 부가 정보는 큰 카드 대신 작은 배지 한 줄로만 보여준다. 불멸 진행도("불멸
    // N/target")는 어떤 신화 캐릭터를 클릭하든 아예 노출하지 않는다(사용자 지정 -
    // 처음엔 마마만 뺐었는데 "마마뿐만 아니라 다른것들도 다 하지마"라고 확장 지적).
    // 단, 마마는 임프가 이제 필드에 실제 캐릭터로 보이니 나머지(임프 수) 텍스트도
    // 중복 정보라 사용자 요청으로 배지 자체를 아예 안 띄운다.
    if (instance.heroId !== 'm_mama') {
      const statusText = extraStatusText(instance, heroDef);
      const displayLabel = heroDisplayLabel(instance, heroDef);
      const statusParts = [];
      if (displayLabel !== heroDef.name) statusParts.push(displayLabel);
      if (statusText) statusParts.push(statusText);
      if (statusParts.length) {
        above.unshift(el('div', { class: 'cell-status-badge', text: statusParts.join(' · ') }));
      }
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

    // 선택된 캐릭터가 어떤 칸인지 잘 보이도록 그 칸 주변에 연한 원형 테두리를 그린다
    // (사용자 요청 - "어떤 캐릭을 선택했는지 잘 보이게 그 인근으로 원을 테두리만
    // 하나 연하게 그려줘, 버튼이랑 이어지게"). 칸 좌표 기준으로 위/아래 버튼
    // 스택과 같은 anchor(rect)를 쓰기 때문에, 링이 칸 위아래로 살짝 넘치게
    // 잡으면 자연스럽게 위/아래 버튼 스택과 맞닿아 하나로 이어져 보인다.
    const selectRing = el('div', {
      class: 'cell-select-ring',
      style: `left:${centerX}%; top:${rect.top + rect.height / 2}%; width:${rect.width * 1.35}%; height:${rect.height * 1.7}%;`,
    });

    return el('div', { class: 'cell-quick-actions' }, [selectRing, aboveWrap, belowWrap].filter(Boolean));
  }

  // 채드의 "판매하기" 버튼을 누르면(ui.chadSellMode) 필드의 신화/불멸(채드/기가채드
  // 본인 제외) 머리 위에 초록 화살표를 띄운다 - 화살표를 누르면 그제서야 판매(먹이기)가
  // 실행되고 모드에서 빠져나온다. 자동으로 신화 위에 판매 표시가 뜨는 게 아니라 채드
  // 쪽에서 먼저 시작해야 한다는 사용자 지정 순서를 그대로 구현한 것.
  function renderChadArrowLayer(state) {
    if (!ui.chadSellMode) return null;
    const chad = state.field.flatMap((s) => s.occupants).find((o) => o.heroId === 'm_chad');
    if (!chad) { ui.chadSellMode = false; return null; }
    const targets = [];
    for (const slot of state.field) {
      for (const occ of slot.occupants) {
        const def = HEROES_BY_ID[occ.heroId];
        if (!def) continue;
        if ((def.tier === 'mythic' || def.tier === 'immortal') && occ.heroId !== 'm_chad' && occ.heroId !== 'i_giga_chad') {
          targets.push({ slot, occ });
        }
      }
    }
    if (targets.length === 0) return null;
    return el('div', { class: 'chad-arrow-layer' }, targets.map(({ slot, occ }) => {
      const rect = fieldCellRect(slot.row, slot.col);
      return el('button', {
        class: 'chad-sell-arrow',
        style: `left:${rect.left + rect.width / 2}%; top:${rect.top}%;`,
        title: '판매(먹이기)',
        onclick: () => {
          ui.chadSellMode = false;
          apply(feedMythicToChad(state, chad.instanceId, occ.instanceId));
        },
      }, [el('span', { text: '⬇' })]);
    }));
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
  function isTreasureSlot(state, slot) {
    const t = state.indyTreasure.slot;
    return t && t.row === slot.row && t.col === slot.col;
  }

  function onSlotClick(state, slot) {
    // 선택 기준은 개체 하나가 아니라 칸 자체다(사용자 지정 규칙) - 판매 등 액션을
    // 눌러도 그 칸에 뭔가 남아있는 한 선택이 계속 유지된다.
    ui.selectedSlot = slot.occupants.length ? { row: slot.row, col: slot.col } : null;
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
    if (!ui.selectedSlot) return null;
    const slot = state.field.find((s) => s.row === ui.selectedSlot.row && s.col === ui.selectedSlot.col);
    if (slot && slot.occupants.length) return { slot, instance: slot.occupants[0] };
    ui.selectedSlot = null;
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
    const state = getState();
    if (state.luckstone < cost) return;
    // 필드가 꽉 찼으면 재화 소모/결과 처리 이전에 스핀 연출 자체를 시작하지 않는다
    // (summonRoulette도 동일하게 막지만, 그건 결과 처리 시점이라 스핀 애니메이션이
    // 먼저 돌아버리는 게 어색해서 여기서도 미리 막는다).
    if (fieldOccupantCount(state) >= state.fieldMaxCapacity) return;
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
      } else if (result.success) {
        // 실패하면 해골이 뜨듯이, 성공하면 뽑힌 영웅 그림을 잠깐 보여준다(사용자 요청).
        ui.rouletteSuccessHero = { tier: r.tier, heroId: result.hero.id };
        setTimeout(() => {
          ui.rouletteSuccessHero = null;
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
      const succeededHeroId = ui.rouletteSuccessHero?.tier === r.tier ? ui.rouletteSuccessHero.heroId : null;
      return el('div', { class: 'roulette-item' }, [
        el('span', { class: 'roulette-pct', text: `${Math.round(ROULETTE_SUCCESS_RATE[r.tier] * 100)}%` }),
        el('button', {
          class: `roulette-wheel-btn${spinning ? ' spinning' : ''}`,
          disabled: state.luckstone < cost || Boolean(ui.spinningTier) || fieldOccupantCount(state) >= state.fieldMaxCapacity,
          onclick: () => onRouletteWheelClick(r),
        }, [
          el('div', { class: `roulette-wheel-circle ${r.colorClass}` }, [
            el('span', { class: 'roulette-wheel-label', text: TIER_LABEL[r.tier] }),
          ]),
          failed ? el('img', { class: 'roulette-fail-skull', src: UI_IMAGES.skullIcon, alt: '실패' }) : null,
          succeededHeroId ? heroImage(HEROES_BY_ID[succeededHeroId], { className: 'roulette-success-image' }) : null,
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

  // 즐겨찾기된 신화(/그 불멸)가 팝업 그리드에서도 맨 앞으로 오도록 정렬한다(사용자
  // 지적 - 왼쪽 즉시소환 바는 이미 즐겨찾기 우선으로 정렬돼 있었지만, 이 그리드는
  // heroesByTier() 원본 순서 그대로라 즐겨찾기가 전혀 반영되지 않고 있었다).
  function sortFavoriteFirst(state, defs, heroIdOf) {
    const favoriteIds = new Set(state.heroSettings.filter((h) => h.favorite).map((h) => h.heroId));
    return [...defs].sort((a, b) => Number(favoriteIds.has(heroIdOf(b))) - Number(favoriteIds.has(heroIdOf(a))));
  }

  function renderMythicPopup(state) {
    const allMythics = sortFavoriteFirst(state, heroesByTier('mythic'), (h) => h.id);
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
    const allImmortals = sortFavoriteFirst(state, heroesByTier('immortal'), (h) => h.baseHeroId);
    return el('div', { class: 'mythic-grid' }, allImmortals.map((heroDef) => {
      const unlocked = immortalUnlockStatus(state, heroDef);
      return el('div', { class: `mythic-cell ${unlocked ? 'ready' : 'locked'}` }, [
        heroImage(heroDef, { className: 'mythic-cell-image' }),
        el('div', { class: 'mythic-progress', text: unlocked ? '해금' : '잠김' }),
      ]);
    }));
  }

  // 미션이 새로 완료되면 화면 우측에서 슬라이드인되는 알림을 잠깐 띄운다(사용자
  // 요청 - "미션 완료되면 우측에서 팝업 띄워주면서 미션 성공 알림"). 게임 루프가
  // 0.2초마다 전체 DOM을 다시 그리는 구조라(main.js), 슬라이드인 애니메이션에
  // 고정 delay를 쓰면 매번 처음부터 재생되며 끊겨 보인다(CLAUDE.md의 반복되는
  // 함정 - 몬스터 이동/공격 모션과 동일) - missionToastQueue[0].timer(남은 시간)를
  // 거꾸로 계산해 실제 경과 시간 기준 animation-delay를 매 렌더 다시 넣는다.
  function renderMissionToast(state) {
    const entry = state.missionToastQueue?.[0];
    if (!entry) return null;
    const def = missionDefinitions().find((m) => m.id === entry.missionId);
    if (!def) return null;
    const elapsedMs = Math.max(0, (MISSION_TOAST_SEC - entry.timer) * 1000);
    const rewardParts = [];
    if (def.reward?.gold) {
      rewardParts.push(el('span', { class: 'mission-toast-reward-item' }, [el('img', { src: UI_IMAGES.goldIcon, alt: '' }), el('span', { text: String(def.reward.gold) })]));
    }
    if (def.reward?.luckstone) {
      rewardParts.push(el('span', { class: 'mission-toast-reward-item' }, [el('img', { src: UI_IMAGES.luckstoneIcon, alt: '' }), el('span', { text: String(def.reward.luckstone) })]));
    }
    return el('div', {
      class: 'mission-toast',
      style: `animation-delay:-${elapsedMs}ms;`,
    }, [
      el('div', { class: 'mission-toast-title', text: '미션 완료!' }),
      el('div', { class: 'mission-toast-name', text: def.name }),
      el('div', { class: 'mission-toast-reward' }, rewardParts),
    ]);
  }

  // 미션은 1번씩만 완료 가능하고(사용자 지정), 완료된 항목은 체크박스가 체크되고
  // 이름에 취소선이 그어진다 - 미완료는 빈 체크박스만 뜬다.
  function renderMissionPopup(state) {
    const items = missionDefinitions().map((def) => {
      const progress = state.missions.find((m) => m.missionId === def.id);
      const completed = progress?.completed ?? false;
      const rewardParts = [];
      if (def.reward?.gold) {
        rewardParts.push(el('span', { class: 'mission-reward-item' }, [el('img', { src: UI_IMAGES.goldIcon, alt: '' }), el('span', { text: String(def.reward.gold) })]));
      }
      if (def.reward?.luckstone) {
        rewardParts.push(el('span', { class: 'mission-reward-item' }, [el('img', { src: UI_IMAGES.luckstoneIcon, alt: '' }), el('span', { text: String(def.reward.luckstone) })]));
      }
      return el('li', { class: `mission-item${completed ? ' completed' : ''}` }, [
        el('span', { class: 'mission-checkbox', text: completed ? '☑' : '☐' }),
        el('div', { class: 'mission-body' }, [
          el('div', { class: 'mission-name', text: `${def.name} (${progress?.current ?? 0}/${def.target})` }),
          el('div', { class: 'mission-desc', text: def.description }),
        ]),
        el('div', { class: 'mission-reward' }, rewardParts),
      ]);
    });
    return el('div', { class: 'popup-overlay', onclick: (e) => { if (e.target === e.currentTarget) closePopup(state); } }, [
      el('div', { class: 'popup-box mission-popup-box' }, [el('h3', { text: '미션' }), el('ul', { class: 'mission-list' }, items), el('button', { class: 'btn', text: '닫기', onclick: () => closePopup(state) })]),
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
    // 게임을 나갈 때(main.js의 onExit) 반드시 호출해야 한다 - 위 window 리스너
    // 4개는 root와 달리 그냥 두면 페이지가 살아있는 한 계속 쌓인다(주석 참고).
    destroy() {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
    },
  };
}
