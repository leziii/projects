/** Withdraw (E6-4) and Book again (E6-5), shared by the result page (O11) and order details (O13). */
import { withdrawConfirmText } from '@pawpal/shared';
import { rebookOrder, withdrawOrder } from '@/api/booking';
import { ApiError } from '@/api/client';

/** An OK / Cancel popup; true when the owner taps OK. */
export function confirmBox(title: string, content: string): Promise<boolean> {
  return new Promise((resolve) => {
    uni.showModal({ title, content, confirmText: 'OK', cancelText: 'Cancel', success: ({ confirm }) => resolve(confirm), fail: () => resolve(false) });
  });
}

/** R28-2: confirm, then withdraw. 'cancelled' when the owner said no; otherwise the error to show, or null when done. */
export async function withdrawWithConfirm(id: number, paySen: number): Promise<string | null | 'cancelled'> {
  if (!(await confirmBox('Withdraw booking', withdrawConfirmText(paySen)))) return 'cancelled';
  try {
    await withdrawOrder(id);
    uni.showToast({ title: 'Withdrawn', icon: 'success' });
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** R29-5: copy the order into the booking, asking first if one is in progress; opens O06. Returns an error to show, or null. */
export async function rebookWithConfirm(id: number): Promise<string | null> {
  try {
    await rebookOrder(id, false);
  } catch (e) {
    if (!(e instanceof ApiError && e.code === 'DRAFT_EXISTS')) return (e as Error).message;
    if (!(await confirmBox('Book again', e.message))) return null;
    try {
      await rebookOrder(id, true);
    } catch (again) {
      return (again as Error).message;
    }
  }
  uni.navigateTo({ url: '/pages/booking/index' });
  return null;
}
