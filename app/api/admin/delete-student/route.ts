import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY! // Use service key for bypass RLS
);

export async function POST(req: Request) {
    try {
        const { usn } = await req.json();

        if (!usn) {
            return NextResponse.json({ error: 'USN is required' }, { status: 400 });
        }

        const cleanUSN = usn.toUpperCase().trim();

        // 1. Manually clean up un-linked or loosely linked data by USN if needed
        await supabase.from('scraper_jobs').delete().eq('usn', cleanUSN);

        // 2. Delete the primary student record.
        // DATABASE CASCADE will handle: marks, academic_remarks, results (and its subject_marks), and documents.
        const { error } = await supabase
            .from('students')
            .delete()
            .eq('usn', cleanUSN);

        if (error) throw error;

        return NextResponse.json({ success: true, message: `All data for ${cleanUSN} deleted.` });
    } catch (err: any) {
        console.error('Delete Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
