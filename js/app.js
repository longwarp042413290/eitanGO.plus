(function () {
  "use strict";

  const STORAGE_KEY = "vocab-words";
  const SETTINGS_KEY = "vocab-settings";
  const DAILY_STATE_KEY = "vocab-daily-state";
  const MAX_CHECKS = 2;
  const DEFAULT_DAILY_GOAL = 20;

  const WORDS_JSON_URL = "words.json";

  /** @typedef {'idle'|'main'|'main_done'|'check2'|'complete'} DailyPhase */
  /** @typedef {{ word: string, meaning: string, checks: number, mastered: boolean, reviewTomorrow: boolean, lastReviewedDay: number, lastCheckDay: number }} WordEntry */
  /** @typedef {{ dailyGoal: number }} Settings */
  /** @typedef {{ cycle: number, phase: DailyPhase, mainQueue: string[], mainIndex: number, check2Queue: string[], check2Index: number, mainReviewCount: number, mainNewCount: number, priorityQueue: string[], priorityIndex: number, priorityReturnPhase: DailyPhase }} DailyState */

  /** @type {WordEntry[]} */
  let words = [];

  /** @type {Settings} */
  let settings = { dailyGoal: DEFAULT_DAILY_GOAL };

  /** @type {DailyState} */
  let dailyState = createDailyState();

  /** @type {'daily'|'review'} */
  let cardMode = "daily";

  /** @type {'start'|'play'|'result'|'end'} */
  let cardScreen = "start";

  /** @type {{ active: boolean, queue: WordEntry[], index: number }} */
  let reviewSession = { active: false, queue: [], index: 0 };

  let showingMeaning = false;

  const $ = (id) => document.getElementById(id);

  const els = {
    viewCard: $("view-card"),
    viewList: $("view-list"),
    navBtns: document.querySelectorAll(".nav-btn"),
    modeTabs: document.querySelectorAll(".mode-tab"),
    panelStart: $("panel-start"),
    panelPlay: $("panel-play"),
    panelResult: $("panel-result"),
    panelEnd: $("panel-end"),
    cycleBadge: $("cycle-badge"),
    startTitle: $("start-title"),
    startDesc: $("start-desc"),
    btnStartMain: $("btn-start-main"),
    btnStartCheck2: $("btn-start-check2"),
    btnRestartMain: $("btn-restart-main"),
    btnAdvanceDay: $("btn-advance-day"),
    btnStartReview: $("btn-start-review"),
    todayProgress: $("today-progress"),
    phaseLabel: $("phase-label"),
    cardCheckControl: $("card-check-control"),
    cardCheckMinus: $("card-check-minus"),
    cardCheckPlus: $("card-check-plus"),
    cardCheckValue: $("card-check-value"),
    cardStar: $("card-star"),
    cardSideLabel: $("card-side-label"),
    cardText: $("card-text"),
    cardHint: $("card-hint"),
    cardEmpty: $("card-empty"),
    btnFlip: $("btn-flip"),
    btnNext: $("btn-next"),
    btnEndReview: $("btn-end-review"),
    resultStats: $("result-stats"),
    btnResultCheck2: $("btn-result-check2"),
    btnResultRestartMain: $("btn-result-restart-main"),
    btnResultFinish: $("btn-result-finish"),
    endTitle: $("end-title"),
    endDesc: $("end-desc"),
    endStats: $("end-stats"),
    btnEndRestartMain: $("btn-end-restart-main"),
    btnAdvanceDayEnd: $("btn-advance-day-end"),
    btnEndHome: $("btn-end-home"),
    dailyGoal: $("daily-goal"),
    btnResetDaily: $("btn-reset-daily"),
    btnResetChecks: $("btn-reset-checks"),
    searchInput: $("search-input"),
    addForm: $("add-form"),
    inputWord: $("input-word"),
    inputMeaning: $("input-meaning"),
    addError: $("add-error"),
    wordList: $("word-list"),
    listEmpty: $("list-empty"),
  };

  function currentCycle() {
    return dailyState.cycle;
  }

  function createDailyState() {
    return {
      cycle: 1,
      phase: "idle",
      mainQueue: [],
      mainIndex: 0,
      check2Queue: [],
      check2Index: 0,
      mainCheck2Count: 0,
      mainReviewCount: 0,
      mainNewCount: 0,
      priorityReturnPhase: "main_done",
    };
  }

  function getImportantWords() {
    return words.filter((w) => w.checks === MAX_CHECKS);
  }

  function clampChecks(value) {
    return Math.max(0, Math.min(MAX_CHECKS, Math.round(Number(value)) || 0));
  }

  function normalizeEntry(entry) {
    entry.checks = clampChecks(entry.checks);
    entry.mastered = entry.checks >= MAX_CHECKS;
    if (typeof entry.lastCheckDay !== "number") entry.lastCheckDay = 0;
    if (typeof entry.lastReviewedDay !== "number") entry.lastReviewedDay = 0;
    return entry;
  }

  function createEntry(word, meaning) {
    return normalizeEntry({
      word: word.trim(),
      meaning: meaning.trim(),
      checks: 0,
      mastered: false,
      reviewTomorrow: false,
      lastReviewedDay: 0,
      lastCheckDay: 0,
    });
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function findWord(word) {
    return words.find((w) => w.word === word);
  }

  function setEntryChecks(entry, value) {
    entry.checks = clampChecks(value);
    entry.mastered = entry.checks >= MAX_CHECKS;
    entry.lastCheckDay = currentCycle();
    saveWords();
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const goal = Number(parsed.dailyGoal);
        if (goal >= 1 && goal <= 999) settings.dailyGoal = goal;
      }
    } catch (_) {
      /* default */
    }
    els.dailyGoal.value = String(settings.dailyGoal);
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function loadDailyState() {
    try {
      const raw = localStorage.getItem(DAILY_STATE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        dailyState = { ...createDailyState(), ...parsed };
        if (!dailyState.cycle || dailyState.cycle < 1) {
          dailyState.cycle = 1;
        }
        saveDailyState();
        return;
      }
    } catch (_) {
      /* reset */
    }
    dailyState = createDailyState();
    saveDailyState();
  }

  function saveDailyState() {
    localStorage.setItem(DAILY_STATE_KEY, JSON.stringify(dailyState));
  }

  function resetDailyStateToDefault() {
    dailyState = createDailyState();
    saveDailyState();
    reviewSession = { active: false, queue: [], index: 0 };
    cardMode = "daily";
    cardScreen = "start";
    showingMeaning = false;
  }

  function resetSessionQueues() {
    dailyState.mainQueue = [];
    dailyState.mainIndex = 0;
    dailyState.check2Queue = [];
    dailyState.check2Index = 0;
    dailyState.mainCheck2Count = 0;
    dailyState.mainReviewCount = 0;
    dailyState.mainNewCount = 0;
  }

  function isMainInProgress() {
    return (
      dailyState.phase === "main" &&
      dailyState.mainQueue.length > 0 &&
      dailyState.mainIndex > 0 &&
      dailyState.mainIndex < dailyState.mainQueue.length
    );
  }

  function canRestartCheck2() {
    return (
      (dailyState.phase === "main_done" || dailyState.phase === "complete") &&
      buildCheck2Queue().length > 0
    );
  }

  function normalizeDailyStateOnLoad() {
    if (dailyState.phase === "main") {
      if (
        dailyState.mainQueue.length === 0 ||
        dailyState.mainIndex >= dailyState.mainQueue.length
      ) {
        dailyState.phase = "main_done";
        dailyState.mainIndex = dailyState.mainQueue.length;
      }
    }
    if (dailyState.phase === "check2") {
      if (dailyState.check2Index >= dailyState.check2Queue.length) {
        dailyState.phase = "complete";
      }
    }
    if (dailyState.phase === "priority") {
      dailyState.phase = dailyState.priorityReturnPhase || "main_done";
    }
    saveDailyState();
  }

  function loadWords() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          words = parsed.map(normalizeEntry);
          return;
        }
      }
    } catch (_) {
      /* empty */
    }
    words = [];
  }

  async function mergeWordsFromJson() {
    try {
      const res = await fetch(WORDS_JSON_URL);
      if (!res.ok) return 0;

      const data = await res.json();
      if (!Array.isArray(data)) return 0;

      const seen = new Set(words.map((w) => w.word.toLowerCase()));
      let added = 0;

      data.forEach((item) => {
        const word = String(item.word || "").trim();
        const meaning = String(item.meaning || "").trim();
        if (!word || !meaning) return;

        const key = word.toLowerCase();
        if (seen.has(key)) return;

        seen.add(key);
        words.push(createEntry(word, meaning));
        added += 1;
      });

      if (added > 0) saveWords();
      return added;
    } catch (_) {
      return 0;
    }
  }

  function saveWords() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
  }

  /** チェック2: 最重要 — ノルマ復習に毎日出現 */
  function getCheck2DailyReviewWords() {
    return shuffle(words.filter((w) => w.checks === MAX_CHECKS));
  }

  /** チェック1: 優先 — 前の学習日に付けた分が翌日ノルマの復習に出る */
  function getCarryOverReviewWords() {
    const prev = currentCycle() - 1;
    if (prev < 1) return [];
    return words.filter(
      (w) => w.lastCheckDay === prev && w.checks === 1
    );
  }

  /** チェック0: 保留（通常）— 新規ノルマ候補（lastReviewedDay は見ない） */
  function getNewWordsForCycle(limit, excluded) {
    const candidates = words.filter((w) => {
      if (excluded.has(w.word)) return false;
      return w.checks === 0;
    });
    return shuffle(candidates).slice(0, limit);
  }

  function buildMainQueue() {
    const check2Daily = getCheck2DailyReviewWords();
    const carry = shuffle(getCarryOverReviewWords());
    const seen = new Set();
    const queue = [];

    const addWords = (list) => {
      list.forEach((w) => {
        if (!seen.has(w.word)) {
          seen.add(w.word);
          queue.push(w.word);
        }
      });
    };

    addWords(check2Daily);
    addWords(carry);
    const fresh = getNewWordsForCycle(settings.dailyGoal, seen);
    addWords(fresh);

    if (queue.length === 0 && words.length > 0) {
      addWords(shuffle(words.filter((w) => w.checks === 0)));
    }
    if (queue.length === 0 && words.length > 0) {
      addWords(shuffle(words.filter((w) => w.checks === 1)));
    }
    if (queue.length === 0 && words.length > 0) {
      addWords(shuffle([...words]).slice(0, settings.dailyGoal));
    }

    return {
      queue,
      check2Count: check2Daily.length,
      reviewCount: carry.length,
      newCount: fresh.length,
    };
  }

  /** 「もう一度」用: チェック2のみ */
  function buildCheck2Queue() {
    return shuffle(words.filter((w) => w.checks === MAX_CHECKS)).map(
      (w) => w.word
    );
  }

  /** 次の日へ進むとき、復習機会の終わったチェック1を自動で0へ */
  function decayCheckOnesOnAdvance() {
    const leaving = dailyState.cycle;
    let changed = false;
    words.forEach((w) => {
      if (w.checks === 1 && w.lastCheckDay < leaving) {
        w.checks = 0;
        w.mastered = false;
        changed = true;
      }
    });
    if (changed) saveWords();
  }

  function canStartMain() {
    return dailyState.phase === "idle";
  }

  function updateCycleBadge() {
    els.cycleBadge.textContent = `学習日 ${dailyState.cycle}`;
  }

  function getActiveQueueInfo() {
    if (cardMode === "review" && reviewSession.active) {
      const q = reviewSession.queue;
      if (q.length === 0) return null;
      const idx =
        ((reviewSession.index % q.length) + q.length) % q.length;
      return {
        current: q[idx],
        index: idx,
        total: q.length,
        label: "最重要（シャッフル）",
      };
    }

    if (cardMode !== "daily") return null;

    if (dailyState.phase === "main") {
      const q = dailyState.mainQueue.map(findWord).filter(Boolean);
      if (q.length === 0) return null;
      const idx = Math.min(dailyState.mainIndex, q.length - 1);
      return {
        current: q[idx],
        index: idx,
        total: q.length,
        label: "今日の分",
      };
    }

    if (dailyState.phase === "check2") {
      const q = dailyState.check2Queue.map(findWord).filter(Boolean);
      if (q.length === 0) return null;
      const idx = Math.min(dailyState.check2Index, q.length - 1);
      return {
        current: q[idx],
        index: idx,
        total: q.length,
        label: "チェック2（最重要）",
      };
    }

    return null;
  }

  function updateCheckControlUI(controlEl, valueEl, minusBtn, plusBtn, checks) {
    valueEl.textContent = `${checks} / ${MAX_CHECKS}`;
    minusBtn.disabled = checks <= 0;
    plusBtn.disabled = checks >= MAX_CHECKS;
    controlEl.classList.toggle("is-full", checks >= MAX_CHECKS);
  }

  function updateCardCheckUI(entry) {
    updateCheckControlUI(
      els.cardCheckControl,
      els.cardCheckValue,
      els.cardCheckMinus,
      els.cardCheckPlus,
      entry.checks
    );
  }

  function renderCardWord(entry) {
    if (showingMeaning) {
      els.cardSideLabel.textContent = "意味";
      els.cardText.textContent = entry.meaning;
    } else {
      els.cardSideLabel.textContent = "英語";
      els.cardText.textContent = entry.word;
    }
  }

  function setCardScreen(screen) {
    cardScreen = screen;
    els.panelStart.classList.toggle("hidden", screen !== "start");
    els.panelPlay.classList.toggle("hidden", screen !== "play");
    els.panelResult.classList.toggle("hidden", screen !== "result");
    els.panelEnd.classList.toggle("hidden", screen !== "end");
  }

  function isSessionActive() {
    return (
      cardScreen === "play" ||
      (cardMode === "daily" &&
        (dailyState.phase === "main" || dailyState.phase === "check2")) ||
      (cardMode === "review" && reviewSession.active)
    );
  }

  function updateModeTabs() {
    const locked = isSessionActive();
    els.modeTabs.forEach((tab) => {
      const active = tab.dataset.mode === cardMode;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.disabled = locked;
    });
  }

  function renderStatsList(container, items) {
    container.innerHTML = "";
    items.forEach(({ label, value }) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
      container.appendChild(li);
    });
  }

  function hideStartButtons() {
    els.btnStartMain.classList.add("hidden");
    els.btnStartCheck2.classList.add("hidden");
    els.btnRestartMain.classList.add("hidden");
    els.btnAdvanceDay.classList.add("hidden");
  }

  function updateAdvanceDayButton(show) {
    els.btnAdvanceDay.classList.toggle("hidden", !show);
    els.btnAdvanceDayEnd.classList.remove("hidden");
  }

  function updateRestartMainButtons() {
    const queue = buildCheck2Queue();
    const show = canRestartCheck2();
    els.btnRestartMain.classList.toggle("hidden", !show);
    els.btnResultRestartMain.classList.toggle("hidden", !show);
    els.btnEndRestartMain.classList.toggle("hidden", !show);
    if (show) {
      const label = `今日の分をもう一度（${queue.length} 語）`;
      els.btnRestartMain.textContent = label;
      els.btnResultRestartMain.textContent = label;
      els.btnEndRestartMain.textContent = label;
    }
  }

  function renderStartPanel() {
    updateCycleBadge();
    els.cardEmpty.classList.toggle("hidden", words.length > 0);
    hideStartButtons();

    if (words.length === 0) {
      els.btnStartReview.classList.add("hidden");
      return;
    }

    if (cardMode === "review") {
      els.startTitle.textContent = "復習モード";
      const count = getImportantWords().length;
      els.startDesc.textContent =
        count > 0
          ? `最重要単語（チェック2）${count} 語をシャッフルして出題。終了するまで無限に繰り返せます。`
          : "最重要単語（チェック2）がありません。一覧でチェック2を付けてください。";
      els.btnStartReview.classList.remove("hidden");
      els.btnStartReview.disabled = count === 0;
      return;
    }

    els.btnStartReview.classList.add("hidden");
    const phase = dailyState.phase;

    if (phase === "idle") {
      const { queue, check2Count, reviewCount, newCount } = buildMainQueue();
      els.startTitle.textContent = `学習日 ${dailyState.cycle} — 今日の分`;
      els.startDesc.textContent =
        queue.length === 0
          ? "学習できる単語がありません。一覧から単語を追加してください。"
          : `チェック2 ${check2Count} + 優先(チェック1) ${reviewCount} + 新規(チェック0) ${newCount} 語（計 ${queue.length} 語）`;
      els.btnStartMain.classList.remove("hidden");
      els.btnStartMain.textContent = "今日の分を開始する";
      els.btnStartMain.disabled = queue.length === 0;
      return;
    }

    if (phase === "main" && isMainInProgress()) {
      const total = dailyState.mainQueue.length;
      const done = dailyState.mainIndex;
      els.startTitle.textContent = "今日の分 — 学習中";
      els.startDesc.textContent = `${done} / ${total} 語まで進んでいます。`;
      els.btnStartMain.classList.remove("hidden");
      els.btnStartMain.textContent = `続きから（${done} / ${total}）`;
      return;
    }

    if (phase === "check2") {
      const total = dailyState.check2Queue.length;
      const done = dailyState.check2Index;
      els.startTitle.textContent = "チェック2復習 — 学習中";
      els.startDesc.textContent = `${done} / ${total} 語まで進んでいます。`;
      els.btnStartCheck2.classList.remove("hidden");
      els.btnStartCheck2.textContent = `続きから（${done} / ${total}）`;
      return;
    }

    if (phase === "main_done" || phase === "complete") {
      const check2 = buildCheck2Queue();
      els.startTitle.textContent = "今日のノルマは完了";
      els.startDesc.textContent =
        check2.length > 0
          ? "「今日の分をもう一度」で再学習できます（何度でも）。準備ができたら「次の日へ進む」へ。"
          : "チェック2の単語がまだありません。「次の日へ進む」で新しいノルマを開始できます。";

      updateRestartMainButtons();
      updateAdvanceDayButton(true);
    }
  }

  function resumeDailySession() {
    showingMeaning = false;
    setCardScreen("play");
    renderCardView();
  }

  function renderPlayPanel() {
    const info = getActiveQueueInfo();
    const isReview = cardMode === "review";

    els.btnEndReview.classList.toggle("hidden", !isReview);
    els.cardStar.classList.toggle("hidden", isReview);
    els.phaseLabel.textContent = info ? info.label : "";

    if (!info || !info.current) {
      els.cardText.textContent = "—";
      return;
    }

    const entry = info.current;
    renderCardWord(entry);
    updateCardCheckUI(entry);

    if (isReview) {
      els.todayProgress.textContent = `${info.index + 1} / ${info.total}（シャッフル）`;
      els.cardHint.textContent =
        "Space：切替　Enter：次へ　+ / −：チェック　Esc：終了";
    } else {
      els.todayProgress.textContent = `${info.index + 1} / ${info.total}`;
      els.cardHint.textContent = "Space：切替　Enter：次へ　+ / −：チェック";
      els.cardStar.textContent = entry.reviewTomorrow ? "★" : "☆";
      els.cardStar.classList.toggle("is-on", entry.reviewTomorrow);
      els.cardStar.setAttribute("aria-pressed", String(entry.reviewTomorrow));
    }

    els.btnFlip.disabled = false;
    els.btnNext.disabled = false;
    els.cardCheckMinus.disabled = false;
    els.cardCheckPlus.disabled = false;
  }

  function renderResultPanel() {
    renderStatsList(els.resultStats, [
      { label: "学習した単語", value: `${dailyState.mainQueue.length} 語` },
      { label: "うちチェック2", value: `${dailyState.mainCheck2Count} 語` },
      { label: "うち優先(チェック1)", value: `${dailyState.mainReviewCount} 語` },
      { label: "うち新規(チェック0)", value: `${dailyState.mainNewCount} 語` },
    ]);

    els.btnResultCheck2.classList.add("hidden");
    els.btnResultFinish.textContent = "いったん終了";
    updateRestartMainButtons();
  }

  function renderEndPanel() {
    els.endTitle.textContent = "お疲れさまでした";
    els.endDesc.textContent =
      "今日の流れは一通り終えました。「今日の分をもう一度」か「次の日へ進む」で続けられます。";

    renderStatsList(els.endStats, [
      { label: "学習日", value: `${dailyState.cycle}` },
      {
        label: "チェック2復習",
        value: `${dailyState.check2Queue.length} 語`,
      },
    ]);

    updateRestartMainButtons();
    updateAdvanceDayButton(true);
  }

  function renderCardView() {
    updateModeTabs();
    updateCycleBadge();

    if (words.length === 0 && cardScreen !== "start") {
      setCardScreen("start");
    }

    if (cardScreen === "start") renderStartPanel();
    else if (cardScreen === "play") {
      renderPlayPanel();
      els.cardText.focus();
    } else if (cardScreen === "result") renderResultPanel();
    else if (cardScreen === "end") renderEndPanel();
  }

  function setView(name) {
    const isCard = name === "card";
    els.viewCard.classList.toggle("is-active", isCard);
    els.viewCard.hidden = !isCard;
    els.viewList.hidden = isCard;

    els.navBtns.forEach((btn) => {
      const active = btn.dataset.view === name;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-current", active ? "page" : "false");
    });

    if (isCard) renderCardView();
    else renderList();
  }

  function setCardMode(mode) {
    if (isSessionActive()) return;
    cardMode = mode;
    cardScreen = "start";
    renderCardView();
  }

  function startDailyMain() {
    if (!canStartMain()) return;
    const { queue, check2Count, reviewCount, newCount } = buildMainQueue();
    if (queue.length === 0) return;

    dailyState.phase = "main";
    dailyState.mainQueue = queue;
    dailyState.mainIndex = 0;
    dailyState.mainCheck2Count = check2Count;
    dailyState.mainReviewCount = reviewCount;
    dailyState.mainNewCount = newCount;
    saveDailyState();

    showingMeaning = false;
    setCardScreen("play");
    renderCardView();
  }

  function restartDailyMain() {
    startDailyCheck2(true);
  }

  function finishDailyMain() {
    dailyState.phase = "main_done";
    dailyState.mainIndex = dailyState.mainQueue.length;
    dailyState.priorityReturnPhase = "main_done";
    saveDailyState();
    setCardScreen("result");
    renderCardView();
  }

  function startDailyCheck2(isRepeat) {
    const queue = buildCheck2Queue();
    if (queue.length === 0) {
      if (isRepeat) {
        alert("チェック2の単語がありません。");
      } else {
        finishTodayComplete();
      }
      return;
    }

    const returnPhase =
      dailyState.phase === "complete" ? "complete" : "main_done";

    dailyState.phase = "check2";
    dailyState.check2Queue = queue;
    dailyState.check2Index = 0;
    dailyState.priorityReturnPhase = isRepeat ? returnPhase : "complete";
    saveDailyState();

    showingMeaning = false;
    setCardScreen("play");
    renderCardView();
  }

  function finishDailyCheck2() {
    dailyState.phase = "complete";
    dailyState.check2Index = dailyState.check2Queue.length;
    dailyState.priorityReturnPhase = "complete";
    saveDailyState();
    setCardScreen("start");
    renderCardView();
  }

  function finishTodayComplete() {
    dailyState.phase = dailyState.phase === "main_done" ? "main_done" : "complete";
    if (buildCheck2Queue().length === 0) {
      dailyState.phase = "complete";
      dailyState.priorityReturnPhase = "complete";
    }
    saveDailyState();
    setCardScreen("start");
    renderCardView();
  }

  function advanceToNextDay() {
    const next = dailyState.cycle + 1;
    const msg =
      `学習日 ${dailyState.cycle} を完了し、学習日 ${next} に進みます。\n` +
      "新しい「今日の分」（ノルマ + 繰り越し復習）を開始できるようになります。";
    if (!confirm(msg)) return;

    decayCheckOnesOnAdvance();
    dailyState.cycle = next;
    dailyState.phase = "idle";
    resetSessionQueues();
    saveDailyState();

    setCardScreen("start");
    renderCardView();
  }

  function startReviewMode() {
    const important = getImportantWords();
    if (important.length === 0) {
      alert("最重要単語（チェック2）がありません。");
      return;
    }
    reviewSession = {
      active: true,
      queue: shuffle(important),
      index: 0,
    };
    showingMeaning = false;
    setCardScreen("play");
    renderCardView();
  }

  function endReviewMode() {
    reviewSession = { active: false, queue: [], index: 0 };
    setCardScreen("start");
    renderCardView();
  }

  function goNext() {
    const info = getActiveQueueInfo();
    if (!info || !info.current) return;

    const ref = findWord(info.current.word);
    if (ref) {
      ref.lastReviewedDay = currentCycle();
      if (cardMode === "daily") {
        ref.reviewTomorrow = false;
      }
      saveWords();
    }

    showingMeaning = false;

    if (cardMode === "review" && reviewSession.active) {
      reviewSession.index += 1;
      if (reviewSession.index >= reviewSession.queue.length) {
        const important = getImportantWords();
        if (important.length === 0) {
          endReviewMode();
          return;
        }
        reviewSession.queue = shuffle(important);
        reviewSession.index = 0;
      }
      renderPlayPanel();
      els.cardText.focus();
      return;
    }

    if (dailyState.phase === "main") {
      dailyState.mainIndex += 1;
      saveDailyState();
      if (dailyState.mainIndex >= dailyState.mainQueue.length) {
        finishDailyMain();
        return;
      }
      renderPlayPanel();
      els.cardText.focus();
      return;
    }

    if (dailyState.phase === "check2") {
      dailyState.check2Index += 1;
      saveDailyState();
      if (dailyState.check2Index >= dailyState.check2Queue.length) {
        finishDailyCheck2();
        return;
      }
      renderPlayPanel();
      els.cardText.focus();
      return;
    }

  }

  function flipCard() {
    const info = getActiveQueueInfo();
    if (!info || !info.current) return;
    showingMeaning = !showingMeaning;
    renderCardWord(info.current);
  }

  function changeCurrentChecks(delta) {
    const info = getActiveQueueInfo();
    if (!info || !info.current) return;
    const ref = findWord(info.current.word);
    if (!ref) return;
    setEntryChecks(ref, ref.checks + delta);
    updateCardCheckUI(ref);
  }

  function toggleStar() {
    if (cardMode !== "daily") return;
    const info = getActiveQueueInfo();
    if (!info || !info.current) return;
    const ref = findWord(info.current.word);
    if (!ref) return;
    ref.reviewTomorrow = !ref.reviewTomorrow;
    saveWords();
    els.cardStar.textContent = ref.reviewTomorrow ? "★" : "☆";
    els.cardStar.classList.toggle("is-on", ref.reviewTomorrow);
    els.cardStar.setAttribute("aria-pressed", String(ref.reviewTomorrow));
  }

  function createCheckControlElement(entry, onChange) {
    const control = document.createElement("div");
    control.className = "check-control";

    const btnMinus = document.createElement("button");
    btnMinus.type = "button";
    btnMinus.className = "check-btn";
    btnMinus.textContent = "−";

    const value = document.createElement("span");
    value.className = "check-value";

    const btnPlus = document.createElement("button");
    btnPlus.type = "button";
    btnPlus.className = "check-btn";
    btnPlus.textContent = "+";

    const refresh = () => {
      updateCheckControlUI(control, value, btnMinus, btnPlus, entry.checks);
    };

    btnMinus.addEventListener("click", (e) => {
      e.stopPropagation();
      if (entry.checks <= 0) return;
      setEntryChecks(entry, entry.checks - 1);
      refresh();
      onChange();
    });

    btnPlus.addEventListener("click", (e) => {
      e.stopPropagation();
      if (entry.checks >= MAX_CHECKS) return;
      setEntryChecks(entry, entry.checks + 1);
      refresh();
      onChange();
    });

    refresh();
    control.append(btnMinus, value, btnPlus);
    return control;
  }

  function getFilteredWords() {
    const q = els.searchInput.value.trim().toLowerCase();
    if (!q) return words;
    return words.filter(
      (w) =>
        w.word.toLowerCase().includes(q) ||
        w.meaning.toLowerCase().includes(q)
    );
  }

  function renderList() {
    const filtered = getFilteredWords();
    els.listEmpty.classList.toggle("hidden", filtered.length > 0);
    els.wordList.innerHTML = "";

    filtered.forEach((entry) => {
      const li = document.createElement("li");
      li.className = "word-item";

      const main = document.createElement("div");
      main.className = "word-item-main";
      const en = document.createElement("span");
      en.className = "word-en";
      en.textContent = entry.word;
      const meaning = document.createElement("span");
      meaning.className = "word-meaning";
      meaning.textContent = entry.meaning;
      main.append(en, meaning);

      const actions = document.createElement("div");
      actions.className = "word-item-actions";
      const checkControl = createCheckControlElement(entry, () => {
        if (cardScreen === "play") renderPlayPanel();
      });

      const btnStar = document.createElement("button");
      btnStar.type = "button";
      btnStar.className = "btn-icon" + (entry.reviewTomorrow ? " is-on" : "");
      btnStar.textContent = entry.reviewTomorrow ? "★" : "☆";
      btnStar.addEventListener("click", () => {
        entry.reviewTomorrow = !entry.reviewTomorrow;
        saveWords();
        renderList();
      });

      const btnDelete = document.createElement("button");
      btnDelete.type = "button";
      btnDelete.className = "btn-icon btn-danger";
      btnDelete.textContent = "×";
      btnDelete.addEventListener("click", () => {
        if (!confirm(`「${entry.word}」を削除しますか？`)) return;
        words = words.filter((w) => w.word !== entry.word);
        saveWords();
        renderList();
        renderCardView();
      });

      actions.append(checkControl, btnStar, btnDelete);
      li.append(main, actions);
      els.wordList.appendChild(li);
    });
  }

  function showAddError(msg) {
    if (msg) {
      els.addError.textContent = msg;
      els.addError.classList.remove("hidden");
    } else {
      els.addError.textContent = "";
      els.addError.classList.add("hidden");
    }
  }

  function addWord(wordRaw, meaningRaw) {
    const word = wordRaw.trim();
    const meaning = meaningRaw.trim();
    if (!word || !meaning) {
      showAddError("英単語と意味の両方を入力してください。");
      return false;
    }
    if (words.some((w) => w.word.toLowerCase() === word.toLowerCase())) {
      showAddError(`「${word}」は既に登録されています。`);
      return false;
    }
    words.push(createEntry(word, meaning));
    saveWords();
    showAddError("");
    els.inputWord.value = "";
    els.inputMeaning.value = "";
    renderList();
    renderCardView();
    return true;
  }

  function resetDailyStateWithConfirm() {
    if (
      !confirm(
        "学習状態を初期化します。\n" +
          "・学習日を 1 に戻す\n" +
          "・ノルマ未開始の状態に戻す\n" +
          "（単語データとチェックはそのまま）"
      )
    ) {
      return;
    }
    resetDailyStateToDefault();
    setCardScreen("start");
    renderCardView();
  }

  function resetAllChecks() {
    if (words.length === 0) return;
    if (!confirm("すべての単語のチェックを 0 にリセットしますか？")) return;
    words.forEach((w) => {
      w.checks = 0;
      w.mastered = false;
      w.lastCheckDay = 0;
    });
    saveWords();
    renderList();
    renderCardView();
  }

  function applyDailyGoal() {
    const goal = Number(els.dailyGoal.value);
    if (!Number.isFinite(goal) || goal < 1 || goal > 999) {
      els.dailyGoal.value = String(settings.dailyGoal);
      return;
    }
    settings.dailyGoal = Math.round(goal);
    els.dailyGoal.value = String(settings.dailyGoal);
    saveSettings();
    if (cardScreen === "start") renderStartPanel();
  }

  function isTypingTarget(el) {
    return (
      el &&
      (el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.isContentEditable)
    );
  }

  function initEvents() {
    els.navBtns.forEach((btn) => {
      btn.addEventListener("click", () => setView(btn.dataset.view));
    });

    els.modeTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        if (!tab.disabled) setCardMode(tab.dataset.mode);
      });
    });

    els.btnStartMain.addEventListener("click", () => {
      if (isMainInProgress()) resumeDailySession();
      else if (canStartMain()) startDailyMain();
    });

    els.btnRestartMain.addEventListener("click", restartDailyMain);
    els.btnResultRestartMain.addEventListener("click", restartDailyMain);
    els.btnEndRestartMain.addEventListener("click", restartDailyMain);

    els.btnStartCheck2.addEventListener("click", () => {
      if (dailyState.phase === "check2") resumeDailySession();
      else startDailyCheck2(false);
    });

    els.btnAdvanceDay.addEventListener("click", advanceToNextDay);
    els.btnAdvanceDayEnd.addEventListener("click", advanceToNextDay);

    els.btnStartReview.addEventListener("click", startReviewMode);
    els.btnEndReview.addEventListener("click", endReviewMode);
    els.btnResultCheck2.addEventListener("click", () => startDailyCheck2(false));
    els.btnResultFinish.addEventListener("click", finishTodayComplete);
    els.btnEndHome.addEventListener("click", () => {
      setCardScreen("start");
      renderCardView();
    });

    els.btnFlip.addEventListener("click", flipCard);
    els.btnNext.addEventListener("click", goNext);
    els.cardStar.addEventListener("click", toggleStar);
    els.cardCheckMinus.addEventListener("click", () => changeCurrentChecks(-1));
    els.cardCheckPlus.addEventListener("click", () => changeCurrentChecks(1));

    els.dailyGoal.addEventListener("change", applyDailyGoal);
    els.dailyGoal.addEventListener("blur", applyDailyGoal);
    els.searchInput.addEventListener("input", renderList);
    els.btnResetDaily.addEventListener("click", resetDailyStateWithConfirm);
    els.btnResetChecks.addEventListener("click", resetAllChecks);
    els.addForm.addEventListener("submit", (e) => {
      e.preventDefault();
      addWord(els.inputWord.value, els.inputMeaning.value);
    });

    document.addEventListener("keydown", (e) => {
      if (!els.viewCard.classList.contains("is-active")) return;
      if (isTypingTarget(document.activeElement)) return;
      if (cardScreen !== "play") return;

      if (e.code === "Space") {
        e.preventDefault();
        flipCard();
      } else if (e.code === "Enter") {
        e.preventDefault();
        goNext();
      } else if (e.key === "s" || e.key === "S") {
        if (cardMode === "daily") toggleStar();
      } else if (e.key === "+" || e.key === "=") {
        changeCurrentChecks(1);
      } else if (e.key === "-" || e.key === "_") {
        changeCurrentChecks(-1);
      } else if (e.code === "Escape" && cardMode === "review") {
        endReviewMode();
      }
    });
  }

  async function init() {
    loadSettings();
    loadWords();
    await mergeWordsFromJson();
    loadDailyState();

    if (new URLSearchParams(location.search).has("reset")) {
      resetDailyStateToDefault();
      history.replaceState(null, "", location.pathname);
    }

    normalizeDailyStateOnLoad();
    initEvents();
    setCardScreen("start");
    setView("card");
  }

  init();
})();
