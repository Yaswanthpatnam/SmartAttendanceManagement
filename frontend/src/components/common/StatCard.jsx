/**
 * Metric KPI Card Component
 * =========================
 * Displays an executive stat card featuring numerical value, descriptive label,
 * contextual icon, left accent border, and optional trend/subtext indicator.
 */

import React from 'react';

export default function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'brand',
  trend
}) {
  // Color palette styles defining left accent border and icon background
  const colorStyles = {
    brand: {
      border: 'border-l-4 border-l-[#3F8F99]',
      iconBg: 'bg-[#F0FDF8] text-[#3F8F99]',
    },
    teal: {
      border: 'border-l-4 border-l-[#53B4AF]',
      iconBg: 'bg-[#AAFFC7]/30 text-[#2F4858]',
    },
    navy: {
      border: 'border-l-4 border-l-[#2F4858]',
      iconBg: 'bg-slate-100 text-[#2F4858]',
    },
    amber: {
      border: 'border-l-4 border-l-amber-500',
      iconBg: 'bg-amber-50 text-amber-700',
    },
    red: {
      border: 'border-l-4 border-l-red-500',
      iconBg: 'bg-red-50 text-red-600',
    },
    green: {
      border: 'border-l-4 border-l-[#78DABE]',
      iconBg: 'bg-[#AAFFC7]/50 text-[#2F4858]',
    },
  };

  // Select corresponding style configuration or default to brand
  const activeStyle = colorStyles[color] || colorStyles.brand;

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-slate-200/80 p-5 ${activeStyle.border} transition-all hover:shadow-md`}>
      <div className="flex items-start justify-between">
        <div>
          {/* Card title */}
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</p>
          
          {/* Primary metric value */}
          <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
          
          {/* Optional explanatory subtitle */}
          {subtitle && (
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              {subtitle}
            </p>
          )}
        </div>

        {/* Optional decorative icon */}
        {Icon && (
          <div className={`p-2.5 rounded-lg ${activeStyle.iconBg}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>

      {/* Optional footer trend narrative */}
      {trend && (
        <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
          {trend}
        </div>
      )}
    </div>
  );
}
