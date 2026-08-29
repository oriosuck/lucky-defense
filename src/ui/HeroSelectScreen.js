import { TIER_LABEL, heroesByTier, IMMORTAL_CONDITIONS } from '../data/heroes.js';
import { savePreset, listPresets, loadPreset, deletePreset, PRESET_NAME_MAX_LENGTH, getDefaultPresetId, setDefaultPreset } from '../state/presetStore.js';
import { el } from './components/dom.js';
import { heroImage } from './components/heroVisual.js';

// 일반~전설은 항상 소환 풀에 포함되고 모든 영웅이 기본 보유 상태이므로 사전 선택이 필요 없다.
// 홈 화면에서는 이번 판에서 불멸로 취급할지/즐겨찾기할지를 신화 등급 카드에서만 고른다.
const SELECTABLE_TIERS = ['mythic'];

// "돌파"는 지금 마마(m_mama) 하나만 실제 게임 로직(임프 9→7마리 조건)이 있고
// 나머지는 아직 돌파 관련 수치/효과가 없다 - 사용자 지정으로 이 13명만 시작
// 화면에 돌파 체크박스를 먼저 노출한다(UI/저장만, 효과는 나중에 개별 구현
// 예정 - 사용자 확인 사항). 마마 외 12명을 체크해도 지금은 아무 효과가 없다.
const BREAKTHROUGH_ELIGIBLE_IDS = new Set([
  'm_frog_prince', 'm_orc_shaman', 'm_monopoly_man', 'm_ray', 'm_hailey',
  'm_mama', 'm_ninja', 'm_dragon', 'm_penguin_musician', 'm_chona',
  'm_gigi', 'm_tar', 'm_lancelot',
]);

const DEFAULT_HERO_SETTING = { immortal: true, favorite: false, breakthrough: false };
const DEFAULT_HERO_SETTING_NO_IMMORTAL = { immortal: false, favorite: false, breakthrough: false };

// 불멸로 승급 가능한 신화(사용자가 준 28명 - IMMORTAL_CONDITIONS에 있는 것과
// 정확히 일치)만 "불멸" 체크된 상태로 시작한다(사용자 지정 - "불멸도 미리 다
// 체크하고 시작하자") - 매번 28개를 직접 체크할 필요가 없어진다. 신화 등급은
// 총 31명인데 그중 인디(m_indy)/와트(m_watt)/로켓츄(m_rocketchu) 3명은 애초에
// 불멸 승급 경로 자체가 없어서(IMMORTAL_CONDITIONS에 없음) 이 3명은 기존처럼
// 기본 체크 해제 상태로 남겨둔다. 체크 여부 자체는 아직 어느 게임 로직에도
// 쓰이지 않는 저장용 설정이라(favorite처럼 실제로 소비되는 값이 아님) 기본값만
// 바꿔도 안전하다.
function defaultHeroSettingsMap() {
  return new Map(heroesByTier('mythic').map((h) => [
    h.id,
    { ...(IMMORTAL_CONDITIONS[h.id] ? DEFAULT_HERO_SETTING : DEFAULT_HERO_SETTING_NO_IMMORTAL) },
  ]));
}

