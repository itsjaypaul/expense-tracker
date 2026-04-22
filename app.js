const STORAGE_KEY = "expense-atlas-state-v2";
const LEGACY_STORAGE_KEYS = ["expense-atlas-state-v1"];
const FALLBACK_CURRENCY = "INR";

const state = {
  expenses: [],
  selectedMonth: "",
  settings: {
    currency: FALLBACK_CURRENCY,
  },
  storageReady: true,
};

const el = {
  expenseForm: document.getElementById("expenseForm"),
  expenseDate: document.getElementById("expenseDate"),
  expenseAmount: document.getElementById("expenseAmount"),
  expenseCategory: document.getElementById("expenseCategory"),
  customCategoryWrap: document.getElementById("customCategoryWrap"),
  customCategory: document.getElementById("customCategory"),
  expenseMerchant: document.getElementById("expenseMerchant"),
  expenseNote: document.getElementById("expenseNote"),
  monthFilter: document.getElementById("monthFilter"),
  currencySelect: document.getElementById("currencySelect"),
  seedDataButton: document.getElementById("seedDataButton"),
  clearDataButton: document.getElementById("clearDataButton"),
  storageStatus: document.getElementById("storageStatus"),
  currentMonthTotal: document.getElementById("currentMonthTotal"),
  currentMonthMeta: document.getElementById("currentMonthMeta"),
  previousMonthTotal: document.getElementById("previousMonthTotal"),
  previousMonthMeta: document.getElementById("previousMonthMeta"),
  momDelta: document.getElementById("momDelta"),
  momDeltaMeta: document.getElementById("momDeltaMeta"),
  avgDailySpend: document.getElementById("avgDailySpend"),
  avgDailyMeta: document.getElementById("avgDailyMeta"),
  monthBars: document.getElementById("monthBars"),
  categoryComparisonList: document.getElementById("categoryComparisonList"),
  expenseTableBody: document.getElementById("expenseTableBody"),
  dailyTotalsList: document.getElementById("dailyTotalsList"),
  pivotTable: document.getElementById("pivotTable"),
  insightsGrid: document.getElementById("insightsGrid"),
  heroMonthCount: document.getElementById("heroMonthCount"),
  heroEntryCount: document.getElementById("heroEntryCount"),
  heroTopCategory: document.getElementById("heroTopCategory"),
};

init();

function init() {
  const today = new Date();
  el.expenseDate.value = formatDateInput(today);
  purgeLegacyStorage();
  hydrateState();
  bindEvents();
  render();
  setStorageStatus("Data saves automatically in this browser.");
}

function bindEvents() {
  el.expenseForm.addEventListener("submit", handleExpenseSubmit);
  el.expenseCategory.addEventListener("change", toggleCustomCategory);
  el.monthFilter.addEventListener("change", handleMonthChange);
  el.currencySelect.addEventListener("change", handleCurrencyChange);
  el.seedDataButton.addEventListener("click", handleSeedData);
  el.clearDataButton.addEventListener("click", handleClearData);
  el.expenseTableBody.addEventListener("click", handleDeleteExpense);
}

function hydrateState() {
  const persisted = safeReadState();

  if (Array.isArray(persisted)) {
    state.expenses = persisted
      .map(normalizeExpense)
      .filter(Boolean)
      .sort(sortExpensesDescending);
  } else if (persisted && typeof persisted === "object") {
    state.expenses = Array.isArray(persisted.expenses)
      ? persisted.expenses.map(normalizeExpense).filter(Boolean).sort(sortExpensesDescending)
      : [];
    state.settings.currency = persisted.settings?.currency || FALLBACK_CURRENCY;
  } else {
    state.expenses = [];
    safeWriteState();
  }

  el.currencySelect.value = state.settings.currency;
  state.selectedMonth = getLatestMonthKey();
}

