import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface SessionTimeoutWarningProps {
  /** Timeout in ms - default 60 minutes */
  timeoutMs?: number;
  /** Warning before timeout in ms - default 5 minutes */
  warningBeforeMs?: number;
}

/**
 * SessionTimeoutWarning - Display warning before session expires
 * 
 * Place this component in your admin layout to show a dialog
 * when the user's session is about to expire.
 */
export function SessionTimeoutWarning({ 
  timeoutMs = 60 * 60 * 1000,
  warningBeforeMs = 5 * 60 * 1000,
}: SessionTimeoutWarningProps) {
  const { isWarning, secondsRemaining, extendSession, signOut } = useSessionTimeout({
    timeoutMs,
    warningBeforeMs,
    extendOnActivity: true,
  });

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    return `${secs} seconds`;
  };

  return (
    <AlertDialog open={isWarning}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Session Expiring Soon</AlertDialogTitle>
          <AlertDialogDescription>
            Your session will expire in{' '}
            <span className="font-semibold text-foreground">
              {formatTime(secondsRemaining)}
            </span>
            . Would you like to stay signed in?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={signOut}>
            Sign Out
          </AlertDialogCancel>
          <AlertDialogAction onClick={extendSession}>
            Stay Signed In
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default SessionTimeoutWarning;
