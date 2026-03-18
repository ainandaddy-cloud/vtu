'use client';

import { usePathname } from 'next/navigation';
import { ClerkProvider } from '@clerk/nextjs';
import Sidebar from '../components/Navbar';
import ThemeProvider from '../components/ThemeProvider';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
    subsets: ['latin'],
    weight: ['400', '500', '600', '700', '800'],
    variable: '--font-jakarta',
});

// Routes where the sidebar should NOT appear
const HIDE_SIDEBAR_ON = [
    '/',
    '/auth',
    '/auth/student',
    '/faculty/login',
    '/faculty/register',
    '/admin/gateway',
    '/admin/terminal',
    '/faculty/internal',
];

function Footer() {
    return (
        <footer style={{
            textAlign: 'center',
            padding: '40px 24px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg)',
            marginTop: 'auto'
        }}>
            <p style={{ fontSize: '12px', color: 'var(--tx-muted)', fontWeight: 500, marginBottom: '12px' }}>
                © 2026 GradeFlow · Academic Intelligence System · Private Institutional Network
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <p style={{ fontSize: '11px', color: 'var(--tx-muted)', opacity: 0.7, fontWeight: 600 }}>
                    Developed by <strong>Mohammed Ainan Armar</strong> & <strong>Rawahah Ruknuddin</strong>
                </p>
                <p style={{ fontSize: '12px', color: 'var(--tx-muted)', opacity: 0.9 }}>
                    Powered by{' '}
                    <a href="https://automaticxai.online" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline', fontWeight: 800 }}>
                        automaticxai.online
                    </a>
                </p>
            </div>
        </footer>
    );
}

function LayoutWrapper({ children }) {
    const pathname = usePathname();
    const isLandingPage = pathname === '/';
    const hideSidebar =
        HIDE_SIDEBAR_ON.includes(pathname) ||
        pathname.startsWith('/admin') ||
        pathname.startsWith('/faculty/login') ||
        pathname.startsWith('/faculty/register');

    return (
        <div className="app-layout">
            {!hideSidebar && <Sidebar />}
            <div
                className={`main-content ${hideSidebar ? 'full-width' : ''}`}
                style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}
            >
                <div style={{ flex: 1 }}>
                    {children}
                </div>
                {!isLandingPage && <Footer />}
            </div>
        </div>
    );
}

export default function RootLayout({ children }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <title>GradeFlow — Academic Intelligence</title>
                <meta name="description" content="GradeFlow — Track marks, calculate SGPA and CGPA, and manage your academic record." />
                <link
                    href="https://fonts.googleapis.com/icon?family=Material+Icons+Round"
                    rel="stylesheet"
                />
                {/* Instantly apply saved theme before React hydration to prevent flicker */}
                <script
                    dangerouslySetInnerHTML={{
                        __html: `(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
                    }}
                />
            </head>
            <body className={jakarta.className}>
                <ClerkProvider>
                    <ThemeProvider>
                        <LayoutWrapper>{children}</LayoutWrapper>
                    </ThemeProvider>
                </ClerkProvider>
            </body>
        </html>
    );
}
