'use client';

import React from 'react';
import { useReactTable, getCoreRowModel, flexRender, ColumnDef } from '@tanstack/react-table';
import { Button } from '../ui/Button';

type Row = {
  id: string;
  name: string;
  personalEmail: string | null;
  micro1Email: string | null;
  requestDate: string;
  status: 'pending' | 'resolved';
  confirmationDate: string | null;
};

type ConfirmAction = { id: string; action: 'confirm' | 'cancel' | 'delete' } | null;

export default function OffboardingsTable({
  rows,
  loading,
  error,
  confirmAction,
  actioning,
  onSetConfirmAction,
  onAction,
  onDelete,
}: {
  rows: Row[];
  loading: boolean;
  error: string;
  confirmAction: ConfirmAction;
  actioning: string | null;
  onSetConfirmAction: (c: ConfirmAction) => void;
  onAction: (id: string, action: 'confirm' | 'cancel') => void;
  onDelete: (id: string) => void;
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
      accessorKey: 'requestDate',
      header: 'Request Date',
      cell: info => <span className="dim">{String(info.getValue() ?? '—')}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: info => {
        const status = info.getValue() as string;
        return <span className={`offb-status-badge offb-status-${status}`}>{status}</span>;
      },
    },
    {
      accessorKey: 'confirmationDate',
      header: 'Confirmation Date',
      cell: info => <span className="dim">{String(info.getValue() ?? '—')}</span>,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const r = row.original;
        const isConfirming = confirmAction?.id === r.id && confirmAction?.action === 'confirm';
        const isDeleting   = confirmAction?.id === r.id && confirmAction?.action === 'delete';
        return (
          <div className="offb-actions">
            {r.status === 'pending' && !isConfirming && (
              <Button
                className="offb-confirm-btn"
                onClick={() => onSetConfirmAction({ id: r.id, action: 'confirm' })}
              >
                {actioning === r.id + 'confirm' ? 'Confirming…' : 'Confirm Offboard'}
              </Button>
            )}
            {r.status === 'pending' && isConfirming && (
              <div className="inv-confirm-row">
                <span className="inv-confirm-label" style={{ color: '#93c5fd' }}>Offboard?</span>
                <Button className="inv-confirm-yes" onClick={() => onAction(r.id, 'confirm')}>Yes</Button>
                <Button className="inv-confirm-no" onClick={() => onSetConfirmAction(null)}>No</Button>
              </div>
            )}
            {r.status === 'pending' && !isDeleting && (
              <Button
                className="offb-cancel-btn"
                onClick={() => onSetConfirmAction({ id: r.id, action: 'delete' })}
              >
                {actioning === r.id + 'delete' ? 'Cancelling…' : 'Cancel'}
              </Button>
            )}
            {r.status === 'pending' && isDeleting && (
              <div className="inv-confirm-row">
                <span className="inv-confirm-label">Cancel request?</span>
                <Button className="inv-confirm-yes" onClick={() => onDelete(r.id)}>Yes</Button>
                <Button className="inv-confirm-no" onClick={() => onSetConfirmAction(null)}>No</Button>
              </div>
            )}
            {r.status === 'resolved' && (
              <Button className="offb-cancel-btn" disabled>Cancel</Button>
            )}
          </div>
        );
      },
    },
  ], [confirmAction, actioning, onSetConfirmAction, onAction, onDelete]);

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
            <tr className="state-row"><td colSpan={7}>No offboarding requests yet</td></tr>
          ) : (
            table.getRowModel().rows.map(row => (
              <tr key={row.id} className={row.original.status === 'resolved' ? 'inv-row-closed' : ''}>
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
