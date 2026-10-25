import StandaloneShell from '@/components/StandaloneShell';
import FytShell from '@/components/fyt/FytShell';

export const metadata = {
  title: process.env.NEXT_PUBLIC_STUDIO_MODE === 'fyt' ? 'Studio — fyt' : 'Studio — Open Generative AI',
};

export default function StudioPage() {
  return process.env.NEXT_PUBLIC_STUDIO_MODE === 'fyt' ? <FytShell /> : <StandaloneShell />;
}