function handleExpenseSubmit(event) {
  event.preventDefault();

  const amount = Number.parseFloat(el.expenseAmount.value);
  const category = resolveCategory();

  if (!el.expenseDate.value || !amount || amount <= 0 || !category) {
    setStorageStatus("Enter a valid date, amount, and category.");
    return;
  }

  const expense = normalizeExpense({
    id: createId(),
    date: el.expenseDate.value,
    amount,
    category,
    merchant: el.expenseMerchant.value.trim(),
    note: el.expenseNote.value.trim(),
  });

  if (!expense) {
    setStorageStatus("The expense could not be saved. Check the values and try again.");
    return;
  }

  state.expenses.unshift(expense);
  state.expenses.sort(sortExpensesDescending);
  state.selectedMonth = getMonthKeyFromDate(expense.date);
  safeWriteState();
  resetFormAfterSubmit();
  render();
  setStorageStatus("Expense saved and analytics refreshed.");
}

function handleMonthChange(event) {
  state.selectedMonth = event.target.value;
  render();
}

function handleCurrencyChange(event) {
  state.settings.currency = event.target.value || FALLBACK_CURRENCY;
  safeWriteState();
  render();
}

function handleSeedData() {
  const confirmed = window.confirm("Replace current data with sample expenses?");
  if (!confirmed) {
    return;
  }

  state.expenses = buildSampleExpenses();
  state.selectedMonth = getLatestMonthKey();
  safeWriteState();
  render();
  setStorageStatus("Sample data loaded.");
}

function handleClearData() {
  const confirmed = window.confirm("Delete all saved expenses from this browser and reset the dashboard?");
  if (!confirmed) {
    return;
  }

  state.expenses = [];
  state.selectedMonth = getMonthKeyFromDate(new Date());
  removeStoredData();
  safeWriteState();
  render();
  setStorageStatus("All expenses cleared.");
}

function handleDeleteExpense(event) {
  const button = event.target.closest("[data-delete-id]");

  if (!button) {
    return;
  }

  const targetId = button.getAttribute("data-delete-id");
  state.expenses = state.expenses.filter((expense) => expense.id !== targetId);
  safeWriteState();

  const months = getAvailableMonthKeys();
  if (!months.includes(state.selectedMonth)) {
    state.selectedMonth = months[0] || getMonthKeyFromDate(new Date());
  }

  render();
  setStorageStatus("Expense deleted.");
}

function render() {
  renderMonthFilter();

  const selectedMonth = state.selectedMonth || getLatestMonthKey() || getMonthKeyFromDate(new Date());
  const previousMonth = shiftMonthKey(selectedMonth, -1);
  const selectedExpenses = getExpensesForMonth(selectedMonth);
  const previousExpenses = getExpensesForMonth(previousMonth);
  const currentTotal = sumExpenses(selectedExpenses);
  const previousTotal = sumExpenses(previousExpenses);

  renderHero();
  renderSummary(selectedMonth, selectedExpenses, previousMonth, previousExpenses, currentTotal, previousTotal);
  renderMonthBars(selectedMonth);
  renderCategoryComparison(selectedExpenses, previousExpenses);
  renderExpenseTable(selectedExpenses);
  renderDailyTotals(selectedExpenses);
  renderPivotTable();
  renderInsights(selectedMonth, selectedExpenses, previousMonth, previousExpenses, currentTotal, previousTotal);
}

function renderHero() {
  const monthKeys = getAvailableMonthKeys();
  const topCategory = getTopCategory(state.expenses);

  el.heroMonthCount.textContent = String(monthKeys.length);
  el.heroEntryCount.textContent = String(state.expenses.length);
  el.heroTopCategory.textContent = topCategory?.category || "-";
}

function renderMonthFilter() {
  const monthKeys = getAvailableMonthKeys();

  if (!monthKeys.length) {
    monthKeys.push(getMonthKeyFromDate(new Date()));
  }

  if (!monthKeys.includes(state.selectedMonth)) {
    state.selectedMonth = monthKeys[0];
  }

  el.monthFilter.innerHTML = monthKeys
    .map((monthKey) => {
      const selected = monthKey === state.selectedMonth ? "selected" : "";
      return `<option value="${monthKey}" ${selected}>${escapeHtml(formatMonthKey(monthKey))}</option>`;
    })
    .join("");
}

