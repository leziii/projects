import type { CaregiverStatus, Role } from '@pawpal/shared';

export const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', caregiver: 'Caregiver' };

/** What the Switch role page says about the caregiver option. */
export function caregiverOption(status: CaregiverStatus): { enabled: boolean; tag: string; apply: boolean } {
  switch (status) {
    case 'approved':
      return { enabled: true, tag: 'Approved', apply: false };
    case 'pending':
      return { enabled: false, tag: 'Under review', apply: false };
    case 'rejected':
      return { enabled: false, tag: 'Not approved', apply: true };
    case 'suspended':
      return { enabled: false, tag: 'Suspended', apply: false };
    default:
      return { enabled: false, tag: 'Not a caregiver yet', apply: true };
  }
}

export interface MeMenuItem {
  label: string;
  story: string;
  /** Page to open once the story is built; without it the item says "Soon". */
  url?: string;
}

/** Menu on the Me page (C03). Items not built yet say "Soon" and name the story that adds them. */
export function meMenu(role: Role, caregiverApproved: boolean): { title: string; items: MeMenuItem[] }[] {
  const sections: { title: string; items: MeMenuItem[] }[] = [
    {
      title: 'Owner',
      items: [
        { label: 'My orders', story: 'E7-1', url: '/pages/orders/index' },
        { label: 'My pets', story: 'E3-1', url: '/pages/pets/index' },
        { label: 'Addresses & contacts', story: 'E3-4', url: '/pages/addresses/index' },
        { label: 'Invite friends', story: 'E5-7', url: '/pages/invite/index' },
      ],
    },
  ];
  if (caregiverApproved) {
    sections.push({
      title: 'Caregiver',
      items: [
        { label: 'My tasks', story: 'E8-1', url: '/pages/caregiver/tasks' },
        { label: 'Profile & services', story: 'E4-4', url: '/pages/caregiver/profile' },
        { label: 'Schedule', story: 'E4-5', url: '/pages/caregiver/schedule' },
        { label: 'Income', story: 'E13-2' },
      ],
    });
  }
  if (role === 'caregiver') sections.reverse();
  // "Other" holds the WhatsApp help button (E2-6).
  return [...sections, { title: 'Other', items: [] }];
}
