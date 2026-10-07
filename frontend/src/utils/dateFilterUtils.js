/**
 * Helper utilities for standard date range filtering across all pages
 */

export const getLocalDateStr = (ts) => {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts).slice(0, 10);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return String(ts).slice(0, 10);
  }
};

export const formatYMD = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const computePresetDates = (preset) => {
  const now = new Date();
  if (preset === 'TODAY') {
    const today = formatYMD(now);
    return { startDate: today, endDate: today };
  }
  if (preset === 'YESTERDAY') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const yStr = formatYMD(y);
    return { startDate: yStr, endDate: yStr };
  }
  if (preset === 'WEEK') {
    const past7 = new Date(now);
    past7.setDate(past7.getDate() - 7);
    return { startDate: formatYMD(past7), endDate: formatYMD(now) };
  }
  if (preset === 'MONTH') {
    const past30 = new Date(now);
    past30.setDate(past30.getDate() - 30);
    return { startDate: formatYMD(past30), endDate: formatYMD(now) };
  }
  return { startDate: '', endDate: '' };
};

export const isWithinDateRange = (ts, appliedStartDate, appliedEndDate) => {
  if (!appliedStartDate && !appliedEndDate) return true;
  if (!ts) return false;
  const itemDate = getLocalDateStr(ts);
  if (appliedStartDate && itemDate < appliedStartDate) return false;
  if (appliedEndDate && itemDate > appliedEndDate) return false;
  return true;
};