function renderSummary(selectedMonth, selectedExpenses, previousMonth, previousExpenses, currentTotal, previousTotal) {
  const delta = currentTotal - previousTotal;
  const deltaRatio = previousTotal > 0 ? delta / previousTotal : 0;
  const avgDaily = currentTotal / getMonthSpanDays(selectedMonth);
  const activeDays = new Set(selectedExpenses.map((expense) => expense.date)).size;

  el.currentMonthTotal.textContent = formatCurrency(currentTotal);
  el.currentMonthMeta.textContent = `${selectedExpenses.length} entries across ${activeDays || 0} spending days`;

  el.previousMonthTotal.textContent = formatCurrency(previousTotal);
  el.previousMonthMeta.textContent = `${formatMonthKey(previousMonth)} baseline`;

  el.momDelta.textContent = formatSignedCurrency(delta);
  el.momDelta.className = toneClass(delta, "selected-value");
  el.momDeltaMeta.textContent = previousTotal
    ? `${formatPercent(Math.abs(deltaRatio))} ${delta >= 0 ? "higher" : "lower"} than last month`
    : "No previous-month spend to compare";

  el.avgDailySpend.textContent = formatCurrency(avgDaily);
  el.avgDailyMeta.textContent = `${formatMonthKey(selectedMonth)} daily average`;
}

