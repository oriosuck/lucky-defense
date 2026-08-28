import { TIER_LABEL, heroesByTier } from '../data/heroes.js';
import { savePreset, listPresets, loadPreset, deletePreset, PRESET_NAME_MAX_LENGTH, getDefaultPresetId, setDefaultPreset } from '../state/presetStore.js';
import { el } from './components/dom.js';
import { heroImage } from './components/heroVisual.js';

// 일반~전설은 항상 소환 풀에 포함되고 모든 영웅이 기본 보유 상태이므로 사전 선택이 필요 없다.
// 홈 화면에서는 이번 판에서 불멸로 취급할지/즐겨찾기할지를 신화 등급 카드에서만 고른다.
const SELECTABLE_TIERS = ['mythic'];

function createLocalState() {
  return {
    gameType: 'delete', // 'no-delete' | 'delete' - 기본값은 삭제 있는 버전(사용자 지정)
    immortalPet: true,
    settings: new Map(), // heroId -> { immortal, favorite } (신화 등급만 사용)
  };
}

function isStartReady(s) {
  return s.gameType != null;
}

export function HeroSelectScreen({ onStart }) {
  const root = el('div', { class: 'screen hero-select-screen' });
  const local = createLocalState();
  // 드롭다운에서 어떤 프리셋을 골랐는지는 렌더마다 <select>가 새로 만들어지므로
  // (root.innerHTML='' 재생성 패턴) DOM에 안 남고 별도로 기억해둬야 삭제/기본값
  // 지정 버튼이 "지금 고른 프리셋"을 계속 알 수 있다.
  let presetSelection = '';

  function update() {
    root.innerHTML = '';
    root.appendChild(render());
  }

  function toggleImmortal(heroId) {
    const cur = local.settings.get(heroId) ?? { immortal: false, favorite: false };
    local.settings.set(heroId, { ...cur, immortal: !cur.immortal });
    update();
  }

  function toggleFavorite(heroId) {
    const cur = local.settings.get(heroId) ?? { immortal: false, favorite: false };
    local.settings.set(heroId, { ...cur, favorite: !cur.favorite });
    update();
  }

  function collectHeroSettings() {
    return [...local.settings.entries()]
      .filter(([, v]) => v.immortal || v.favorite)
      .map(([heroId, v]) => ({ heroId, immortal: v.immortal, favorite: v.favorite }));
  }

  // 불멸 펫 보유 유무 선택 UI는 없앴다(사용자 지정 - 항상 보유한 것으로 가정).
  // local.immortalPet은 createLocalState()에서 true로 고정되고, 프리셋을 불러와도
  // 이 값은 건드리지 않는다(예전 프리셋에 false가 저장돼 있었더라도 무시).
  function applyPreset(preset) {
    local.gameType = preset.gameType;
    local.settings = new Map((preset.heroSettings ?? []).map((h) => [h.heroId, { immortal: h.immortal, favorite: h.favorite }]));
    update();
  }

  // 화면을 열 때 기본값으로 지정된 프리셋이 있으면 자동으로 불러온다(사용자 요청).
  const defaultPresetId = getDefaultPresetId();
  if (defaultPresetId) {
    const defaultPreset = loadPreset(defaultPresetId);
    if (defaultPreset) {
      local.gameType = defaultPreset.gameType;
      local.settings = new Map((defaultPreset.heroSettings ?? []).map((h) => [h.heroId, { immortal: h.immortal, favorite: h.favorite }]));
    }
  }

  function renderPresetBar() {
    const nameInput = el('input', { type: 'text', maxlength: String(PRESET_NAME_MAX_LENGTH), placeholder: '프리셋 이름' });
    const status = el('span', { class: 'preset-status' });

    const saveBtn = el('button', {
      class: 'btn',
      text: '프리셋 저장',
      onclick: () => {
        const result = savePreset(nameInput.value, {
          gameType: local.gameType,
          immortalPet: local.immortalPet,
          heroSettings: collectHeroSettings(),
        });
        if (result.ok) {
          nameInput.value = '';
          update();
          return;
        }
        status.textContent = { 'empty-name': '이름을 입력하세요', 'name-too-long': '이름이 너무 깁니다', 'duplicate-name': '이미 존재하는 이름입니다', unavailable: '이 브라우저에서는 저장이 안 됩니다', quota: '저장 공간이 부족합니다' }[result.reason] ?? '저장 실패';
      },
    });

    const presets = listPresets();
    const currentDefaultId = getDefaultPresetId();
    if (presetSelection && !presets.some((p) => p.id === presetSelection)) presetSelection = ''; // 방금 삭제된 프리셋이면 선택 해제
    const loadSelect = el(
      'select',
      {},
      [
        el('option', { value: '', text: presets.length ? '불러오기...' : '저장된 프리셋 없음', selected: presetSelection === '' }),
        ...presets.map((p) => el('option', {
          value: p.id,
          text: p.id === currentDefaultId ? `★ ${p.name}` : p.name,
          selected: p.id === presetSelection,
        })),
      ],
    );
    loadSelect.addEventListener('change', () => {
      presetSelection = loadSelect.value;
      if (!presetSelection) return;
      const preset = loadPreset(presetSelection);
      if (preset) applyPreset(preset);
    });

    const deleteBtn = el('button', {
      class: 'btn btn-danger',
      text: '삭제',
      disabled: !presetSelection,
      onclick: () => {
        if (!presetSelection) return;
        deletePreset(presetSelection);
        presetSelection = '';
        update();
      },
    });

    // 선택된 프리셋을 "기본값"으로 지정 - 다음에 화면을 열 때 자동으로 불러와진다
    // (사용자 요청). 이미 기본값인 프리셋을 다시 누르면 해제된다.
    const isCurrentDefault = presetSelection && presetSelection === currentDefaultId;
    const defaultBtn = el('button', {
      class: `btn${isCurrentDefault ? ' active' : ''}`,
      text: isCurrentDefault ? '기본값 해제' : '기본값으로 설정',
      disabled: !presetSelection,
      onclick: () => {
        if (!presetSelection) return;
        setDefaultPreset(isCurrentDefault ? null : presetSelection);
        update();
      },
    });

    return el('div', { class: 'preset-bar' }, [nameInput, saveBtn, loadSelect, defaultBtn, deleteBtn, status]);
  }

  function renderHeroCard(heroDef) {
    const state = local.settings.get(heroDef.id) ?? { immortal: false, favorite: false };
    return el('div', { class: 'hero-card' }, [
      el('button', { class: 'favorite-toggle', text: state.favorite ? '★' : '☆', onclick: (e) => { e.stopPropagation(); toggleFavorite(heroDef.id); } }),
      el('div', { class: 'hero-card-body' }, [
        heroImage(heroDef, { className: 'hero-card-image' }),
        el('div', { class: 'hero-name', text: heroDef.name }),
        el('div', { class: 'hero-tier', text: TIER_LABEL[heroDef.tier] }),
      ]),
      el('label', { class: 'immortal-check' }, [
        el('input', {
          type: 'checkbox',
          checked: state.immortal,
          onchange: () => toggleImmortal(heroDef.id),
        }),
        el('span', { text: '불멸' }),
      ]),
    ]);
  }

  function render() {
    const startBtn = el('button', {
      class: 'btn btn-primary start-btn',
      text: '게임 시작',
      disabled: !isStartReady(local),
      onclick: () => {
        if (!isStartReady(local)) return;
        onStart({
          gameType: local.gameType,
          immortalPet: local.immortalPet,
          heroSettings: collectHeroSettings(),
        });
      },
    });

    const gameTypeRadios = ['no-delete', 'delete'].map((type) =>
      el('label', { class: 'radio' }, [
        el('input', {
          type: 'radio', name: 'gameType', value: type, checked: local.gameType === type,
          onchange: () => { local.gameType = type; update(); },
        }),
        el('span', { text: type === 'no-delete' ? '삭제 없는 버전' : '삭제 있는 버전' }),
      ]),
    );

    return el('div', { class: 'hero-select-inner' }, [
      el('div', { class: 'top-bar' }, [startBtn]),
      // 프리셋 저장/불러오기는 맨 밑이 아니라 화면 맨 위쪽에 둔다(사용자 요청).
      renderPresetBar(),
      el('section', { class: 'options' }, [
        el('div', { class: 'radio-group' }, gameTypeRadios),
        // 불멸 펫 보유 유무 선택 UI는 제거했다(사용자 지정 - 항상 보유한 것으로 가정).
        el('p', { class: 'options-note', text: '모든 유물은 항상 최대 레벨(11)로 고정되어 있습니다. 신화 등급을 제외한 모든 영웅은 기본으로 보유한 상태로 시작합니다. 불멸 펫은 항상 보유한 것으로 가정합니다.' }),
      ]),
      el('section', { class: 'hero-grid' }, SELECTABLE_TIERS.flatMap((tier) => heroesByTier(tier).map(renderHeroCard))),
    ]);
  }

  update();
  return root;
}
