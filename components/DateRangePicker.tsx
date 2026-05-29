'use client';

import { useState } from 'react';

interface DateRangePickerProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  max?: string;
}

interface Preset {
  label: string;
  getDates: () => { from: string; to: string };
}

function fmtLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return fmtLocal(d);
}

function getPresets(): Preset[] {
  return [
    {
      label: 'Yesterday',
      getDates: () => { const y = getYesterday(); return { from: y, to: y }; },
    },
    {
      label: 'Last 7 Days',
      getDates: () => {
        const to = new Date(); to.setDate(to.getDate() - 1);
        const from = new Date(to); from.setDate(from.getDate() - 6);
        return { from: fmtLocal(from), to: fmtLocal(to) };
      },
    },
    {
      label: 'Last 15 Days',
      getDates: () => {
        const to = new Date(); to.setDate(to.getDate() - 1);
        const from = new Date(to); from.setDate(from.getDate() - 14);
        return { from: fmtLocal(from), to: fmtLocal(to) };
      },
    },
    {
      label: 'Last Month',
      getDates: () => {
        const now = new Date();
        const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const to = new Date(now.getFullYear(), now.getMonth(), 0);
        return { from: fmtLocal(from), to: fmtLocal(to) };
      },
    },
  ];
}

function toYearMonth(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function prevMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function nextMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const names = ['January','February','March','April','May','June',
                 'July','August','September','October','November','December'];
  return `${names[m - 1]} ${y}`;
}

function formatRange(from: string, to: string): string {
  const f = (s: string) => new Date(s + 'T00:00:00')
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return from === to ? f(from) : `${f(from)} → ${f(to)}`;
}

interface DayCell { date: string; day: number; otherMonth: boolean; }

function buildCalendarDays(ym: string): DayCell[] {
  const [y, m] = ym.split('-').map(Number);
  const firstDay = new Date(y, m - 1, 1);
  const lastDay  = new Date(y, m, 0);
  const cells: DayCell[] = [];

  // Leading days from previous month
  const startDow = firstDay.getDay();
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(y, m - 1, -i);
    cells.push({ date: fmtLocal(d), day: d.getDate(), otherMonth: true });
  }
  // Days in this month
  for (let n = 1; n <= lastDay.getDate(); n++) {
    cells.push({ date: `${ym}-${String(n).padStart(2, '0')}`, day: n, otherMonth: false });
  }
  // Trailing days to complete 6 rows (42 cells)
  const trailing = 42 - cells.length;
  for (let n = 1; n <= trailing; n++) {
    const d = new Date(y, m, n);
    cells.push({ date: fmtLocal(d), day: n, otherMonth: true });
  }
  return cells;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function DateRangePicker({ from, to, onChange, max }: DateRangePickerProps) {
  const effectiveMax = max ?? getYesterday();
  const maxMonth = toYearMonth(effectiveMax);
  const today = fmtLocal(new Date());

  const presets = getPresets();
  const activePreset = presets.find(p => {
    const d = p.getDates();
    return d.from === from && d.to === to;
  });

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [viewMonth, setViewMonth]       = useState(() => toYearMonth(to));
  const [selectingStart, setSelectingStart] = useState<string | null>(null);
  const [hoverDate, setHoverDate]           = useState<string | null>(null);

  function handlePreset(preset: Preset) {
    const { from: f, to: t } = preset.getDates();
    onChange(f, t);
    setCalendarOpen(false);
    setSelectingStart(null);
    setHoverDate(null);
  }

  function handleCustomToggle() {
    setCalendarOpen(prev => {
      if (!prev) setViewMonth(toYearMonth(to));
      return !prev;
    });
    setSelectingStart(null);
    setHoverDate(null);
  }

  function handleDayClick(date: string) {
    if (date > effectiveMax) return;
    if (selectingStart === null) {
      setSelectingStart(date);
    } else {
      let f = selectingStart, t = date;
      if (f > t) { [f, t] = [t, f]; }
      onChange(f, t);
      setCalendarOpen(false);
      setSelectingStart(null);
      setHoverDate(null);
    }
  }

  function dayClass(date: string, otherMonth: boolean): string {
    const cls = ['drp-day'];
    if (otherMonth) cls.push('other-month');
    if (date > effectiveMax) cls.push('disabled');
    if (date === today) cls.push('today');

    if (selectingStart !== null) {
      const lo = selectingStart < (hoverDate ?? selectingStart) ? selectingStart : (hoverDate ?? selectingStart);
      const hi = selectingStart < (hoverDate ?? selectingStart) ? (hoverDate ?? selectingStart) : selectingStart;
      if (date === selectingStart) {
        cls.push(hoverDate === null || hoverDate >= selectingStart ? 'start' : 'end');
      }
      if (hoverDate && date === hoverDate) {
        cls.push(hoverDate >= selectingStart ? 'end' : 'start');
      }
      if (date > lo && date < hi) cls.push('hover-range');
    } else {
      if (date === from && date === to)  { cls.push('start', 'end'); }
      else if (date === from)             cls.push('start');
      else if (date === to)               cls.push('end');
      else if (date > from && date < to)  cls.push('in-range');
    }
    return cls.join(' ');
  }

  const days = buildCalendarDays(viewMonth);

  return (
    <div className="drp-root">
      <div className="drp-toolbar">
        {presets.map(preset => (
          <button
            key={preset.label}
            className={`drp-preset-btn${activePreset?.label === preset.label ? ' active' : ''}`}
            onClick={() => handlePreset(preset)}
          >
            {preset.label}
          </button>
        ))}
        <div className="drp-custom-wrap">
          <button
            className={`drp-preset-btn drp-custom-btn${!activePreset ? ' active' : ''}`}
            onClick={handleCustomToggle}
          >
            Custom {calendarOpen ? '▴' : '▾'}
          </button>
          <div className={`drp-calendar-wrap${calendarOpen ? ' open' : ''}`}>
            <div className="drp-cal-inner">
              <div className="drp-cal-header">
                <button className="drp-cal-nav" onClick={() => setViewMonth(prevMonth)}>◀</button>
                <span className="drp-cal-month">{monthLabel(viewMonth)}</span>
                <button
                  className="drp-cal-nav"
                  disabled={viewMonth >= maxMonth}
                  onClick={() => setViewMonth(nextMonth)}
                >▶</button>
              </div>

              <div className="drp-cal-grid">
                {DOW.map(d => <div key={d} className="drp-dow">{d}</div>)}
                {days.map(({ date, day, otherMonth }) => (
                  <div
                    key={date}
                    className={dayClass(date, otherMonth)}
                    onClick={() => handleDayClick(date)}
                    onMouseEnter={() => { if (selectingStart !== null) setHoverDate(date); }}
                    onMouseLeave={() => { if (selectingStart !== null) setHoverDate(null); }}
                  >
                    {day}
                  </div>
                ))}
              </div>

              {selectingStart !== null && (
                <div className="drp-hint">Click a second date to complete the range</div>
              )}
            </div>
          </div>
        </div>
        <div className="drp-spacer" />
        <div className="drp-range-label">{formatRange(from, to)}</div>
      </div>
    </div>
  );
}
