import './globals.css';
import { AuthProvider } from '../components/AuthProvider';

export const metadata = {
  title: 'Collect It',
  description: 'Free Pokémon TCG analytics and portfolio tracking',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
