import './globals.css';
import { Inter } from 'next/font/google';
import WalletContextProvider from './providers/WalletContextProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Solana Number Guessing Game',
  description: 'A game where two players deposit SOL, guess a number, and the closest guess wins.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <WalletContextProvider>
          {children}
        </WalletContextProvider>
      </body>
    </html>
  );
}