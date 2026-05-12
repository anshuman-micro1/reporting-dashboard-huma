import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hubstaff Report Dashboard',
  description: 'Hubstaff activity reporting dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
