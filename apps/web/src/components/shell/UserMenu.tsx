import {
  Compass,
  Activity,
  Keyboard,
  LogOut,
  Monitor,
  Moon,
  Settings,
  Sun,
  User,
} from 'lucide-react';
import { useNavigate } from 'react-router';

import { isAdmin, useMe } from '@/api/me';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTour } from '@/features/onboarding/tour/SpotlightTour';
import type { ThemePref } from '@/lib/theme/appearance';
import { useTheme } from '@/lib/theme/context';
import { Shortcut } from '@kestrel/ui';

import { initials } from './initials';
import { openSheet } from './shell-state';
import { useSignOut } from './use-sign-out';

/** Avatar menu: Profile · Settings · Shortcuts · Theme · Sign out (DESIGN §10.1). */
export function UserMenu() {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const { appearance, setAppearance } = useTheme();
  const signOut = useSignOut();
  const tour = useTour();
  const user = me?.user;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-full"
          data-testid="user-menu"
          aria-label={user ? `Account: ${user.name}` : 'Account'}
        >
          <Avatar size="sm">
            {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
            <AvatarFallback>{initials(user?.name)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {user && (
          <>
            <div className="px-2 py-1.5">
              <p className="truncate text-body font-medium text-fg">{user.name}</p>
              <p className="truncate text-small text-fg-tertiary">{user.email}</p>
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={() => void navigate('/profile')}>
          <User /> Profile
          <DropdownMenuShortcut>
            <Shortcut keys="g p" />
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        {isAdmin(me) && (
          <DropdownMenuItem onSelect={() => void navigate('/admin')} data-testid="user-menu-admin">
            <Activity /> Admin
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => void navigate('/settings/appearance')}>
          <Settings /> Settings
          <DropdownMenuShortcut>
            <Shortcut keys="g ," />
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => tour.start()}>
          <Compass /> Show me around
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openSheet('shortcuts')}>
          <Keyboard /> Shortcuts
          <DropdownMenuShortcut>
            <Shortcut keys="?" />
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger data-testid="theme-menu">
            <Sun className="dark:hidden" />
            <Moon className="hidden dark:block" /> Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuLabel>Theme</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={appearance.theme}
              onValueChange={(value) => setAppearance({ theme: value as ThemePref })}
            >
              <DropdownMenuRadioItem value="light">
                <Sun /> Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon /> Dark
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor /> System
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
