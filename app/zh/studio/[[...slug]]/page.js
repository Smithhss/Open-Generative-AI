import StandaloneShell from '@/components/StandaloneShell';
import FytShell from '@/components/fyt/FytShell';

export const metadata = {
  title: process.env.NEXT_PUBLIC_STUDIO_MODE === 'fyt' ? '创作工作台 — fyt' : 'Studio — Open Generative AI',
};

// Additive locale route wrapper: reuses the exact same shell component as
// app/studio/[[...slug]]/page.js, only passing `locale="zh"`. A future
// locale repeats this file under app/<locale>/studio/[[...slug]]/page.js.
export default function ZhStudioPage() {
  return process.env.NEXT_PUBLIC_STUDIO_MODE === 'fyt' ? <FytShell locale="zh" /> : <StandaloneShell locale="zh" />;
}
