import { TIER_LABEL, heroesByTier } from '../data/heroes.js';
import { RELIC_KEYS, RELIC_LABEL, RELIC_LEVEL_MIN, RELIC_LEVEL_MAX, isValidRelicLevel } from '../data/relics.js';
import { savePreset, listPresets, loadPreset, deletePreset, PRESET_NAME_MAX_LENGTH } from '../state/presetStore.js';
import { el } from './components/dom.js';

const SELECTABLE_TIERS = ['normal', 'rare', 'hero', 'legendary', 'mythic'];

function createLocalState() {
  return {
    gameType: null, // 'no-delete' | 'delete'
    immortalPet: true,
    relics: { vault: null, moneygun: null, luckstone: null, meat: null, wallet: null },
    owned: new Map(), // heroId -> { owned, immortal, favorite }
  };
}

function isStartReady(s) {
  if (!s.gameType) return false;
  if (RELIC_KEYS.some((k) => !isValidRelicLevel(s.relics[k]))) return false;
  const ownedCount = [...s.owned.values()].filter((v) => v.owned).length;
  return ownedCount >= 1;
}

export function HeroSelectScreen({ onStart }) {
  const root = el('div', { class: 'screen hero-select-screen' });
  const local = createLocalState();

  function update() {
    root.innerHTML = '';
    root.appendChild(render());
  }

  function toggleOwned(heroId) {
    const cur = local.owned.get(heroId) ?? { owned: false, immortal: false, favorite: false };
    local.owned.set(heroId, { ...cur, owned: !cur.owned });
    update();
  }

  function toggleImmortal(heroId) {
    const cur = local.owned.get(heroId);
    if (!cur?.owned) return;
    local.owned.set(heroId, { ...cur, immortal: !cur.immortal });
    update();
  }

  function toggleFavorite(heroId) {
    const cur = local.owned.get(heroId);
    if (!cur?.owned) return;
    local.owned.set(heroId, { ...cur, favorite: !cur.favorite });
    update();
  }

  function collectOwnedHeroes() {
    return [...local.owned.entries()]
      .filter(([, v]) => v.owned)
      .map(([heroId, v]) => ({ heroId, immortal: v.immortal, favorite: v.favorite }));
  }

  function applyPreset(preset) {
    local.gameType = preset.gameType;
    local.immortalPet = preset.immortalPet;
    local.relics = { ...preset.relics };
    local.owned = new Map(preset.ownedHeroes.map((h) => [h.heroId, { owned: true, immortal: h.immortal, favorite: h.favorite }]));
    update();
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
          relics: local.relics,
          ownedHeroes: collectOwnedHeroes(),
        });
        status.textContent = result.ok
          ? '저장됨'
          : { 'empty-name': '이름을 입력하세요', 'name-too-long': '이름이 너무 깁니다', 'duplicate-name': '이미 존재하는 이름입니다', unavailable: '이 브라우저에서는 저장이 안 됩니다', quota: '저장 공간이 부족합니다' }[result.reason] ?? '저장 실패';
      },
    });

    const presets = listPresets();
    const loadSelect = el(
      'select',
      {},
      [el('option', { value: '', text: presets.length ? '불러오기...' : '저장된 프리셋 없음' }), ...presets.map((p) => el('option', { value: p.id, text: p.name }))],
    );
    loadSelect.addEventListener('change', () => {
      if (!loadSelect.value) return;
      const preset = loadPreset(loadSelect.value);
      if (preset) applyPreset(preset);
    });

    const deleteBtn = el('button', {
      class: 'btn btn-danger',
      text: '삭제',
      onclick: () => {
        if (!loadSelect.value) return;
        deletePreset(loadSelect.value);
        update();
      },
    });

    return el('div', { class: 'preset-bar' }, [nameInput, saveBtn, loadSelect, deleteBtn, status]);
  }

  function renderRelicSelects() {
    return el(
      'div',
      { class: 'relic-selects' },
      RELIC_KEYS.map((key) => {
        const options = [el('option', { value: '', text: '레벨 선택' })];
        for (let lvl = RELIC_LEVEL_MIN; lvl <= RELIC_LEVEL_MAX; lvl += 1) {
          options.push(el('option', { value: String(lvl), text: `Lv.${lvl}`, selected: local.relics[key] === lvl }));
        }
        const select = el('select', {}, options);
        select.value = local.relics[key] ?? '';
        select.addEventListener('change', () => {
          local.relics[key] = select.value ? Number(select.value) : null;
          update();
        });
        return el('label', { class: 'relic-select' }, [el('span', { text: RELIC_LABEL[key] }), select]);
      }),
    );
  }

  function renderHeroCard(heroDef) {
    const state = local.owned.get(heroDef.id) ?? { owned: false, immortal: false, favorite: false };
    return el('div', { class: `hero-card ${state.owned ? 'owned' : 'locked'}` }, [
      !state.owned ? el('span', { class: 'lock-icon', text: '🔒' }) : null,
      el('button', { class: 'favorite-toggle', text: state.favorite ? '★' : '☆', onclick: (e) => { e.stopPropagation(); toggleFavorite(heroDef.id); } }),
      el('div', { class: 'hero-card-body', onclick: () => toggleOwned(heroDef.id) }, [
        el('img', { class: 'hero-card-image', src: heroDef.image, alt: heroDef.name }),
        el('div', { class: 'hero-name', text: heroDef.name }),
        el('div', { class: 'hero-tier', text: TIER_LABEL[heroDef.tier] }),
      ]),
      heroDef.tier === 'mythic'
        ? el('label', { class: 'immortal-check' }, [
            el('input', {
              type: 'checkbox',
              checked: state.immortal,
              onchange: () => toggleImmortal(heroDef.id),
            }),
            el('span', { text: '불멸' }),
          ])
        : null,
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
          relics: local.relics,
          ownedHeroes: collectOwnedHeroes(),
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

    const petRadios = [true, false].map((val) =>
      el('label', { class: 'radio' }, [
        el('input', {
          type: 'radio', name: 'immortalPet', checked: local.immortalPet === val,
          onchange: () => { local.immortalPet = val; update(); },
        }),
        el('span', { text: val ? '불멸 펫 보유' : '불멸 펫 미보유' }),
      ]),
    );

    return el('div', { class: 'hero-select-inner' }, [
      el('div', { class: 'top-bar' }, [startBtn]),
      el('section', { class: 'options' }, [
        el('div', { class: 'radio-group', text: '' }, gameTypeRadios),
        el('div', { class: 'radio-group' }, petRadios),
        renderRelicSelects(),
      ]),
      el('section', { class: 'hero-grid' }, SELECTABLE_TIERS.flatMap((tier) => heroesByTier(tier).map(renderHeroCard))),
      renderPresetBar(),
    ]);
  }

  update();
  return root;
}
