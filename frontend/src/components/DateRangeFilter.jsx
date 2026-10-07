import React from 'react';

/**
 * Reusable Date Range Filter matching user specification:
 * Dates : [start_date] To [end_date] [Show..] [Quick Presets]
 */
export default function DateRangeFilter({
  startDate = '',
  endDate = '',
  onStartDateChange,
  onEndDateChange,
  onApply,
  quickPreset = 'ALL',
  onQuickPresetChange,
  label = 'Dates :',
  buttonText = 'Show..'
}) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && onApply) {
      onApply();
    }
  };

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      background: '#FFFFFF',
      padding: '3px 8px',
      borderRadius: '4px',
      border: '1px solid var(--border-medium)',
      flexWrap: 'wrap'
    }}>
      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
        {label}
      </span>

      {/* Start Date */}
      <input
        type="date"
        value={startDate}
        onChange={(e) => onStartDateChange?.(e.target.value)}
        onKeyDown={handleKeyDown}
        style={{
          fontSize: '0.76rem',
          padding: '3px 6px',
          borderRadius: '3px',
          border: '1.5px solid #2b4c7e',
          background: '#FFFFFF',
          color: '#111827',
          cursor: 'pointer'
        }}
        title="Start Date"
      />

      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
        To
      </span>

      {/* End Date */}
      <input
        type="date"
        value={endDate}
        onChange={(e) => onEndDateChange?.(e.target.value)}
        onKeyDown={handleKeyDown}
        style={{
          fontSize: '0.76rem',
          padding: '3px 6px',
          borderRadius: '3px',
          border: '1.5px solid #2b4c7e',
          background: '#FFFFFF',
          color: '#111827',
          cursor: 'pointer'
        }}
        title="End Date"
      />

      {/* Green Show.. Button */}
      <button
        type="button"
        onClick={onApply}
        style={{
          background: '#22a050',
          color: '#FFFFFF',
          fontSize: '0.76rem',
          fontWeight: 700,
          padding: '4px 12px',
          borderRadius: '3px',
          border: '1px solid #168038',
          cursor: 'pointer',
          boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
          lineHeight: 1.2
        }}
        title="Apply date filter"
      >
        {buttonText}
      </button>

      {/* Quick Range Presets Dropdown */}
      {onQuickPresetChange && (
        <select
          value={quickPreset}
          onChange={onQuickPresetChange}
          style={{
            fontSize: '0.72rem',
            padding: '3px 6px',
            borderRadius: '3px',
            border: '1px solid var(--border-medium)',
            background: '#F9FAFB',
            color: 'var(--text-secondary)'
          }}
          title="Quick range presets"
        >
          <option value="ALL">All Dates</option>
          <option value="TODAY">Today</option>
          <option value="YESTERDAY">Yesterday</option>
          <option value="WEEK">Past 7 Days</option>
          <option value="MONTH">Past 30 Days</option>
          <option value="CUSTOM">Custom Range</option>
        </select>
      )}
    </div>
  );
}