function renderMonthBars(selectedMonth) {
  const monthKeys = getRecentMonthKeys(6);
  const totals = monthKeys.map((monthKey) => ({
    monthKey,
    total: sumExpenses(getExpensesForMonth(monthKey)),
  }));
  const maxTotal = Math.max(...totals.map((entry) => entry.total), 1);

  el.monthBars.innerHTML = totals
    .map(({ monthKey, total }) => {
      const height = Math.max((total / maxTotal) * 100, total > 0 ? 8 : 2);
      const selectedClass = monthKey === selectedMonth ? "month-bar month-bar--selected" : "month-bar";
      return `
        <article class="${selectedClass}">
          <div class="month-bar__track">
            <div class="month-bar__fill" style="height:${height}%"></div>
          </div>
          <div class="month-bar__label">
            <span class="month-bar__month">${escapeHtml(formatShortMonth(monthKey))}</span>
            <span class="month-bar__value">${escapeHtml(formatCompactCurrency(total))}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderCategoryComparison(selectedExpenses, previousExpenses) {
  const currentTotals = getCategoryTotals(selectedExpenses);
  const previousTotals = getCategoryTotals(previousExpenses);
  const categories = Array.from(new Set([...Object.keys(currentTotals), ...Object.keys(previousTotals)]));

  if (!categories.length) {
    el.categoryComparisonList.innerHTML = emptyState("Add some expenses to compare category swings.");
    return;
  }

  const rows = categories
    .map((category) => {
      const current = currentTotals[category] || 0;
      const previous = previousTotals[category] || 0;
      return {
        category,
        current,
        previous,
        delta: current - previous,
      };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.current - a.current)
    .slice(0, 6);

  const maxValue = Math.max(...rows.map((row) => Math.max(row.current, row.previous)), 1);

  el.categoryComparisonList.innerHTML = rows
    .map((row) => {
      const width = Math.max((Math.max(row.current, row.previous) / maxValue) * 100, 6);
      const tone = toneClass(row.delta, "");
      return `
        <article class="comparison-row">
          <div class="comparison-row__top">
            <strong>${escapeHtml(row.category)}</strong>
            <span class="${tone}">${escapeHtml(formatSignedCurrency(row.delta))}</span>
          </div>
          <div class="comparison-row__meta">
            ${escapeHtml(formatCurrency(row.current))} this month vs ${escapeHtml(formatCurrency(row.previous))} last month
          </div>
          <div class="comparison-row__meter">
            <span style="width:${width}%"></span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderExpenseTable(selectedExpenses) {
  if (!selectedExpenses.length) {
    el.expenseTableBody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state">No expenses saved for this month yet.</div>
        </td>
      </tr>
    `;
    return;
  }

  el.expenseTableBody.innerHTML = selectedExpenses
    .map((expense) => {
      return `
        <tr>
          <td>${escapeHtml(formatExpenseDate(expense.date))}</td>
          <td>${escapeHtml(expense.category)}</td>
          <td>${escapeHtml(expense.merchant || "-")}</td>
          <td>${escapeHtml(expense.note || "-")}</td>
          <td class="align-right">${escapeHtml(formatCurrency(expense.amount))}</td>
          <td>
            <button type="button" class="button button--ghost delete-button" data-delete-id="${expense.id}">
              Delete
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderDailyTotals(selectedExpenses) {
  const grouped = selectedExpenses.reduce((accumulator, expense) => {
    const current = accumulator[expense.date] || { total: 0, count: 0 };
    current.total += expense.amount;
    current.count += 1;
    accumulator[expense.date] = current;
    return accumulator;
  }, {});

  const rows = Object.entries(grouped)
    .map(([date, stats]) => ({
      date,
      total: stats.total,
      count: stats.count,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  if (!rows.length) {
    el.dailyTotalsList.innerHTML = emptyState("Daily totals will appear once you add expenses.");
    return;
  }

  const maxTotal = Math.max(...rows.map((row) => row.total), 1);

  el.dailyTotalsList.innerHTML = rows
    .map((row) => {
      const width = Math.max((row.total / maxTotal) * 100, 8);
      return `
        <article class="daily-total">
          <div class="daily-total__header">
            <strong>${escapeHtml(formatExpenseDate(row.date))}</strong>
            <span>${escapeHtml(formatCurrency(row.total))}</span>
          </div>
          <div class="daily-total__meta">${row.count} ${row.count === 1 ? "expense" : "expenses"}</div>
          <div class="daily-total__meter">
            <span style="width:${width}%"></span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderPivotTable() {
  const monthKeys = getRecentMonthKeys(6);
  const categories = getPivotCategories(monthKeys);

  if (!categories.length) {
    el.pivotTable.innerHTML = `
      <tbody>
        <tr>
          <td>${emptyState("The category pivot will appear after you save some expenses.")}</td>
        </tr>
      </tbody>
    `;
    return;
  }

  const categoryTotalsByMonth = monthKeys.reduce((accumulator, monthKey) => {
    accumulator[monthKey] = getCategoryTotals(getExpensesForMonth(monthKey));
    return accumulator;
  }, {});

  const header = `
    <thead>
      <tr>
        <th>Category</th>
        ${monthKeys.map((monthKey) => `<th class="align-right">${escapeHtml(formatShortMonth(monthKey))}</th>`).join("")}
      </tr>
    </thead>
  `;

  const body = `
    <tbody>
      ${categories
        .map((category) => {
          return `
            <tr>
              <td>${escapeHtml(category)}</td>
              ${monthKeys
                .map((monthKey) => {
                  const amount = categoryTotalsByMonth[monthKey][category] || 0;
                  return `<td class="align-right">${escapeHtml(formatCompactCurrency(amount))}</td>`;
                })
                .join("")}
            </tr>
          `;
        })
        .join("")}
    </tbody>
  `;

  const footer = `
    <tfoot>
      <tr>
        <td>Total</td>
        ${monthKeys
          .map((monthKey) => {
            const total = sumExpenses(getExpensesForMonth(monthKey));
            return `<td class="align-right">${escapeHtml(formatCompactCurrency(total))}</td>`;
          })
          .join("")}
      </tr>
    </tfoot>
  `;

  el.pivotTable.innerHTML = `${header}${body}${footer}`;
}

function renderInsights(selectedMonth, selectedExpenses, previousMonth, previousExpenses, currentTotal, previousTotal) {
  const insights = buildInsights(selectedMonth, selectedExpenses, previousMonth, previousExpenses, currentTotal, previousTotal);

  el.insightsGrid.innerHTML = insights.length
    ? insights
        .map((insight) => {
          return `
            <article class="insight-card">
              <div class="pill">${escapeHtml(insight.tag)}</div>
              <h3>${escapeHtml(insight.title)}</h3>
              <p>${escapeHtml(insight.body)}</p>
            </article>
          `;
        })
        .join("")
    : emptyState("Add a few weeks of data to unlock more interesting insights.");
}

function buildInsights(selectedMonth, selectedExpenses, previousMonth, previousExpenses, currentTotal, previousTotal) {
  const insights = [];
  const topCategory = getTopCategory(selectedExpenses);
  const currentDailyTotals = selectedExpenses.reduce((accumulator, expense) => {
    accumulator[expense.date] = (accumulator[expense.date] || 0) + expense.amount;
    return accumulator;
  }, {});
  const peakDay = Object.entries(currentDailyTotals)
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => b.total - a.total)[0];
  const previousTopCategory = getTopCategory(previousExpenses);
  const currentCategoryTotals = getCategoryTotals(selectedExpenses);
  const previousCategoryTotals = getCategoryTotals(previousExpenses);

  if (currentTotal || previousTotal) {
    const delta = currentTotal - previousTotal;
    const direction = delta > 0 ? "higher" : delta < 0 ? "lower" : "flat";
    const text = previousTotal
      ? `${formatMonthKey(selectedMonth)} is ${formatCurrency(Math.abs(delta))} ${direction} than ${formatMonthKey(previousMonth)}.`
      : `${formatMonthKey(selectedMonth)} is your first tracked month in this view.`;

    insights.push({
      tag: "Monthly pulse",
      title: "Overall spend direction",
      body: text,
    });
  }

  if (topCategory) {
    const share = currentTotal ? topCategory.amount / currentTotal : 0;
    insights.push({
      tag: "Category lead",
      title: `${topCategory.category} is leading this month`,
      body: `${topCategory.category} accounts for ${formatPercent(share)} of ${formatMonthKey(selectedMonth)} spending at ${formatCurrency(topCategory.amount)}.`,
    });
  }

  if (peakDay) {
    insights.push({
      tag: "Peak day",
      title: "Your highest-spend day is easy to spot",
      body: `${formatExpenseDate(peakDay.date)} reached ${formatCurrency(peakDay.total)}, making it the most expensive day in ${formatMonthKey(selectedMonth)}.`,
    });
  }

  const swingCategory = getLargestSwingCategory(currentCategoryTotals, previousCategoryTotals);
  if (swingCategory) {
    const direction = swingCategory.delta >= 0 ? "up" : "down";
    insights.push({
      tag: "Biggest swing",
      title: `${swingCategory.category} moved the most month on month`,
      body: `${swingCategory.category} is ${direction} by ${formatCurrency(Math.abs(swingCategory.delta))} versus ${formatMonthKey(previousMonth)}.`,
    });
  }

  if (previousTopCategory && topCategory && previousTopCategory.category !== topCategory.category) {
    insights.push({
      tag: "Shift detected",
      title: "Your leading category changed",
      body: `${previousTopCategory.category} led in ${formatMonthKey(previousMonth)}, but ${topCategory.category} has taken the top spot in ${formatMonthKey(selectedMonth)}.`,
    });
  }

  return insights.slice(0, 6);
}

function getLargestSwingCategory(currentTotals, previousTotals) {
  const categories = Array.from(new Set([...Object.keys(currentTotals), ...Object.keys(previousTotals)]));

  if (!categories.length) {
    return null;
  }

  return categories
    .map((category) => ({
      category,
      delta: (currentTotals[category] || 0) - (previousTotals[category] || 0),
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
}

function getPivotCategories(monthKeys) {
  const monthSet = new Set(monthKeys);
  const totals = {};

  state.expenses.forEach((expense) => {
    if (!monthSet.has(getMonthKeyFromDate(expense.date))) {
      return;
    }

    totals[expense.category] = (totals[expense.category] || 0) + expense.amount;
  });

  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([category]) => category);
}

function getExpensesForMonth(monthKey) {
  return state.expenses.filter((expense) => getMonthKeyFromDate(expense.date) === monthKey);
}

function getCategoryTotals(expenses) {
  return expenses.reduce((accumulator, expense) => {
    accumulator[expense.category] = (accumulator[expense.category] || 0) + expense.amount;
    return accumulator;
  }, {});
}

function getTopCategory(expenses) {
  const totals = getCategoryTotals(expenses);
  return Object.entries(totals)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)[0] || null;
}

function sumExpenses(expenses) {
  return expenses.reduce((sum, expense) => sum + expense.amount, 0);
}

function getAvailableMonthKeys() {
  const keys = Array.from(new Set(state.expenses.map((expense) => getMonthKeyFromDate(expense.date))));
  return keys.sort((a, b) => b.localeCompare(a));
}

function getRecentMonthKeys(limit) {
  const fromData = getAvailableMonthKeys();
  const base = state.selectedMonth || fromData[0] || getMonthKeyFromDate(new Date());
  const generated = [];

  for (let index = limit - 1; index >= 0; index -= 1) {
    generated.push(shiftMonthKey(base, -index));
  }

  return generated;
}

function getLatestMonthKey() {
  return getAvailableMonthKeys()[0] || getMonthKeyFromDate(new Date());
}

function formatCurrency(amount) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: state.settings.currency,
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

function formatCompactCurrency(amount) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: state.settings.currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount || 0);
}

function formatSignedCurrency(amount) {
  const prefix = amount > 0 ? "+" : amount < 0 ? "-" : "";
  return `${prefix}${formatCurrency(Math.abs(amount))}`;
}

function formatPercent(value) {
  return new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value || 0);
}

function formatMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function formatShortMonth(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "2-digit",
  }).format(new Date(year, month - 1, 1));
}

function formatExpenseDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function formatDateInput(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function getMonthKeyFromDate(dateValue) {
  if (typeof dateValue === "string") {
    return dateValue.slice(0, 7);
  }

  return `${dateValue.getFullYear()}-${String(dateValue.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthSpanDays(monthKey) {
  const today = new Date();
  const [year, month] = monthKey.split("-").map(Number);
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1;

  if (isCurrentMonth) {
    return Math.max(today.getDate(), 1);
  }

  return new Date(year, month, 0).getDate();
}

function shiftMonthKey(monthKey, offset) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  return getMonthKeyFromDate(date);
}

function normalizeExpense(rawExpense) {
  if (!rawExpense || !rawExpense.date || !rawExpense.category) {
    return null;
  }

  const amount = Number.parseFloat(rawExpense.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return {
    id: rawExpense.id || createId(),
    date: String(rawExpense.date).slice(0, 10),
    amount,
    category: String(rawExpense.category).trim(),
    merchant: String(rawExpense.merchant || "").trim(),
    note: String(rawExpense.note || "").trim(),
  };
}

function resolveCategory() {
  if (el.expenseCategory.value === "Other") {
    return el.customCategory.value.trim();
  }

  return el.expenseCategory.value.trim();
}

function toggleCustomCategory() {
  const showCustom = el.expenseCategory.value === "Other";
  el.customCategoryWrap.classList.toggle("is-hidden", !showCustom);
  el.customCategory.required = showCustom;

  if (!showCustom) {
    el.customCategory.value = "";
  }
}

function resetFormAfterSubmit() {
  el.expenseAmount.value = "";
  el.expenseCategory.value = "";
  el.expenseMerchant.value = "";
  el.expenseNote.value = "";
  el.customCategory.value = "";
  el.expenseDate.value = formatDateInput(new Date());
  toggleCustomCategory();
}

function toneClass(value, fallback) {
  if (value > 0) {
    return `tone-up ${fallback}`.trim();
  }

  if (value < 0) {
    return `tone-down ${fallback}`.trim();
  }

  return `tone-neutral ${fallback}`.trim();
}

function sortExpensesDescending(left, right) {
  return right.date.localeCompare(left.date) || right.amount - left.amount;
}

function safeReadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    state.storageReady = true;
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    state.storageReady = false;
    return null;
  }
}

function removeStoredData() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    LEGACY_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
    state.storageReady = true;
  } catch (error) {
    state.storageReady = false;
  }
}

function safeWriteState() {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        expenses: state.expenses,
        settings: state.settings,
      }),
    );
    state.storageReady = true;
  } catch (error) {
    state.storageReady = false;
  }
}

function purgeLegacyStorage() {
  try {
    LEGACY_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
    state.storageReady = true;
  } catch (error) {
    state.storageReady = false;
  }
}

function setStorageStatus(message) {
  const suffix = state.storageReady ? "" : " Storage is unavailable in this browser context.";
  el.storageStatus.textContent = `${message}${suffix}`;
}

function createId() {
  return `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyState(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildSampleExpenses() {
  const now = new Date();
  const blueprint = [
    { monthOffset: 0, day: 2, amount: 4200, category: "Housing", merchant: "Rent transfer", note: "Monthly share" },
    { monthOffset: 0, day: 4, amount: 740, category: "Groceries", merchant: "Fresh Basket", note: "Weekly groceries" },
    { monthOffset: 0, day: 5, amount: 360, category: "Dining", merchant: "Cafe Sienna", note: "Lunch meeting" },
    { monthOffset: 0, day: 8, amount: 220, category: "Transport", merchant: "Metro card", note: "Commute top-up" },
    { monthOffset: 0, day: 10, amount: 680, category: "Shopping", merchant: "Urban Cart", note: "Home essentials" },
    { monthOffset: 0, day: 14, amount: 950, category: "Utilities", merchant: "Electricity board", note: "Power bill" },
    { monthOffset: 0, day: 17, amount: 540, category: "Entertainment", merchant: "Cinema Plaza", note: "Weekend movie" },
    { monthOffset: 0, day: 19, amount: 1200, category: "Health", merchant: "City Clinic", note: "Health check" },
    { monthOffset: 1, day: 1, amount: 4200, category: "Housing", merchant: "Rent transfer", note: "Monthly share" },
    { monthOffset: 1, day: 3, amount: 620, category: "Groceries", merchant: "Fresh Basket", note: "Produce and staples" },
    { monthOffset: 1, day: 6, amount: 310, category: "Dining", merchant: "Spice House", note: "Dinner out" },
    { monthOffset: 1, day: 9, amount: 190, category: "Transport", merchant: "Ride app", note: "Late commute" },
    { monthOffset: 1, day: 12, amount: 410, category: "Personal", merchant: "Salon", note: "Haircut" },
    { monthOffset: 1, day: 18, amount: 890, category: "Utilities", merchant: "Internet provider", note: "Quarterly recharge" },
    { monthOffset: 1, day: 24, amount: 1350, category: "Travel", merchant: "Train booking", note: "Family visit" },
    { monthOffset: 2, day: 2, amount: 4200, category: "Housing", merchant: "Rent transfer", note: "Monthly share" },
    { monthOffset: 2, day: 7, amount: 560, category: "Groceries", merchant: "Fresh Basket", note: "Groceries" },
    { monthOffset: 2, day: 11, amount: 250, category: "Dining", merchant: "Tea Room", note: "Brunch" },
    { monthOffset: 2, day: 15, amount: 320, category: "Transport", merchant: "Fuel station", note: "Fuel refill" },
    { monthOffset: 2, day: 19, amount: 1450, category: "Shopping", merchant: "Market Street", note: "Seasonal shopping" },
    { monthOffset: 2, day: 21, amount: 730, category: "Entertainment", merchant: "Streaming annual", note: "Entertainment renewal" },
  ];

  return blueprint
    .map((entry, index) => {
      const baseDate = new Date(now.getFullYear(), now.getMonth() - entry.monthOffset, 1);
      const maxDay = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0).getDate();
      const day = Math.min(entry.day, maxDay);
      return normalizeExpense({
        id: `seed_${index}`,
        date: formatDateInput(new Date(baseDate.getFullYear(), baseDate.getMonth(), day)),
        amount: entry.amount,
        category: entry.category,
        merchant: entry.merchant,
        note: entry.note,
      });
    })
    .filter(Boolean)
    .sort(sortExpensesDescending);
}
