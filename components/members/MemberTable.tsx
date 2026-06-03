'use client';

import React from 'react';
import { useReactTable, getCoreRowModel, flexRender, ColumnDef } from '@tanstack/react-table';

type Row = {
  name: string;
  personalEmail: string;
  expertEmail: string;
  hdm: string;
  team: string;
};

export default function MemberTable({ rows }: { rows: Row[] }) {
  const data = React.useMemo(() => rows, [rows]);

  const columns = React.useMemo<ColumnDef<Row>[]>(() => [
    { accessorKey: 'name',          header: 'Member Name',  cell: info => info.getValue() || '—' },
    { accessorKey: 'personalEmail', header: 'Personal Email', cell: info => info.getValue() || '—' },
    { accessorKey: 'expertEmail',   header: 'Micro1 Email', cell: info => info.getValue() || '—' },
    { accessorKey: 'hdm',           header: 'HDM',          cell: info => info.getValue() || '—' },
    { accessorKey: 'team',          header: 'Team',         cell: info => info.getValue() || '—' },
  ], []);

  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <table className="min-w-full text-sm">
        <thead>
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <th key={header.id} className="text-left px-4 py-3 font-semibold text-xs text-white">
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map(row => (
            <tr key={row.id} className="odd:bg-[var(--row-odd)] even:bg-[var(--row-even)] hover:bg-[var(--row-hover)]">
              {row.getVisibleCells().map(cell => (
                <td key={cell.id} className="px-4 py-3 align-middle text-gray-100 max-w-[210px] overflow-hidden text-ellipsis">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
