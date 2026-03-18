import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', padding: '24px' }}>
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 900, marginBottom: '8px' }}>Create Account</h1>
        <p style={{ color: 'var(--tx-muted)', fontSize: '14px' }}>Please use your official college email domain to participate.</p>
      </div>
      <SignUp appearance={{ elements: { card: { boxShadow: 'var(--shadow-md)', borderRadius: '16px' }}}} />
    </div>
  );
}
