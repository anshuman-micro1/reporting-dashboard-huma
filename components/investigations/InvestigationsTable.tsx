'use client';

import React from 'react';
import { useReactTable, getCoreRowModel, flexRender, ColumnDef } from '@tanstack/react-table';
import { Button } from '../ui/Button';

type Row = {
  id: string;
  name: string;
  personalEmail: string | null;
  micro1Email: string | null;
  notes: string;
  investigationDate: string;
  status: 'open' | 'closed';
};

export default function InvestigationsTable({
  rows,
  loading,
  error,
  confirmClose,
  closing,
  onSetConfirmClose,
  onClose,
}: {
  rows: Row[];
  loading: boolean;
  error: string;
  confirmClose: string | null;
  closing: string | null;
  onSetConfirmClose: (id: string | null) => void;
  onClose: (id: string) => void;
}) {
  const data = React.useMemo(() => rows, [rows]);

  const columns = React.useMemo<ColumnDef<Row>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: info => <span className="font-semibold">{String(info.getValue() ?? '—')}</span>,
    },
    {
      accessorKey: 'personalEmail',
      header: 'Personal Email',
      cell: info => <span className="dim">{String(info.getValue() ?? '—')}</span>,
    },
    {
      accessorKey: 'micro1Email',
      header: 'Micro1 Email',
      cell: info => <span className="dim">{String(info.getValue() ?? '—')}</span>,
    },
    {
      accessorKey: 'investigationDate',
      header: 'Date',
      cell: info => <span className="dim">{String(info.getValue() ?? '—')}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: info => {
        const status = info.getValue() as string;
        return <span className={`inv-status-badge inv-status-${status}`}>{status}</span>;
      },
    },
    {
      accessorKey: 'notes',
      header: 'Notes',
      cell: info => <span className="text-xs whitespace-pre-wrap">{String(info.getValue() ?? '—')}</span>,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const inv = row.original;
        if (inv.status === 'closed') {
          return <span className="dim text-[11px]">Closed</span>;
        }
        if (confirmClose === inv.id) {
          return (
            <div className="inv-confirm-row">
              <span className="inv-confirm-label">Close?</span>
              <Button className="inv-confirm-yes" onClick={() => onClose(inv.id)}>Yes</Button>
              <Button className="inv-confirm-no" onClick={() => onSetConfirmClose(null)}>No</Button>
            </div>
          );
        }
        return (
          <Button className="inv-close-btn" onClick={() => onSetConfirmClose(inv.id)}>
            {closing === inv.id ? 'Closing…' : 'Close'}
          </Button>
        );
      },
    },
  ], [confirmClose, closing, onSetConfirmClose, onClose]);

  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 160px)' }}>
      <table className="min-w-full text-sm">
        <thead>
          {table.getHeaderGroups().map(hg => (
            <tr key={hg.id}>
              {hg.headers.map(h => (
                <th key={h.id} className="px-4 py-3 text-left text-xs font-semibold text-white">
                  {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {loading ? (
            <tr className="state-row"><td colSpan={7}><span className="spinner" />Loading…</td></tr>
          ) : error ? (
            <tr className="state-row"><td colSpan={7} className="text-red-400">Error: {error}</td></tr>
          ) : data.length === 0 ? (
            <tr className="state-row"><td colSpan={7}>No investigations match</td></tr>
          ) : (
            table.getRowModel().rows.map(row => (
              <tr key={row.id} className={row.original.status === 'closed' ? 'inv-row-closed' : ''}>
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="px-4 py-3 align-middle">
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
