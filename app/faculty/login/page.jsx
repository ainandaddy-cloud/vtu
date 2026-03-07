'use client';

import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function FacultyLogin() {
    const [email, setEmail] = useState('');
    const [accessKey, setAccessKey] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true); setError('');
        try {
            const { data: faculty } = await supabase
                .from('faculty_onboarding')
                .select('*')
                .eq('email', email.toLowerCase())
                .eq('status', 'approved')
                .maybeSingle();

            if (!faculty) {
                setError('No approved faculty account found for this email.');
                return;
            }

            if (faculty.generated_access_key !== accessKey) {
                setError('The access key is incorrect.');
                return;
            }

            localStorage.removeItem('student_session'); // Ensure no conflicting sessions

            const sessionData = {
                id: faculty.id,
                name: faculty.full_name,
                full_name: faculty.full_name,
                email: faculty.email,
                department: faculty.department,
            };

            // Sign the session 
            if (!window.crypto || !window.crypto.subtle) {
                throw new Error('CRYPTO_ERROR');
            }
            const encoder = new TextEncoder();
            const data = encoder.encode((faculty.email + faculty.id) + '_gradeflow_secret_v1_2026');
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            sessionData.signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            localStorage.setItem('faculty_session', JSON.stringify(sessionData));
            window.dispatchEvent(new Event('storage'));
            router.push('/faculty/dashboard');
        } catch (err) {
            console.error('Faculty login error details:', err);
            if (err.message === 'CRYPTO_ERROR') {
                setError('Security Error: Your browser blocked the login process. Please ensure you are opening the HTTPS version of the ngrok link, not HTTP.');
            } else {
                setError('Something went wrong. Please check your connection and try again.');
            }
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
            width: '100%', maxWidth: '440px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '20px', padding: 'clamp(28px, 5vw, 48px)',
        },
        backLink: {
            display: 'flex', alignItems: 'center', gap: '6px',
            textDecoration: 'none', fontSize: '13px', fontWeight: 600,
            color: 'var(--tx-muted)', marginBottom: '40px',
        },
        logoRow: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px' },
        logoBox: {
            width: '34px', height: '34px', background: 'var(--primary)',
            borderRadius: '9px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: 'var(--bg)', fontWeight: 900, fontSize: '16px',
        },
        heading: { fontSize: '26px', fontWeight: 800, color: 'var(--tx-main)', letterSpacing: '-0.03em', marginBottom: '8px' },
        subtext: { fontSize: '14px', color: 'var(--tx-muted)', lineHeight: 1.6, marginBottom: '32px' },
        label: { display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--tx-muted)', marginBottom: '8px' },
        input: {
            width: '100%', background: 'var(--surface-low)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '13px 16px', fontSize: '14px',
            fontWeight: 500, color: 'var(--tx-main)', outline: 'none',
            transition: 'border-color 0.15s', fontFamily: 'inherit', marginBottom: '20px',
        },
        btn: {
            width: '100%', padding: '14px', background: 'var(--primary)',
            color: 'var(--bg)', border: 'none', borderRadius: '12px',
            fontWeight: 700, fontSize: '14px', cursor: 'pointer',
            transition: 'opacity 0.15s', fontFamily: 'inherit', marginTop: '8px',
        },
        errorBox: {
            background: 'var(--red-bg)', border: '1px solid var(--red)',
            borderRadius: '10px', padding: '12px 16px',
            fontSize: '13px', color: 'var(--red)', fontWeight: 600, marginBottom: '20px',
        },
        divider: { height: '1px', background: 'var(--border)', margin: '28px 0' },
        requestLink: {
            textAlign: 'center', marginTop: '24px',
            fontSize: '13px', color: 'var(--tx-muted)', fontWeight: 600,
        },
    };

    return (
        <div style={s.page} className="gf-fade-up">
            <div style={s.card}>
                <Link href="/auth" style={s.backLink}>
                    <span className="material-icons-round" style={{ fontSize: '16px' }}>arrow_back</span>
                    Back to portal options
                </Link>

                <div style={s.logoRow}>
                    <div style={s.logoBox}>G</div>
                    <span style={{ fontWeight: 800, fontSize: '16px', color: 'var(--tx-main)' }}>GradeFlow</span>
                </div>

                <h1 style={s.heading}>Faculty sign in.</h1>
                <p style={s.subtext}>
                    Use your institutional email and the access key we sent when your request was approved.
                </p>

                {error && <div style={s.errorBox}>{error}</div>}

                <form onSubmit={handleLogin}>
                    <label style={s.label}>Institutional Email</label>
                    <input style={s.input} type="email" placeholder="you@anjuman.edu.in"
                        value={email} onChange={e => setEmail(e.target.value)} required
                        onFocus={e => e.target.style.borderColor = 'var(--tx-main)'}
                        onBlur={e => e.target.style.borderColor = 'var(--border)'} />

                    <label style={s.label}>Access Key</label>
                    <input style={s.input} type="password" placeholder="Key from your approval email"
                        value={accessKey} onChange={e => setAccessKey(e.target.value)} required
                        onFocus={e => e.target.style.borderColor = 'var(--tx-main)'}
                        onBlur={e => e.target.style.borderColor = 'var(--border)'} />

                    <button style={s.btn} type="submit" disabled={loading}>
                        {loading ? 'Verifying...' : 'Sign in'}
                    </button>
                </form>

                <div style={s.divider} />

                <div style={s.requestLink}>
                    Don't have an account yet?{' '}
                    <Link href="/faculty/register" style={{ color: 'var(--primary)', fontWeight: 700 }}>
                        Request faculty access
                    </Link>
                </div>
            </div>
        </div>
    );
}
