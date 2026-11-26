/** Grey placeholder blocks shown while data loads. Screen readers hear one "Loading" instead. */
const bar = (w: string, h = 12, extra = ''): string => `<span class="sk" style="width:${w};height:${h}px${extra}"></span>`;
const times = (n: number, f: (i: number) => string): string => Array.from({ length: n }, (_, i) => f(i)).join('');
const wrap = (html: string): string => `<div class="sk-wrap" role="status" aria-busy="true"><span class="sr">Loading…</span>${html}</div>`;
const W = ['92%', '78%', '85%', '64%', '88%', '71%'];

export function skPage(): string {
  return wrap(`<div class="sk-col">${bar('240px', 30)}${bar('380px', 14)}</div>${skKpis(false)}`);
}

function skKpis(wrapped = true): string {
  const html = `<div class="kpis">${times(4, () => `<div class="kpi sk-col">${bar('60%', 12)}${bar('45%', 30)}${bar('80%', 10)}</div>`)}</div>`;
  return wrapped ? wrap(html) : html;
}

export function skDash(): string {
  const panel = (): string => `<section class="panel">${bar('140px', 16, ';margin-bottom:14px')}<div class="bars">${times(7, (i) =>
    `<div class="b">${bar(W[i % W.length] ?? '80%', 12)}<div class="track"><span class="sk" style="display:block;width:${90 - i * 11}%;height:100%"></span></div>${bar('100%', 12)}</div>`)}</div></section>`;
  return wrap(`${skKpis(false)}<div class="grid2 gap">${panel()}${panel()}</div>`);
}

/** Review list rows. */
export function skRows(n = 8): string {
  return wrap(times(n, (i) => `<div class="rowbtn sk-col">${bar('40%', 14)}${bar(W[i % W.length] ?? '80%', 12)}${bar('55%', 10)}</div>`));
}

/** Review detail pane. */
export function skDetail(): string {
  const box = `<div class="box sk-col">${bar('40%', 10)}${bar('90%', 18)}${bar('70%', 10)}${bar('60%', 10)}</div>`;
  return wrap(`<div class="sk-col">${bar('180px', 22)}${bar('50%', 12)}</div><div class="grid2 cmp">${box}${box}</div>
    <div class="sk-col">${bar('120px', 10)}${bar('85%', 12)}</div>
    <div class="minis">${times(4, () => `<div class="mini sk-col">${bar('50%', 10)}${bar('80%', 14)}</div>`)}</div>`);
}

/** QA cards. */
export function skCards(n = 4): string {
  return wrap(times(n, (i) => `<div class="qa-card"><div class="qa-main sk-col">${bar('45%', 16)}${bar(W[i % W.length] ?? '80%', 12)}${bar('60%', 18)}${bar('35%', 10)}</div>
    <div class="qa-actions">${bar('84px', 34)}${bar('84px', 34)}</div></div>`));
}

/** Table body rows. */
export function skTableRows(cols: number, n = 5): string {
  return times(n, () => `<tr aria-busy="true">${times(cols, (c) => `<td>${bar(c === 0 ? '70%' : '55%', 12)}</td>`)}</tr>`);
}
