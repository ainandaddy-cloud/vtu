'use client';

import Link from 'next/link';

export default function PortalEntry() {
    const s = {
        page: {
            minHeight: '100vh', background: 'var(--bg)',
            display: 'flex', flexDirection: 'column',
        },
        nav: {
            padding: '0 var(--page-px)', height: '72px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: '1px solid var(--border)',
        },
        logo: { display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' },
        logoBox: {
            width: '34px', height: '34px', background: 'var(--primary)',
            borderRadius: '9px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: 'var(--bg)', fontWeight: 900, fontSize: '16px',
        },
        logoText: { fontWeight: 800, fontSize: '18px', color: 'var(--tx-main)', letterSpacing: '-0.03em' },

        main: {
            flex: 1, display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: '40px var(--page-px)',
        },
        container: { maxWidth: '960px', width: '100%' },

        eyebrow: {
            fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)',
            textTransform: 'uppercase', letterSpacing: '0.12em',
            marginBottom: '20px', display: 'block', textAlign: 'center',
        },
        heading: {
            fontSize: 'clamp(28px, 6vw, 48px)', fontWeight: 900, color: 'var(--tx-main)',
            letterSpacing: '-0.04em', lineHeight: 1.05,
            textAlign: 'center', marginBottom: '12px',
        },
        subheading: {
            fontSize: 'clamp(14px, 2.5vw, 17px)', fontWeight: 500, color: 'var(--tx-muted)',
            textAlign: 'center', marginBottom: '48px', lineHeight: 1.6,
        },

        card: {
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '20px', padding: 'clamp(28px, 4vw, 48px)',
        },
        cardTag: {
            fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)',
            textTransform: 'uppercase', letterSpacing: '0.1em',
            marginBottom: '16px', display: 'block',
        },
        cardTitle: {
            fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 800, color: 'var(--tx-main)',
            letterSpacing: '-0.03em', marginBottom: '10px',
        },
        cardDesc: {
            fontSize: '14px', fontWeight: 500, color: 'var(--tx-muted)',
            lineHeight: 1.6, marginBottom: '36px',
        },
        divider: { height: '1px', background: 'var(--border)', margin: '32px 0' },

        primaryBtn: {
            display: 'block', width: '100%', padding: '14px',
            background: 'var(--primary)', color: 'var(--bg)',
            border: 'none', borderRadius: '12px',
            fontWeight: 700, fontSize: '14px', cursor: 'pointer',
            textDecoration: 'none', textAlign: 'center',
            transition: 'background 0.15s',
        },
        ghostBtn: {
            display: 'block', width: '100%', padding: '14px',
            background: 'transparent', color: 'var(--tx-main)',
            border: '1px solid var(--border)', borderRadius: '12px',
            fontWeight: 700, fontSize: '14px', cursor: 'pointer',
            textDecoration: 'none', textAlign: 'center',
            transition: 'all 0.15s', marginTop: '12px',
        },

        footer: {
            padding: '32px var(--page-px)',
            textAlign: 'center',
            borderTop: '1px solid var(--border)',
        },
        footerText: { fontSize: '12px', color: 'var(--tx-dim)', fontWeight: 500 },
    };

    return (
        <div style={s.page}>
            <nav style={s.nav}>
                <a href="/" style={s.logo}>
                    <div style={s.logoBox}>G</div>
                    <span style={s.logoText}>GradeFlow</span>
                </a>
                <span style={{ fontSize: '12px', color: 'var(--tx-dim)', fontWeight: 600 }}>
                    Academic Intelligence System
                </span>
            </nav>

            <main style={s.main} className="gf-fade-up">
                <div style={s.container}>
                    <span style={s.eyebrow}>Choose your role</span>
                    <h1 style={s.heading}>Where would you like to go?</h1>
                    <p style={s.subheading}>
                        Students can sign straight in. Faculty members can request access and we'll review it personally.
                    </p>

                    <div className="gf-auth-grid">
                        {/* Student Card */}
                        <div style={s.card}>
                            <span style={s.cardTag}>For Students</span>
                            <h2 style={s.cardTitle}>Your academic record awaits.</h2>
                            <p style={s.cardDesc}>
                                Sign in with your USN and password to view marks, calculate your SGPA, and track your semester progress.
                            </p>
                            <div style={s.divider}></div>
                            <Link href="/auth/student" style={s.primaryBtn}>
                                Sign in as a student
                            </Link>
                            <Link href="/auth/student?mode=activate" style={s.ghostBtn}>
                                First time? Activate your profile
                            </Link>
                        </div>

                        {/* Faculty Card */}
                        <div style={s.card}>
                            <span style={s.cardTag}>For Faculty</span>
                            <h2 style={s.cardTitle}>Institutional faculty access.</h2>
                            <p style={s.cardDesc}>
                                Faculty members can sign in once approved, or send a request if you're joining for the first time. We review every request personally.
                            </p>
                            <div style={s.divider}></div>
                            <Link href="/faculty/login" style={s.primaryBtn}>
                                Sign in as faculty
                            </Link>
                            <Link href="/faculty/register" style={s.ghostBtn}>
                                Request faculty access
                            </Link>
                        </div>
                    </div>
                </div>
            </main>

        </div>
    );
}
