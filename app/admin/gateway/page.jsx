'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import Link from 'next/link';

export default function AdminLogin() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [systemToken, setSystemToken] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    // Secure SHA-256 Hashing function (Client-side)
    const hashPassword = async (pwd) => {
        const salt = 'vtu_calc_secure_2026';
        const msgUint8 = new TextEncoder().encode(pwd + salt);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const trimmedEmail = email.trim().toLowerCase();
        const trimmedPassword = password.trim();
        const gatekeeper = process.env.NEXT_PUBLIC_ADMIN_GATEKEEPER || 'GF-ADMIN-PROD';

        try {
            // 1. Mandatory System Token Check (The "Vibe-Code" Barrier)
            if (systemToken !== gatekeeper) {
                setError('Invalid System Access Token. Access Denied.');
                return;
            }

            // 2. Hash the input password before comparing
            const hashedInput = await hashPassword(trimmedPassword);

            // 3. Check against admin_users table
            const { data: admin, error: dbErr } = await supabase
                .from('admin_users')
                .select('id, email, password_hash')
                .eq('email', trimmedEmail)
                .maybeSingle();

            if (dbErr) throw dbErr;

            if (!admin || admin.password_hash !== hashedInput) {
                setError('Those credentials are not recognised.');
                return;
            }

            localStorage.setItem('admin_session', JSON.stringify({
                id: admin.id, email: admin.email, role: 'superadmin',
                token: systemToken // Bind session to token
            }));
            router.push('/admin/terminal');
        } catch (err) {
            setError('System error. Please try again later.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const s = {
        page: {
            minHeight: '100vh', background: 'var(--bg)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '24px',
        },
        card: {
            width: '100%', maxWidth: '420px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '20px', padding: '48px',
        },
        logoRow: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px' },
        logoBox: {
            width: '34px', height: '34px', background: 'var(--primary)',
            borderRadius: '9px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: 'var(--bg)', fontWeight: 900, fontSize: '16px',
        },
        eyebrow: {
            fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)',
            textTransform: 'uppercase', letterSpacing: '0.12em',
            marginBottom: '8px', display: 'block',
        },
        heading: { fontSize: '26px', fontWeight: 800, color: 'var(--tx-main)', letterSpacing: '-0.03em', marginBottom: '8px' },
        subtext: { fontSize: '14px', color: 'var(--tx-muted)', lineHeight: 1.6, marginBottom: '32px' },
        label: { display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--tx-muted)', marginBottom: '8px' },
        input: {
            width: '100%', background: 'var(--surface-low)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '13px 16px', fontSize: '14px',
            fontWeight: 500, color: 'var(--tx-main)', outline: 'none',
            transition: 'border-color 0.15s', fontFamily: 'inherit', marginBottom: '20px',
            display: 'block',
        },
        btn: {
            width: '100%', padding: '14px', background: 'var(--primary)',
            color: 'var(--bg)', border: 'none', borderRadius: '12px',
            fontWeight: 700, fontSize: '14px', cursor: 'pointer',
            transition: 'background 0.15s', fontFamily: 'inherit', marginTop: '4px',
        },
        errorBox: {
            background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: '10px',
            padding: '12px 16px', fontSize: '13px', color: 'var(--red)',
            fontWeight: 600, marginBottom: '20px',
        },
        hintBox: {
            background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '10px',
            padding: '12px 16px', fontSize: '12px', color: 'var(--tx-muted)',
            fontWeight: 500, marginBottom: '24px', lineHeight: 1.6,
        },
        backRow: { textAlign: 'center', marginTop: '24px', fontSize: '13px' },
    };

    const focus = (e) => { e.target.style.borderColor = 'var(--tx-main)'; };
    const blur = (e) => { e.target.style.borderColor = 'var(--border)'; };

    return (
        <div style={s.page} className="gf-fade-up">
            <div style={s.card}>
                <div style={s.logoRow}>
                    <div style={s.logoBox}>G</div>
                    <span style={{ fontWeight: 800, fontSize: '16px', color: 'var(--tx-main)' }}>GradeFlow</span>
                </div>

                <span style={s.eyebrow}>Restricted Access</span>
                <h1 style={s.heading}>Admin panel.</h1>
                <p style={s.subtext}>This area is for platform administrators only.</p>



                {error && <div style={s.errorBox}>{error}</div>}

                <form onSubmit={handleLogin}>
                    <label style={s.label}>System Access Token</label>
                    <input
                        style={s.input}
                        type="password"
                        placeholder="Private system key"
                        value={systemToken}
                        onChange={e => setSystemToken(e.target.value)}
                        required
                        onFocus={focus}
                        onBlur={blur}
                    />

                    <label style={s.label}>Admin Email</label>
                    <input
                        style={s.input}
                        type="email"
                        placeholder="admin@gradeflow.in"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        required
                        onFocus={focus}
                        onBlur={blur}
                        autoComplete="email"
                    />

                    <label style={s.label}>Password</label>
                    <input
                        style={s.input}
                        type="password"
                        placeholder="Admin password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                        onFocus={focus}
                        onBlur={blur}
                        autoComplete="current-password"
                    />

                    <button
                        style={{ ...s.btn, opacity: loading ? 0.7 : 1 }}
                        type="submit"
                        disabled={loading}
                        onMouseEnter={e => { if (!loading) e.target.style.background = 'var(--primary-hover)'; }}
                        onMouseLeave={e => { e.target.style.background = 'var(--primary)'; }}
                    >
                        {loading ? 'Checking...' : 'Enter console'}
                    </button>
                </form>

                <div style={s.backRow}>
                    <Link href="/auth" style={{ color: 'var(--tx-muted)', fontWeight: 600, textDecoration: 'none', fontSize: '13px' }}>
                        ← Back to portal
                    </Link>
                </div>
            </div>
        </div>
    );
}