function createLocalState() {
  return {
    gameType: 'delete', // 'no-delete' | 'delete' - 기본값은 삭제 있는 버전(사용자 지정)
    immortalPet: true,
    settings: defaultHeroSettingsMap(), // heroId -> { immortal, favorite, breakthrough } (신화 등급만 사용)
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
    const cur = local.settings.get(heroId) ?? { ...DEFAULT_HERO_SETTING };
    local.settings.set(heroId, { ...cur, immortal: !cur.immortal });
    update();
  }

  function toggleFavorite(heroId) {
    const cur = local.settings.get(heroId) ?? { ...DEFAULT_HERO_SETTING };
    local.settings.set(heroId, { ...cur, favorite: !cur.favorite });
    update();
  }

  function toggleBreakthrough(heroId) {
    const cur = local.settings.get(heroId) ?? { ...DEFAULT_HERO_SETTING };
    local.settings.set(heroId, { ...cur, breakthrough: !cur.breakthrough });
    update();
  }

  // 불멸이 기본 체크 상태로 바뀌면서, "true/false 둘 다 아니면 저장 안 함" 필터를
  // 그대로 두면 사용자가 명시적으로 체크 해제한 것도 "기본값과 같으니 저장 불필요"로
  // 오해해 저장을 건너뛰고, 나중에 프리셋을 다시 불러올 때 기본값(체크됨)으로
  // 되돌아가버리는 버그가 생긴다 - 필터 없이 28개 신화 설정을 항상 전부 저장한다.
  function collectHeroSettings() {
    return [...local.settings.entries()]
      .map(([heroId, v]) => ({ heroId, immortal: v.immortal, favorite: v.favorite, breakthrough: v.breakthrough }));
  }

  // 불멸 펫 보유 유무 선택 UI는 없앴다(사용자 지정 - 항상 보유한 것으로 가정).
  // local.immortalPet은 createLocalState()에서 true로 고정되고, 프리셋을 불러와도
  // 이 값은 건드리지 않는다(예전 프리셋에 false가 저장돼 있었더라도 무시).
  //
  // 기본값(불멸 체크)으로 맵을 채운 뒤 프리셋에 저장된 favorite/breakthrough만
  // 덮어쓴다 - immortal은 **의도적으로 프리셋 값을 무시**한다: 이 기능을 추가하기
  // 전에 사용자가 즐겨찾기만 켜두고 저장했던 예전 프리셋들에 (당시 기본값이었던)
  // immortal:false가 같이 저장돼 있어서, 그 저장된 false가 여기서 새 기본값(true)을
  // 도로 덮어써버리는 바람에 "다 체크됐다더니 몇 명은 안 됐다"는 리포트로
  // 이어졌다(사용자 지적 - "선택 안된게 있는데 무슨말이야", 실제 스크린샷으로
  // 오크주술사/밤바/마마/개구리왕자/배트맨/베인/아토/로카/채드 9명이 예전 프리셋의
  // 저장된 false 때문에 안 체크된 걸 확인함). 불멸 체크박스 자체가 아직 어느 게임
  // 로직에도 안 쓰이는 값이라 프리셋에 저장된 걸 무시해도 데이터 손실 위험이 없다 -
  // 대신 사용자가 이번 세션에서 직접 체크/해제하면 그 값은 정상적으로 저장되고
  // (collectHeroSettings), 다음에 저장하는 새 프리셋부터는 그 값이 반영된다.
  function applyPreset(preset) {
    local.gameType = preset.gameType;
    const map = defaultHeroSettingsMap();
    for (const h of preset.heroSettings ?? []) {
      const base = map.get(h.heroId) ?? { ...DEFAULT_HERO_SETTING_NO_IMMORTAL };
      map.set(h.heroId, { immortal: base.immortal, favorite: h.favorite ?? false, breakthrough: h.breakthrough ?? false });
    }
    local.settings = map;
    update();
  }

  // 화면을 열 때 기본값으로 지정된 프리셋이 있으면 자동으로 불러온다(사용자 요청).
  const defaultPresetId = getDefaultPresetId();
  if (defaultPresetId) {
    const defaultPreset = loadPreset(defaultPresetId);
    if (defaultPreset) {
      local.gameType = defaultPreset.gameType;
      const map = defaultHeroSettingsMap();
      for (const h of defaultPreset.heroSettings ?? []) {
        const base = map.get(h.heroId) ?? { ...DEFAULT_HERO_SETTING_NO_IMMORTAL };
        map.set(h.heroId, { immortal: base.immortal, favorite: h.favorite ?? false, breakthrough: h.breakthrough ?? false });
      }
      local.settings = map;
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
    const state = local.settings.get(heroDef.id) ?? { ...DEFAULT_HERO_SETTING };
    const checks = [
      el('label', { class: 'immortal-check' }, [
        el('input', {
          type: 'checkbox',
          checked: state.immortal,
          onchange: () => toggleImmortal(heroDef.id),
        }),
        el('span', { text: '불멸' }),
      ]),
    ];
    // 돌파는 지금 13명만 우선 노출한다(위 BREAKTHROUGH_ELIGIBLE_IDS 주석 참고).
    if (BREAKTHROUGH_ELIGIBLE_IDS.has(heroDef.id)) {
      checks.push(el('label', { class: 'breakthrough-check' }, [
        el('input', {
          type: 'checkbox',
          checked: state.breakthrough,
          onchange: () => toggleBreakthrough(heroDef.id),
        }),
        el('span', { text: '돌파' }),
      ]));
    }
    return el('div', { class: 'hero-card' }, [
      el('button', { class: 'favorite-toggle', text: state.favorite ? '★' : '☆', onclick: (e) => { e.stopPropagation(); toggleFavorite(heroDef.id); } }),
      el('div', { class: 'hero-card-body' }, [
        heroImage(heroDef, { className: 'hero-card-image' }),
        el('div', { class: 'hero-name', text: heroDef.name }),
        el('div', { class: 'hero-tier', text: TIER_LABEL[heroDef.tier] }),
      ]),
      el('div', { class: 'hero-card-checks' }, checks),
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
