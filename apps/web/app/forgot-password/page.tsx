import { AuthShell } from '../components/auth-shell';
import { RecoveryForm } from '../components/recovery-form';
export default function Page() {
  return (
    <AuthShell>
      <RecoveryForm mode="forgot" />
    </AuthShell>
  );
}
