"use client";
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { Button } from '@/components/ui/Button';

export default function ChoosePage() {
  const { data: session } = useSession();
  const role = session?.user?.role;

  const canSeeQC = role === 'admin' || role === 'hdm' || role === 'hdl';
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);

  const cards = [
    {
      id: 'hubstaff',
      title: 'Hubstaff Dashboard',
      desc: 'View Hubstaff activity reports, time-tracks and exports.',
      href: '/',
      icon: (
        <svg className="w-7 h-7 text-white" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 3a1 1 0 011-1h2a1 1 0 011 1v13a1 1 0 01-1 1h-2a1 1 0 01-1-1V3z" />
        </svg>
      ),
    },
    {
      id: 'qc',
      title: 'QC Dashboard',
      desc: 'Review QC submissions synced from Google Sheets.',
      href: '/qc',
      icon: (
        <svg className="w-7 h-7 text-white" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path fillRule="evenodd" d="M9 2a1 1 0 00-1 1v1H6a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2V6a2 2 0 00-2-2h-2V3a1 1 0 00-1-1H9zm1 7a1 1 0 00-1.707-.707L7.5 10.086 6.207 8.793A1 1 0 104.793 10.207l2 2a1 1 0 001.414 0l3-3A1 1 0 0010 9z" clipRule="evenodd" />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] p-6">
      <div className="w-full max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-semibold">Choose a Dashboard</h1>
          <div>
            <Button variant="ghost" onClick={() => signOut({ callbackUrl: '/login' })}>Sign out</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {cards.map((c, idx) => {
            const delay = `${idx * 120}ms`;
            const animClass = mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4';
            return (
              <div
                key={c.id}
                style={{ transitionDelay: delay }}
                className={`bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 shadow-sm hover:shadow-lg transition-shadow transform ${animClass}`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-md bg-[var(--accent)] text-white flex items-center justify-center transform transition-transform hover:scale-105">
                    {c.icon}
                  </div>
                  <div>
                    <h2 className="text-lg font-medium">{c.title}</h2>
                    <p className="text-[13px] text-[var(--text-dim)] mt-1">{c.desc}</p>
                    <div className="mt-4">
                      {c.id === 'qc' ? (
                        canSeeQC ? (
                          <Link href={c.href}>
                            <Button className="bg-green-600 hover:bg-green-700 text-white">Go to QC</Button>
                          </Link>
                        ) : (
                          <div className="text-[13px] text-[var(--text-dim)]">You don't have access to QC dashboard.</div>
                        )
                      ) : (
                        <Link href={c.href}>
                          <Button>Go to Hubstaff</Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
