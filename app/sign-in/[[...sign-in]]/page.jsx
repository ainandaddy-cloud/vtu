import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', padding: '24px' }}>
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 900, marginBottom: '8px' }}>Institutional Sign In</h1>
        <p style={{ color: 'var(--tx-muted)', fontSize: '14px' }}>Please sign in with your college email ID to access the results portal.</p>
      </div>
      <SignIn appearance={{ elements: { card: { boxShadow: 'var(--shadow-md)', borderRadius: '16px' }}}} />
    </div>
  );
}
