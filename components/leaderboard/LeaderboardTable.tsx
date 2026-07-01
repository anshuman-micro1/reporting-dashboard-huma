'use client';

import React from 'react';
import { useReactTable, getCoreRowModel, flexRender, ColumnDef } from '@tanstack/react-table';

type Row = {
  rank: number;
  memberName: string;
  hdm: string | null;
  totalFormatted: string;
  totalFinalTaskCount: number | null;
};

export default function LeaderboardTable({ rows, loading, loadError }: { rows: Row[]; loading: boolean; loadError: string }) {
  const data = React.useMemo(() => rows, [rows]);

  const columns = React.useMemo<ColumnDef<Row>[]>(() => [
    { accessorKey: 'rank', header: '#', cell: info => info.getValue() },
    { accessorKey: 'memberName', header: 'Expert', cell: info => info.getValue() || '—' },
    { accessorKey: 'hdm', header: 'HDM', cell: info => info.getValue() || '—' },
    { accessorKey: 'totalFormatted', header: 'Total Hours', cell: info => info.getValue() || '—' },
    {
      accessorKey: 'totalFinalTaskCount',
      header: 'Tasks',
      cell: info => {
        const v = info.getValue() as number | null;
        return v != null ? v : <span style={{ color: 'var(--text-dim)' }}>—</span>;
      },
    },
  ], []);

  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="table-wrap">
      <table className="min-w-full text-sm">
        <thead>
          {table.getHeaderGroups().map(hg => (
            <tr key={hg.id}>
              {hg.headers.map(h => (
                <th key={h.id} className="px-4 py-3 text-left text-xs font-semibold text-white">{h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}</th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {loading ? (
            <tr className="state-row"><td colSpan={5}><span className="spinner"/>Loading…</td></tr>
          ) : loadError ? (
            <tr className="state-row"><td colSpan={5} style={{ color: '#f87171' }}>Error: {loadError}</td></tr>
          ) : data.length === 0 ? (
            <tr className="state-row"><td colSpan={5}>No activity recorded in this date range</td></tr>
          ) : (
            table.getRowModel().rows.map(row => (
              <tr key={row.id}>
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="px-4 py-3 align-middle text-gray-100" style={{ verticalAlign: 'middle' }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
