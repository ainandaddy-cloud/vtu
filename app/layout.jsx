'use client';

import { usePathname } from 'next/navigation';
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

function LayoutWrapper({ children }) {
    const pathname = usePathname();
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
            >
                {children}
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
                <ThemeProvider>
                    <LayoutWrapper>{children}</LayoutWrapper>
                </ThemeProvider>
            </body>
        </html>
    );
}
