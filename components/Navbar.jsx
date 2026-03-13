'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function Navbar() {
    const router = useRouter();
    const pathname = usePathname();
    const [user, setUser] = useState(null);
    const [dark, setDark] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [isFaculty, setIsFaculty] = useState(false);

    const publicRoutes = ['/', '/landing', '/auth', '/auth/student', '/faculty/login', '/faculty/register'];

    useEffect(() => {
        const stored = localStorage.getItem('theme');
        if (stored === 'dark') { setDark(true); document.documentElement.setAttribute('data-theme', 'dark'); }

        const stu = localStorage.getItem('student_session');
        const fac = localStorage.getItem('faculty_session');

        if (pathname.startsWith('/faculty')) {
            if (fac) {
                setUser(JSON.parse(fac));
                setIsFaculty(true);
            } else if (stu) {
                setUser(JSON.parse(stu));
                setIsFaculty(false);
            } else {
                setUser(null);
                setIsFaculty(false);
            }
        } else {
            if (stu) {
                setUser(JSON.parse(stu));
                setIsFaculty(false);
            } else if (fac) {
                setUser(JSON.parse(fac));
                setIsFaculty(true);
            } else {
                setUser(null);
                setIsFaculty(false);
            }
        }
    }, [pathname]);

    // Close menu when navigating
    useEffect(() => { setMenuOpen(false); }, [pathname]);

    if (publicRoutes.includes(pathname)) return null;

    const toggleTheme = () => {
        const next = dark ? 'light' : 'dark';
        setDark(!dark);
        localStorage.setItem('theme', next);
        document.documentElement.setAttribute('data-theme', next);
    };

    const logout = () => {
        localStorage.removeItem('student_session');
        localStorage.removeItem('faculty_session');
        router.push('/');
    };



    const studentLinks = [
        { href: '/dashboard', icon: 'space_dashboard', label: 'Dashboard' },
        { href: '/calculator', icon: 'calculate', label: 'Calculator' },
        { href: '/vault', icon: 'drive_folder_upload', label: 'Batch Upload' },
        { href: '/analytics', icon: 'insights', label: 'Analytics' },
        { href: '/guide', icon: 'menu_book', label: 'Guide' },
        { href: '/settings', icon: 'settings', label: 'Settings' },
    ];

    const facultyLinks = [
        { href: '/faculty/dashboard', icon: 'space_dashboard', label: 'Dashboard' },
        { href: '/faculty/classes', icon: 'groups', label: 'Classes' },
        { href: '/faculty/reports', icon: 'analytics', label: 'Reports' },
        { href: '/faculty/vtu-urls', icon: 'link', label: 'VTU Result URLs' },
        { href: '/settings', icon: 'settings', label: 'Settings' },
    ];

    const links = isFaculty ? facultyLinks : studentLinks;

    return (
        <>
            {/* DESKTOP SIDEBAR — hidden on mobile */}
            <aside className={`gf-sidebar${menuOpen ? ' active' : ''}`} id="gf-sidebar">
                {/* Logo */}
                <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px', textDecoration: 'none' }}>
                    <div className="gf-logo-box">G</div>
                    <span style={{ fontWeight: 800, fontSize: '18px', color: 'var(--tx-main)', letterSpacing: '-0.03em' }}>GradeFlow</span>
                </Link>

                {/* Nav Links */}
                <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {links.map(link => (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={`gf-nav-link${pathname === link.href ? ' active' : ''}`}
                        >
                            <span className="material-icons-round" style={{ fontSize: '18px' }}>{link.icon}</span>
                            {link.label}
                        </Link>
                    ))}
                </nav>

                {/* User Section */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '16px' }}>
                    <button
                        onClick={toggleTheme}
                        className="gf-nav-link"
                        style={{ border: 'none', background: 'none', cursor: 'pointer', width: '100%', fontFamily: 'inherit', fontSize: '13px', color: 'var(--tx-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '10px' }}
                    >
                        <span className="material-icons-round" style={{ fontSize: '18px' }}>
                            {dark ? 'light_mode' : 'dark_mode'}
                        </span>
                        {dark ? 'Light Mode' : 'Dark Mode'}
                    </button>

                    {user && (
                        <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                            <div style={{
                                width: '32px', height: '32px', borderRadius: '10px',
                                background: 'var(--surface-low)', display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                                fontSize: '12px', fontWeight: 900, color: 'var(--tx-dim)',
                                flexShrink: 0,
                            }}>
                                {(user.name || user.usn || 'U')[0]}
                            </div>
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--tx-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {user.name || user.usn || 'User'}
                                </div>
                                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--tx-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {user.usn || user.email || ''}
                                </div>
                            </div>
                        </div>
                    )}

                    {user && (
                        <button
                            onClick={logout}
                            className="gf-nav-link"
                            style={{
                                border: 'none', background: 'none', cursor: 'pointer',
                                width: '100%', fontFamily: 'inherit', fontSize: '13px',
                                color: 'var(--red)', fontWeight: 600, display: 'flex',
                                alignItems: 'center', gap: '10px', padding: '10px 14px',
                                borderRadius: '10px', marginTop: '2px',
                            }}
                        >
                            <span className="material-icons-round" style={{ fontSize: '18px' }}>logout</span>
                            Sign out
                        </button>
                    )}
                </div>

                {/* Close button for mobile overlay */}
                <button
                    onClick={() => setMenuOpen(false)}
                    style={{
                        display: 'none',
                        position: 'absolute', top: '20px', right: '16px',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--tx-muted)', fontSize: '24px', lineHeight: 1,
                    }}
                    className="gf-mobile-close"
                >
                    <span className="material-icons-round">close</span>
                </button>
            </aside>

            {/* MOBILE HEADER */}
            <header className="gf-mobile-header">
                <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--tx-main)', padding: '8px',
                        marginLeft: '-8px' // offset initial padding
                    }}
                    aria-label="Open menu"
                >
                    <span className="material-icons-round" style={{ fontSize: '26px' }}>
                        {menuOpen ? 'close' : 'menu'}
                    </span>
                </button>

                <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                    <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
                        <div className="gf-logo-box" style={{ width: '28px', height: '28px', fontSize: '13px' }}>G</div>
                        <span style={{ fontWeight: 800, fontSize: '16px', color: 'var(--tx-main)', letterSpacing: '-0.02em' }}>GradeFlow</span>
                    </Link>
                </div>

                {/* invisible spacer to keep logo perfectly centered between the menu and right edge */}
                <div style={{ width: '30px' }} />
            </header>

            {/* Mobile backdrop */}
            {menuOpen && (
                <div
                    onClick={() => setMenuOpen(false)}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
                        zIndex: 999,
                    }}
                />
            )}

            {/* Style for mobile close button */}
            <style>{`
                @media (max-width: 1024px) {
                    .gf-mobile-close { display: block !important; }
                }
            `}</style>
        </>
    );
}
