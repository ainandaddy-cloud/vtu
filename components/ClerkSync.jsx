'use client';

import { useEffect, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import { supabase } from '../lib/supabase';
import { useRouter, usePathname } from 'next/navigation';

export default function ClerkSync() {
    const { isLoaded, isSignedIn, user } = useUser();
    const router = useRouter();
    const pathname = usePathname();
    const syncTried = useRef(false);

    useEffect(() => {
        const syncProfile = async () => {
            if (!isLoaded) return;
            
            if (!isSignedIn || !user) {
                // Clear session if they sign out of Clerk
                localStorage.removeItem('student_session');
                syncTried.current = false;
                return;
            }
            
            // Only try to sync once per active session load
            if (syncTried.current) return;
            syncTried.current = true;

            const email = user.primaryEmailAddress?.emailAddress;
            if (!email) return;

            // Extract USN from email
            const usn = email.split('@')[0].toUpperCase();
            const name = user.fullName || usn;
            
            try {
                // 1. Fetch from Supabase
                let { data: profile } = await supabase
                    .from('students')
                    .select('id, name')
                    .eq('usn', usn)
                    .maybeSingle();

                if (!profile) {
                    // Create it if it doesn't exist
                    const branchMatch = usn.match(/^\d[A-Z]{2}\d{2}([A-Z]{2,3})\d{3}$/);
                    const branch = branchMatch ? (branchMatch[1] === 'CS' ? 'CSE' : branchMatch[1]) : 'Unknown';
                    
                    const { data: newProfile, error } = await supabase
                        .from('students')
                        .insert({ usn, name, branch, scheme: '2022' })
                        .select('id, name')
                        .single();
                        
                    if (error) throw error;
                    profile = newProfile;
                }

                // Generate signature for AuthGuard
                const encoder = new TextEncoder();
                const data = encoder.encode((usn + profile.id) + '_gradeflow_secret_v1_2026');
                const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const sig = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

                localStorage.setItem('student_session', JSON.stringify({
                    usn,
                    id: profile.id,
                    name: profile.name || name,
                    role: 'student',
                    signature: sig
                }));
                
                // If they are on a Clerk page, bounce them to the dashboard automatically
                if (pathname === '/sign-in' || pathname === '/sign-up') {
                     router.push('/dashboard');
                }

            } catch (err) {
                console.error("ClerkSync Error:", err);
            }
        };

        syncProfile();
    }, [isLoaded, isSignedIn, user, pathname, router]);

    return null;
}
