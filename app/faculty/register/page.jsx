'use client';

import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import Link from 'next/link';

export default function FacultyRegister() {
    const [form, setForm] = useState({ full_name: '', email: '', department: '', password: '' });
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState('');

    const handleChange = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true); setError('');
        try {
            const { error: insertErr } = await supabase.from('faculty_onboarding').insert({
                full_name: form.full_name,
                email: form.email.toLowerCase(),
                department: form.department,
                password: form.password,
                status: 'pending',
            });
            if (insertErr) {
                if (insertErr.code === '23505') { setError('A request with this email is already on file.'); return; }
                throw insertErr;
            }
            setSubmitted(true);
        } catch (err) { console.error('Faculty registration error:', err); setError('Something went wrong. Please try again.'); }
        finally { setLoading(false); }
    };

    const s = {
        page: {
            minHeight: '100vh', background: 'var(--bg)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '40px 24px',
        },
        card: {
            width: '100%', maxWidth: '520px',
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
        subtext: { fontSize: '14px', color: 'var(--tx-muted)', fontWeight: 500, lineHeight: 1.6, marginBottom: '32px' },
        label: { display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--tx-muted)', marginBottom: '8px' },
        input: {
            width: '100%', background: 'var(--surface-low)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '13px 16px', fontSize: '14px',
            fontWeight: 500, color: 'var(--tx-main)', outline: 'none',
            transition: 'border-color 0.15s', fontFamily: 'inherit', marginBottom: '20px',
        },
        textarea: {
            width: '100%', background: 'var(--surface-low)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '13px 16px', fontSize: '14px',
            fontWeight: 500, color: 'var(--tx-main)', outline: 'none',
            transition: 'border-color 0.15s', fontFamily: 'inherit', marginBottom: '24px',
            resize: 'vertical', minHeight: '100px', lineHeight: 1.6,
        },
        btn: {
            width: '100%', padding: '14px', background: 'var(--primary)',
            color: 'var(--bg)', border: 'none', borderRadius: '12px',
            fontWeight: 700, fontSize: '14px', cursor: 'pointer',
            transition: 'opacity 0.15s', fontFamily: 'inherit',
        },
        errorBox: {
            background: 'var(--red-bg)', border: '1px solid var(--red)',
            borderRadius: '10px', padding: '12px 16px',
            fontSize: '13px', color: 'var(--red)', fontWeight: 600, marginBottom: '20px',
        },
        divider: { height: '1px', background: 'var(--border)', margin: '28px 0' },
        footer: { textAlign: 'center', marginTop: '24px', fontSize: '12px', color: 'var(--tx-dim)', fontWeight: 500 },
        successIcon: {
            width: '56px', height: '56px', background: 'var(--surface-low)',
            borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--tx-main)', marginBottom: '24px',
        },
        successHeading: { fontSize: '24px', fontWeight: 800, color: 'var(--tx-main)', letterSpacing: '-0.03em', marginBottom: '12px' },
        successText: { fontSize: '14px', color: 'var(--tx-muted)', lineHeight: 1.6, marginBottom: '32px' },
    };

    if (submitted) {
        return (
            <div style={s.page} className="gf-fade-up">
                <div style={s.card}>
                    <div style={s.successIcon}>
                        <span className="material-icons-round" style={{ fontSize: '28px' }}>mark_email_read</span>
                    </div>
                    <h1 style={s.successHeading}>Your request has been received.</h1>
                    <p style={s.successText}>
                        We review every faculty application personally. You will hear from us within 24 hours on the email address you provided.
                    </p>
                    <Link href="/auth" style={{ ...s.btn, display: 'block', textDecoration: 'none', textAlign: 'center' }}>
                        Back to portal
                    </Link>
                    <p style={{ ...s.footer, marginTop: '20px' }}>Requests are reviewed by the platform administrator.</p>
                </div>
            </div>
        );
    }

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

                <h1 style={s.heading}>Request faculty access.</h1>
                <p style={s.subtext}>
                    We review every request personally. You will hear back within 24 hours. Fill in the form accurately — we use it to verify your institutional role.
                </p>

                {error && <div style={s.errorBox}>{error}</div>}

                <form onSubmit={handleSubmit}>
                    <label style={s.label}>Full Name</label>
                    <input style={s.input} placeholder="Dr. Priya Nair" value={form.full_name}
                        onChange={handleChange('full_name')} required
                        onFocus={e => e.target.style.borderColor = 'var(--tx-main)'}
                        onBlur={e => e.target.style.borderColor = 'var(--border)'} />

                    <label style={s.label}>Institutional Email</label>
                    <input style={s.input} type="email" placeholder="priya@anjuman.edu.in" value={form.email}
                        onChange={handleChange('email')} required
                        onFocus={e => e.target.style.borderColor = 'var(--tx-main)'}
                        onBlur={e => e.target.style.borderColor = 'var(--border)'} />

                    <label style={s.label}>Department</label>
                    <input style={s.input} placeholder="Computer Science & Engineering" value={form.department}
                        onChange={handleChange('department')} required
                        onFocus={e => e.target.style.borderColor = 'var(--tx-main)'}
                        onBlur={e => e.target.style.borderColor = 'var(--border)'} />

                    <label style={s.label}>Account Password</label>
                    <input style={s.input} type="password" placeholder="••••••••" value={form.password}
                        onChange={handleChange('password')} required
                        onFocus={e => e.target.style.borderColor = 'var(--tx-main)'}
                        onBlur={e => e.target.style.borderColor = 'var(--border)'} />

                    <div style={s.divider} />

                    <button style={s.btn} type="submit" disabled={loading}>
                        {loading ? 'Submitting...' : 'Submit Request'}
                    </button>
                </form>
                <p style={s.footer}>Requests are reviewed by the platform administrator.</p>
            </div>
        </div>
    );
}
